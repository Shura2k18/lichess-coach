FROM node:20-slim

# Install stockfish and create symlink in /usr/bin
RUN apt-get update && apt-get install -y stockfish && \
    ln -s /usr/games/stockfish /usr/bin/stockfish && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]