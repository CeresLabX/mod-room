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

MOD Room queue behavior was updated to act like a normal music playlist.

Symptoms fixed:
- Koofr/MOD progress bar appeared stuck around a short static duration such as `0:18`.
- Adding another Koofr song felt like the app only supported one queued item because the picker closed after each add.
- Auto-next/skip treated the queue like a consumable FIFO list and deleted the played row.
- Per-song play control was a tiny ambiguous `[▶]` button with no active state.

Implementation:
- `server/index.js`
  - `next` now advances `rooms.current_item_id` to the next `queue_items` row without deleting the played song.
  - direct `play` validates that the requested queue item belongs to the current room.
  - direct `play` resets `playback_timestamp` to `0` for clean per-track starts.
  - removing the current item now moves playback to a neighboring playlist item or idles the room if none remain.
- `client/src/hooks/useModPlayer.js`
  - `modplayer` worklet is created with `repeat: false` so end-of-song can advance the playlist.
  - MOD duration is estimated by running the Protracker parser/mixer in memory to end-of-song instead of using the old row-count formula.
  - duplicate/stale end callbacks are guarded so a track only advances once.
  - clearing the active item resets MOD status, timer, duration, and worklet node cleanly.
- `client/src/components/AddMediaModal.jsx` + `KoofrBrowser.jsx`
  - Koofr adds pass `keepOpen: true` so the modal remains open for rapid playlist building.
  - Koofr browser shows a confirmation after each add and clears selection for the next song.
- `client/src/components/QueuePanel.jsx` + `client/src/styles/index.css`
  - per-song button now shows `[PLAY]`, `[LOAD]`, or `[NOW]`.
  - active/current item styling is clearer.
- `client/src/components/PlayerPanel.jsx`
  - progress percentage is clamped to `0..100`.
  - local play/pause status is synchronized from the selected player on item/status changes.

Verification:
- Built production assets with `npm run build`.
- Syntax checked `server/index.js` and `server/routes/koofr.js`.
- Pushed Git commit `20f5570 fix: make MOD queue a real playlist` to GitHub `main`.
- Railway auto-deployed and production served new hashed assets.
- Production health check returned `200 OK`.
- Browser smoke test on production created a room, added two Koofr `.mod` files, confirmed the modal stayed open, confirmed two queue rows, saw `[NOW]` on the active item, and verified duration displayed `2:49` instead of the old static `0:18`.

### 2026-05 playlist sync fix

Symptoms fixed:
- Inconsistent playback when moving through playlist songs — sometimes worked, sometimes needed a page refresh.
- Removing a song from the playlist sometimes required a refresh because the X button appeared to do nothing.
- Clicking the per-song `[PLAY]` button in the queue sometimes didn't start playback until the page was refreshed.

Root causes:
- `client/src/hooks/useSocket.js` registered Socket.IO event handlers inside a `useEffect([])` — the handlers were captured from the first render and never updated. `handleQueueUpdated` always saw `currentItem = null` from its closure, which broke the "current item removed" fallback logic.
- `client/src/components/PlayerPanel.jsx` sync effect did not re-run when the local player `status` changed (e.g., from `'loading'` → `'paused'` after `loadItem` finished). When switching tracks while the previous track was playing, the new track loaded but never auto-started because the effect only watched `playback.*` and `item?.id`.
- `client/src/hooks/useAudioPlayer.js` reloaded the audio element on every `queue-updated` event because its load effect depended on `item` (object identity) instead of `item?.id`. Queue updates create new object references for the same tracks, causing unnecessary reloads.
- `client/src/components/RoomView.jsx` `findCurrentItem` fell back to `q[0]` when an `itemId` was not found in the queue. A stale queue could cause the wrong track to load.

Fixes:
- `useSocket.js` now stores handlers in a `handlersRef` and updates it every render, so socket callbacks always invoke the latest handler functions.
- `PlayerPanel.jsx` sync effect dependency array now includes `status`, ensuring `play()` is called when `loadItem` finishes and the server wants the track playing.
- `useAudioPlayer.js` load effect now keys on `item?.id` with an `eslint-disable` for exhaustive-deps, preventing reloads when queue updates swap object references.
- `RoomView.jsx` `findCurrentItem` no longer falls back to `q[0]`; it returns `null` when the requested item is not in the queue.

