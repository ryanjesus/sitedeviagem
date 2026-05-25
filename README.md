# 🏍️ RolêMoto

> **Clima pra estrada · Café pra alma**

App de previsão do tempo para motociclistas brasileiros. Indica automaticamente as melhores cidades para rodar no dia, com score climático, previsão horária, destinos turísticos e mapa integrado.

---

## Páginas

| Rota | Descrição |
|---|---|
| `/` | **Início** — melhor destino de SP para hoje, selecionado automaticamente |
| `/clima` | **Clima** — busca por estado e dia, ranking de cidades, favoritos |
| `/recomendados.html` | **Recomendados** — 49 destinos turísticos estáticos em 15 estados |

---

## Stack

- **Backend:** Node.js + Express
- **API de clima:** [WeatherAPI.com](https://www.weatherapi.com/)
- **Frontend:** HTML + CSS + JavaScript (sem frameworks)
- **Cache:** arquivos JSON por data em `cache/` (gerado em runtime)

---

## Instalação local

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/rolemoto.git
cd rolemoto
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` e preencha com sua chave da WeatherAPI:

```
WEATHERAPI_KEY=sua_chave_aqui
PORT=3000
```

> Obtenha uma chave gratuita em [weatherapi.com](https://www.weatherapi.com/)

### 4. Inicie o servidor

```bash
# Produção
npm start

# Desenvolvimento (auto-reload)
npm run dev
```

Acesse em: `http://localhost:3000`

---

## Estrutura do projeto

```
rolemoto/
├── public/
│   ├── home.html          # Página inicial — melhor destino do dia
│   ├── clima.html         # Aba Clima — busca por estado
│   └── recomendados.html  # Destinos turísticos estáticos
├── cache/                 # Cache de previsão por data (gerado em runtime)
├── .env                   # Variáveis de ambiente (NÃO commitar)
├── .env.example           # Template do .env
├── server.js              # Servidor Express + proxy da API + cache
├── package.json
└── README.md
```

---

## Deploy no Render

1. Suba o projeto no GitHub (sem o `.env`)
2. Acesse [render.com](https://render.com) e crie um **Web Service**
3. Conecte o repositório
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Em **Environment Variables**, adicione:
   - `WEATHERAPI_KEY` = sua chave real
6. Clique em **Deploy**

---

## Rolê Score (0–100)

Cada cidade recebe uma pontuação baseada nas condições do dia:

| Condição | Pontos |
|---|---|
| ☀️ Céu aberto | +40 |
| 🌡️ Temperatura ideal (20–30 °C) | +30 |
| 🌧️ Sem chuva | +20 |
| 💨 Vento fraco (< 25 km/h) | +10 |
| ⛈️ Chuva / tempestade | −20 a −50 |

---

## Segurança

- A chave da WeatherAPI fica **exclusivamente no servidor** — nunca exposta no frontend
- Nenhum dado pessoal é coletado
- Preferências do usuário (tema, favoritos) ficam apenas no `localStorage` do navegador

---

## Autor

**Ryan Oliveira** — [ryanoliveira.vm@gmail.com](mailto:ryanoliveira.vm@gmail.com)
