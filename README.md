# ♟️ Lichess AI Coach

**Lichess AI Coach** is an intelligent assistant for the Lichess chess platform that runs as a Chrome extension and a local Docker backend. It analyzes moves in real time using the local **Stockfish** engine and generated coaching comments from **Google Gemini AI**.

---

## 🛠 Tech stack

### Backend (REST API Server)

- **Node.js** & **Express** — server-side handling of requests from the extension.
- **Stockfish Engine** — local chess engine for fast and accurate FEN evaluation and position scoring (CP / Mate).
- **Chess.js** — move validation, board simulation, and reconstruction of game history.
- **@google/genai** — integration with the gemini and gemma models for short coaching suggestions.
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

   This token must be inserted into the Telegram bot together with the Gemini API key. As a ready-made example bot, you can try `@lichess_api_learning_bot`.

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
   - Verify or update the backend URL, the default backend server is `https://lichess-coach.onrender.com`, but you can change it to your own
   - Save the settings
   - For the browser extension, the default backend server is `https://lichess-coach.onrender.com`.

7. Configure the telegram bot:
   - When using the Telegram bot, you must also provide a Lichess API token with the required permissions: `challenge:read` and `board:play`
   - This token must be inserted into the bot together with the Gemini API key. A sample bot for testing is `@lichess_api_learning_bot`
   - The Lichess token is displayed only once. If it is not saved immediately, a new token must be generated

8. Open Lichess and start a game—a floating analysis widget should appear to process the moves, and you'll receive notifications from the bot.
