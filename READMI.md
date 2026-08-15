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

## 🚀 Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   MONGO_URI=mongodb://localhost:27017/lichess_ai_coach
   PORT=3000
   ENCRYPTION_KEY=your_very_secure_encryption_key
   IS_BOT_ACTIVE=false
   ```

   `IS_BOT_ACTIVE` is required. If it is `false`, the app runs only as a REST API server and skips the Telegram bot and MongoDB connection. If it is `true`, both the bot and MongoDB must be configured correctly.

3. Start the backend:

   ```bash
   npm run dev
   ```

   Or for production:

   ```bash
   npm start
   ```

4. Load the extension:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `extension/` folder, or install the packaged release from the GitHub Releases page

5. Configure the extension:
   - Open the extension popup
   - Paste your Gemini API key
   - Set the backend URL if needed (`http://localhost:3000` by default)
   - Save the settings

6. Open Lichess and start a game:
   - The live analysis widget should appear automatically.

---

## 🔐 Environment variables

Required variables for the backend:

- `TELEGRAM_BOT_TOKEN` — Telegram bot token for the bot UI and game tracking
- `MONGO_URI` — MongoDB connection string
- `PORT` — backend port
- `ENCRYPTION_KEY` — encryption key for storing sensitive data
- `IS_BOT_ACTIVE` — required startup flag that turns the bot and MongoDB initialization on or off

If you do not run the Telegram bot, set:

```env
IS_BOT_ACTIVE=false
```

This keeps the REST API server running while disabling the bot and skipping MongoDB connection.
