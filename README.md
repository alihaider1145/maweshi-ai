# Maweshi AI (مویشی AI)

**Maweshi AI** is an AI-powered livestock health monitoring website and can also give advice on crossbreeding based on the purpose of the farmers. It also connects you to a suitable veterinarian to provide further clarity to the farmer.

---

## Features

| Capability | Module | Description |
| :--- | :--- | :--- |
| **AI Disease Detection** | `AI / Vision` | Upload images to the web application allowing AI to identify diseases and possible health conditions through visible symptoms. |
| **Vet Consultation** | `Tele-Health` | Connects farmers directly to veterinarians via phone calls for guidance when additional diagnosis or action is required. |
| **Crossbreeding Guide** | `Genetics` | Helps farmers make informed cattle breeding decisions by entering livestock details and primary purpose to preview expected traits. |
| **Multilingual Support** | `Accessibility` | Complete voice and text support across Urdu, Pashto, Punjabi, Sindhi, and Saraiki to cater to local farming communities across Pakistan. |

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | HTML5, CSS3, vanilla JavaScript (RTL layout) |
| Backend | Netlify Functions (Node.js 18+) |
| AI | Google Gemini API (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`) |
| Voice output | Google Translate TTS, with Web Speech API fallback |
| Libraries | [marked](https://github.com/markedjs/marked) (CDN), Google Fonts (CDN) |
| Hosting | Netlify |

---

## Repository Structure

```text
maweshi-ai/
├── netlify/functions
│   ├── analyze-injury.js      # Serverless function for Gemini visual disease analysis
│   └── recommend-breeding.js  # Serverless function for breeding recommendation logic
├── public/
│   └── favicon.ico                # Application favicon
├── src/
│   ├── css/
│   │   └── style.css              # Main application styling
│   ├── js/
│   │   ├── api.js                 # API handler for Netlify endpoints
│   │   ├── app.js                 # Core frontend application logic
│   │   └── audio.js               # Voice/Audio recording and playback handler
│   └── index.html                 # Main application landing page
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore file
├── netlify.toml                   # Netlify configuration and redirects setup
├── package.json                   # Node.js dependencies and script definitions
└── README.md                      # Project documentation
```
---

## Getting Started

**Prerequisites:** 

- Node.js 18+

- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm install -g netlify-cli`) 

- [Gemini API key](https://aistudio.google.com/apikey).

**Run locally:** 

```bash
git clone https://github.com/alihaider1145/maweshi-ai.git
cd maweshi-ai
cp .env.example .env      # then add your GEMINI_API_KEY
npm start                 # runs `netlify dev`
```

---

## How It Works

1. The browser builds a prompt (including the selected language) and sends it to `/api/analyze-injury` or `/api/recommend-breeding`.
2. `netlify.toml` rewrites `/api/*` to `/.netlify/functions/*`.
3. The serverless function adds the API key and calls Gemini, trying the primary model first and falling back to the lighter model on failure.
4. The response is rendered as Markdown in the page, and can be played back as audio.

The API key is never exposed to the client.
