# MOD Room — Retro Shared Music Room

**A DOS-era / 80s-90s underground music room. Create or join a shared listening session, queue up tracker modules, MP3s, MIDI, YouTube videos, and more — everyone stays synced.**

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- PostgreSQL (local or Railway)

### Setup

```bash
# Clone the repo
git clone https://github.com/CeresLabX/mod-room.git
cd mod-room

# Install all dependencies
npm run install:all

# Create .env from example
cp .env.example .env
# Edit .env and fill in your DATABASE_URL

# Run the app (dev mode — starts both server and client)
npm run dev
```

The app will be running at **http://localhost:5173**

### Production Build

```bash
# Build the React frontend
cd client && npm run build && cd ..

# Start the server
cd server && npm start
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | `development` | Set to `production` for prod |
| `MAX_UPLOAD_SIZE_MB` | No | `100` | Max upload file size |

---

## How Rooms Work

1. **Create a room** — Enter a nickname, click "Create New Room". You'll get a shareable URL.
2. **Share the URL** — Anyone with the link joins the same room.
3. **Queue media** — Click "Add Media" to upload a file or paste a YouTube URL.
4. **Play together** — The host controls playback. Everyone stays synced.
5. **No account needed** — Just pick a nickname and join.

---

## Supported Formats

### Audio
| Format | Support | Notes |
|--------|---------|-------|
| MP3 | ✅ Full | Browser native |
| WAV | ✅ Full | Browser native |
| OGG | ✅ Full | Browser native |
| MIDI | ⚠️ Partial | Plays via jzz/SoundFont synth — no real instruments |
| MOD/XM/S3M/IT | ⚠️ Partial | Plays via jzz — tracker formats converted to MIDI-like output |
| Other | ❌ | Not supported in browser |

### Video
| Format | Support | Notes |
|--------|---------|-------|
| YouTube | ✅ Full | IFrame embed with sync |
| MP4 (uploaded) | ✅ Full | HTML5 video |
| WebM (uploaded) | ✅ Full | HTML5 video |
| MPEG | ⚠️ | Browser support varies |

---

## Known Limitations

- **MOD/tracker playback** uses jzz which synthesizes to SoundFont — it won't sound like a real Protracker playback, but it plays.
- **MIDI** uses software synthesis (no external SoundFont loading in v1).
- **YouTube sync** is approximate — ±2-3 seconds drift possible.
- **No accounts** — Nicknames only. Rooms persist for 24h of inactivity.
- **No mobile optimization** — Desktop experience recommended.
- **File uploads** stored on server filesystem — not persistent across server restarts unless using Railway persistent volume.

---

## Railway Deployment

### 1. Create a new Railway project

```bash
# Install Railway CLI
curl -fsSL https://railway.new/install.sh | bash
railway login
railway init
```

### 2. Add PostgreSQL

```bash
railway add --service postgresql
# Copy the connection string from the Railway dashboard
```

### 3. Set environment variables

```bash
railway variables set DATABASE_URL="postgresql://..."
railway variables set NODE_ENV="production"
railway variables set MAX_UPLOAD_SIZE_MB="100"
```

### 4. Deploy

```bash
railway up
```

Or connect the GitHub repo in the Railway dashboard for auto-deploys.

### 5. Set the start command

In Railway dashboard → Service → Settings → Start Command:
```
npm start
```

### 6. Mount persistent volume (optional — for uploads)

In Railway dashboard → Service → Volumes → Add Volume.
Mount at `/app/uploads` (or wherever `multer` stores uploads — currently `uploads/` in server directory).

---

## Architecture

```
Browser (React + Vite)
     ↕ HTTP + WebSocket (Socket.IO)
Express Server (Node.js) — port 3001
     ↕
PostgreSQL (Railway)
     ↕
Railway Persistent Volume (uploads/)
```

- **Dev**: Vite dev server proxies `/api` and `/socket.io` to Express on port 3001
- **Prod**: React builds to `server/public/`, Express serves it as static files
- **Sync**: Socket.IO broadcasts playback state to all room members

---

## Tech Stack

- **Frontend**: React 18, Vite, Socket.IO Client, jzz (MIDI/tracker)
- **Backend**: Node.js, Express, Socket.IO, PostgreSQL (pg driver)
- **Styling**: Plain CSS with custom properties, "Press Start 2P" pixel font
- **Database**: PostgreSQL (Railway)
- **Realtime**: Socket.IO WebSocket

---

## Roadmap

### Phase 1 ✅ (MVP)
- [x] Retro DOS UI shell
- [x] Room create/join
- [x] Shared queue
- [x] MP3 upload + playback
- [x] WebSocket sync
- [x] Basic visualizer

### Phase 2
- [ ] YouTube link support
- [ ] MP4/video upload playback
- [ ] Video + visualizer layout
- [ ] Better queue controls

### Phase 3
- [ ] MOD/tracker playback improvements
- [ ] MIDI + external SoundFont
- [ ] Advanced visualizers (oscilloscope, tracker channels)

### Phase 4
- [ ] Activity log / reactions
- [ ] Host controls (kick, mute)
- [ ] Room persistence tuning
- [ ] Public deployment polish

---

## License

Private — Kevin Clark / CeresLabX