Verification:
- Built production assets with `npm run build`.
- Syntax checked `server/index.js` and `server/routes/koofr.js`.
- Pushed Git commit `3044911 fix: socket handler staleness, playlist sync, and audio reload bugs` to GitHub `main`.
- Railway auto-deployed and production served new hashed assets (`index-DlNQTGrz.js`).
- Production health check returned `200 OK`.
- Browser smoke test on production verified:
  - Clicked `[PLAY]` on item 2 → item 2 showed `[NOW]`.
  - Clicked `[PLAY]` on item 1 → item 1 showed `[NOW]`.
  - Removed non-current item → queue dropped from 2 to 1.
  - Removed current/last item → queue dropped from 1 to 0.
  - Clicked `[NEXT]` → correctly advanced to the next item.
  - Zero console/page errors.

### 2026-05 multi-user sync + seek fix

Symptoms fixed:
- Non-host users joining a room where music was already playing could see the track but hear nothing — browser autoplay policy blocked AudioContext/audio element playback until user interaction.
- Clicking the progress bar to seek worked locally for the host but did not synchronize to other users in the room.
- No way to skip forward/backward within a track.

Root causes:
- `RoomView.jsx` `onSeekFromServer` only updated `playbackRef.current.timestamp` (a ref) but never called `setPlayback()`. PlayerPanel's sync effect watches `playback.timestamp` state, so remote seek events never triggered `syncTo()` on other users.
- `useModPlayer.js` and `useAudioPlayer.js` did not detect `NotAllowedError` from `AudioContext.resume()` / `audio.play()`. When a non-host user joined mid-playback, `play()` threw, set status to `'error'`, and the user had no recovery UI.
- No skip UI existed.

Fixes:
- `RoomView.jsx`: `onSeekFromServer` now calls `setPlayback(prev => ({ ...prev, timestamp: data.timestamp }))` so the sync effect re-runs and invokes `syncTo()` on all listeners.
- `useModPlayer.js` and `useAudioPlayer.js`: `play()` now catches `NotAllowedError` specifically, sets `autoplayBlocked = true`, and keeps status as `'paused'`. A `clearAutoplayBlocked()` function is exposed.
- `PlayerPanel.jsx`: when `autoplayBlocked` is true, a prominent red "🔇 CLICK TO ENABLE AUDIO" button is shown. Clicking it calls `clearAutoplayBlocked()` and `play()`, which succeeds because user interaction has now occurred.
- `PlayerPanel.jsx`: skip backward (`[⏪ -10s]`) and forward (`[⏩ +10s]`) buttons added for all users. They call `seek(time)` locally and `onSeek(time)` to broadcast to the room. Disabled for MOD files since the modplayer worklet does not support seeking.
- `PlayerPanel.jsx`: a note "ⓘ Seeking not supported for tracker modules" is shown below the progress bar when a MOD file is active.

Verification:
- Built production assets with `npm run build`.
- Syntax checked `server/index.js` and `server/routes/koofr.js`.
- Pushed Git commit `4fd542b fix: multi-user sync, autoplay unblock, seek sync, and skip buttons` to GitHub `main`.
- Railway auto-deployed and production served new hashed assets (`index-CdEYp2tt.js`).
- Production health check returned `200 OK`.
- Browser multi-user test on production verified:
  - Host created room, guest joined via room code.
  - Host added Koofr `2little.mod`; guest saw 1 queue item within seconds.
  - Guest track title showed `2little.mod`; status showed `▶ SYNCED TO ROOM`.
  - Host progress advanced from `0:06` to `0:09` over 3 seconds.
  - Host clicked progress bar to seek; guest progress updated from `0:10` to `0:12` (sync working).
  - MOD seeking note visible below progress bar.
  - Zero console/page errors.

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
