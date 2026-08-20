# ♟️ Lichess AI Coach

**Lichess AI Coach** is an intelligent assistant for the Lichess chess platform that runs as a Chrome extension and a local Docker backend. It analyzes moves in real time using the local **Stockfish** engine and generated coaching comments from **Google Gemini AI**.

---

## 🛠 Tech stack

### Backend (REST API Server)

- **Node.js** & **Express** — server-side handling of requests from the extension.
- **Stockfish Engine** — local chess engine for fast and accurate FEN evaluation and position scoring (CP / Mate).
- **Chess.js** — move validation, board simulation, and reconstruction of game history.
- **@google/generative-ai** — integration with the `gemini-3.1-flash-lite` model for short coaching suggestions.
- **MongoDB** — database for storing system logs and analytics.
- **Docker & Docker Compose** — isolated deployment environment with the Stockfish binary.

### Frontend (Chrome Extension)

- **JavaScript (ES6+)** — custom content script that reads the Lichess DOM.
- **Chrome Storage API** — safe storage for widget geometry, toggle state, API key, and user preferences.
- **CSS3** — floating interactive widget with drag-and-drop and resize support.

---

## 🚀 Quick Start (Docker Compose)

This project is intended to be run with Docker Compose. Use the steps below for a Docker-first workflow.

1. Install Docker and Docker Compose (or Docker Desktop which includes Compose).

2. In the project root create a `.env` file with required values (example below):

   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   MONGO_URI=mongodb://mongo:27017/lichess_ai_coach
   PORT=3000
   ENCRYPTION_KEY=your_very_secure_encryption_key
   IS_BOT_ACTIVE=false
   ```

   Note: `IS_BOT_ACTIVE` is required. When set to `false` the containers start the REST API server only and skip MongoDB/bot setup; when `true` the bot and MongoDB containers are expected to run and the bot will start.

   If you plan to use the Telegram bot, you also need a Lichess personal API token. When creating it in Lichess, enable the permissions:
   - `challenge:read`
   - `board:play`

   Warning: the Lichess token is displayed only once. If you do not save it immediately, you will need to create a new token.

3. Start the stack:

   ```bash
   docker compose up -d --build
   ```

4. Check logs and status:

   ```bash
   docker compose logs -f
   docker compose ps
   ```

   The backend API will be available at `http://localhost:3000` (or whatever `PORT` you set).

5. Load the browser extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `extension/` folder
   - Alternatively, download the packaged release from the project's GitHub Releases and install it

6. Configure the extension popup:
   - Open the extension popup
   - Paste your Gemini API key
   - Verify or update the backend URL (`http://localhost:3000` by default)
   - Save the settings

7. Open Lichess and start a game — the floating analysis widget should appear and process moves.

---

---

## 🔐 Environment variables

Required variables for the backend:

- `TELEGRAM_BOT_TOKEN` — Telegram bot token for the bot UI and game tracking
- `MONGO_URI` — MongoDB connection string
- `PORT` — backend port
- `ENCRYPTION_KEY` — encryption key for storing sensitive data
- `IS_BOT_ACTIVE` — required startup flag that turns the bot and MongoDB initialization on or off

When using the Telegram bot, you must also provide a Lichess API token with the required permissions:
- `challenge:read`
- `board:play`

The Lichess token is displayed only once. If it is not saved immediately, a new token must be generated.

If you do not run the Telegram bot, set:

```env
IS_BOT_ACTIVE=false
```

This keeps the REST API server running while disabling the bot and skipping MongoDB connection.
