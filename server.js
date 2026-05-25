require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = process.env.PORT || 3000;
const API_KEY  = process.env.WEATHERAPI_KEY;
const CACHE_DIR = path.join(__dirname, 'cache');

if (!API_KEY) {
  console.error('Erro: defina WEATHERAPI_KEY no arquivo .env');
  process.exit(1);
}

// ── Utilitários de data ───────────────────────────────────────────────────────
// Sempre no fuso horário de Brasília para que "hoje" bata com o que o usuário vê.

function dateStr(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  // en-CA retorna YYYY-MM-DD
}

function targetDates(daysCount) {
  return Array.from({ length: daysCount }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return dateStr(d);
  });
}

// ── Cache em disco: um JSON por dia ──────────────────────────────────────────
// Estrutura de cada arquivo:
// {
//   "date": "2026-05-24",
//   "cachedAt": "2026-05-24T10:00:00.000Z",
//   "cities": {
//     "santos, são paulo, brazil": { "location": {...}, "forecastday": {...} }
//   }
// }

// Camada de memória para evitar leituras repetidas de disco durante um burst de
// requisições paralelas (ex: 113 cidades do panorama nacional).
const memCache = new Map(); // dateStr → objeto do arquivo

function cachePath(date) {
  return path.join(CACHE_DIR, `${date}.json`);
}

function readDayFile(date) {
  if (memCache.has(date)) return memCache.get(date);
  try {
    const obj = JSON.parse(fs.readFileSync(cachePath(date), 'utf8'));
    memCache.set(date, obj);
    return obj;
  } catch {
    return null;
  }
}

function writeDayFile(date, obj) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(date), JSON.stringify(obj, null, 2), 'utf8');
    memCache.set(date, obj);
  } catch(e) {
    console.error(`[CACHE] Erro ao gravar ${date}.json:`, e.message);
  }
}

function getCityEntry(date, cityKey) {
  const entry = readDayFile(date)?.cities?.[cityKey] ?? null;
  if (!entry) return null;
  // Rejeita entradas cacheadas em um dia anterior: previsões ficam mais
  // precisas conforme a data se aproxima, então forçamos 1 refresh por dia.
  const cachedOn = entry.cachedAt?.slice(0, 10);
  if (!cachedOn || cachedOn < dateStr()) return null;
  return entry;
}

// Lê → atualiza → escreve (seguro porque fs.*Sync bloqueia o event loop:
// chamadas concorrentes de async/await são serializadas aqui)
function setCityEntry(date, cityKey, entry) {
  const file = readDayFile(date) ?? {
    date,
    cachedAt: new Date().toISOString(),
    cities: {}
  };
  file.cities[cityKey] = { ...entry, cachedAt: new Date().toISOString() };
  writeDayFile(date, file);
}

// ── Limpeza de arquivos expirados ─────────────────────────────────────────────
function cleanupExpiredFiles() {
  try {
    if (!fs.existsSync(CACHE_DIR)) { console.log('[CACHE] Diretório ainda não existe.'); return; }
    const today = dateStr();
    const removed = [];
    for (const f of fs.readdirSync(CACHE_DIR)) {
      if (!f.endsWith('.json')) continue;
      if (f.slice(0, 10) < today) {
        fs.unlinkSync(path.join(CACHE_DIR, f));
        removed.push(f);
      }
    }
    console.log(removed.length
      ? `[CACHE] Arquivos expirados removidos: ${removed.join(', ')}`
      : '[CACHE] Nenhum arquivo expirado.');
  } catch(e) {
    console.error('[CACHE] Erro na limpeza:', e.message);
  }
}

// ── Proxy de previsão (forecast) com cache por data ───────────────────────────
async function proxyForecast(city, daysRequested, res) {
  const cityKey = city.toLowerCase().trim();
  const dates   = targetDates(daysRequested);

  // Verificar se todos os dias solicitados já estão em cache
  const entries = dates.map(d => getCityEntry(d, cityKey));

  if (entries.every(Boolean)) {
    console.log(`[CACHE HIT] ${city} / ${daysRequested} dia(s)`);
    return res.json({
      location: entries[0].location,
      forecast: { forecastday: entries.map(e => e.forecastday) },
    });
  }

  // Faz uma única chamada com days=8 para popular TODOS os dias de uma vez.
  // Na próxima requisição, qualquer dia de 0-7 já vem do cache.
  console.log(`[API CALL] ${city}`);
  const qs  = new URLSearchParams({ key: API_KEY, lang: 'pt', q: city, days: 8 });
  const url = `https://api.weatherapi.com/v1/forecast.json?${qs}`;

  try {
    const r    = await fetch(url);
    const data = await r.json();

    if (r.ok && data.forecast?.forecastday) {
      for (const dayData of data.forecast.forecastday) {
        // dayData.date já vem no formato YYYY-MM-DD da WeatherAPI
        setCityEntry(dayData.date, cityKey, {
          location:    data.location,
          forecastday: dayData,
        });
      }
    }

    // Retorna apenas os dias que o front-end pediu (slice)
    res.status(r.ok ? 200 : r.status).json({
      ...data,
      forecast: {
        forecastday: (data.forecast?.forecastday ?? []).slice(0, daysRequested),
      },
    });
  } catch {
    res.status(502).json({ error: 'Erro ao consultar WeatherAPI' });
  }
}

// ── Proxy de clima atual (cache em memória, 30 min) ───────────────────────────
const currentMem = new Map();
const CURRENT_TTL = 30 * 60 * 1000;

async function proxyCurrent(city, res) {
  const key   = city.toLowerCase().trim();
  const entry = currentMem.get(key);
  if (entry && Date.now() - entry.ts < CURRENT_TTL) return res.json(entry.data);

  const qs  = new URLSearchParams({ key: API_KEY, lang: 'pt', q: city });
  const url = `https://api.weatherapi.com/v1/current.json?${qs}`;
  try {
    const r    = await fetch(url);
    const data = await r.json();
    if (r.ok) currentMem.set(key, { data, ts: Date.now() });
    res.status(r.ok ? 200 : r.status).json(data);
  } catch {
    res.status(502).json({ error: 'Erro ao consultar WeatherAPI' });
  }
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'home.html'))
);

app.get('/clima', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'clima.html'))
);

app.get('/api/weather/current', (req, res) => {
  if (!req.query.q) return res.status(400).json({ error: 'Parâmetro q obrigatório' });
  proxyCurrent(req.query.q, res);
});

app.get('/api/weather/forecast', (req, res) => {
  if (!req.query.q) return res.status(400).json({ error: 'Parâmetro q obrigatório' });
  proxyForecast(req.query.q, parseInt(req.query.days) || 2, res);
});

// ── Inicialização ─────────────────────────────────────────────────────────────
cleanupExpiredFiles();

app.listen(PORT, () => {
  console.log(`RolêMoto rodando em http://localhost:${PORT}`);
  console.log(`Cache de previsão: ${CACHE_DIR}`);
});
