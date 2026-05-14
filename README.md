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
| `KOOFR_EMAIL` | No | — | Koofr account email for WebDAV |
| `KOOFR_PASSWORD` | No | — | Koofr WebDAV app password/token. Do **not** commit this value. |

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
| MP3 | ✅ Full | Browser native HTML5 Audio |
| WAV | ✅ Full | Browser native |
| OGG | ✅ Full | Browser native |
| MIDI | ⚠️ Partial | Plays via jzz/SoundFont synth |
| MOD/XM/S3M/IT | ✅ Full | Plays via `modplayer` AudioWorklet (Protracker engine) — browse from Koofr |

### Video
| Format | Support | Notes |
|--------|---------|-------|
| YouTube | ✅ Full | IFrame embed with sync |
| MP4 (uploaded) | ✅ Full | HTML5 video |
| WebM (uploaded) | ✅ Full | HTML5 video |
| MPEG | ⚠️ | Browser support varies |

---

## Koofr MOD Playback

MOD Room can browse and stream tracker files directly from Koofr through the server-side WebDAV proxy.

- Default Koofr folder: `/public/music/mod/`
- Browser endpoint: `GET /api/koofr/list?path=/public/music/mod`
- File proxy endpoint: `GET /api/koofr/file?path=/public/music/mod/<file.mod>`
- The proxy keeps credentials server-side and adds CORS-safe headers for browser playback.
- Koofr file streams are bounded with a timeout so an upstream stall does not wedge the app.
- Tracker playback uses `useModPlayer.js` + `modplayer` AudioWorklet. Play/pause is controlled by `AudioContext.resume()` / `AudioContext.suspend()`.

### 2026-05 Koofr/MOD crash fix

A production crash/hang was fixed where loading a Koofr `.mod` file and pressing play could wedge the Railway service until restart.

Key fixes:
- Hydrate the current queue item after `queue-updated` / `playback-update` races.
- Avoid double-loading items in `PlayerPanel`.
- Use AudioContext resume/suspend for MOD playback instead of nonexistent `start/pause/stop` worklet methods.
- Add timeout/backpressure handling to `/api/koofr/file`.
- Wrap the socket `play` handler so playback DB/socket errors return an error message instead of killing the process.

Verified against Koofr file `2little.mod` on production: the file loads, appears as now playing, timer advances, and the service health remains OK.


### 2026-05 playlist/timing fix

MOD Room queue behavior was updated to act like a normal playlist:
- Skip/auto-next now advances the current item pointer instead of deleting the played song.
- Koofr picker stays open after adding a file so multiple songs can be queued quickly.
- Per-song play buttons show `[PLAY]`, `[LOAD]`, or `[NOW]` with clearer active styling.
- MOD duration is estimated by simulating the Protracker engine to end-of-song, so the progress bar sizes per track instead of using a static row-count estimate.

---

## Known Limitations

- **MOD/tracker playback** uses `modplayer` AudioWorklet — Protracker engine compiled to WebAssembly via AudioWorklet. Seeking by pattern/row is not implemented yet.
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

- **Frontend**: React 18, Vite, Socket.IO Client, `modplayer` (AudioWorklet), jzz (MIDI)
- **Backend**: Node.js, Express, Socket.IO, PostgreSQL (pg driver)
- **Media Storage**: Koofr WebDAV (persistent) + Railway filesystem (ephemeral uploads)
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
- [x] YouTube link support
- [ ] MP4/video upload playback (ephemeral — files lost on redeploy)
- [ ] Video + visualizer layout
- [ ] Better queue controls

### Phase 3
- [x] MOD/tracker playback via AudioWorklet
- [ ] MOD seeking (pattern/row seeking)
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
