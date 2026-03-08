# Chess App ♟️

Real-time chess game with Telegram integration and ELO rankings.

## Features

- ✅ Playable chess board (drag & drop)
- ✅ Move validation
- ✅ Check/Checkmate detection
- ✅ Turn-based gameplay with Telegram notifications
- ✅ ELO ranking system
- ✅ Game history
- ✅ Play against anyone in the group

## Tech Stack

- **Frontend:** React + Vite + chessboard.js
- **Backend:** Node.js + Express + Socket.io
- **Database:** Supabase (PostgreSQL)
- **Auth:** Telegram ID
- **Hosting:** Docker on VPS

## Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build
```

## Environment Variables

```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# Telegram Bot
TELEGRAM_BOT_TOKEN=xxx

# Server
PORT=3000
```

## License

MIT
