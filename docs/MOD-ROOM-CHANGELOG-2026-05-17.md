# MOD Room Changelog — 2026-05-17

## Changes

### Real-Time Text Chat

Added real-time text chat functionality to rooms. Users can now send text messages that appear in the activity log for all room members.

**Files changed:**
- `server/index.js` — Added `chat-message` socket handler that sanitizes and broadcasts messages to all users in the room
- `client/src/components/RoomView.jsx` — Added chat input bar with text input and SEND button, chat message handler
- `client/src/styles/index.css` — Added styles for `.chat-input-bar`, `.chat-input`, and `.activity-entry.chat`

**Features:**
- Messages limited to 500 characters
- Server-side sanitization for safety
- Chat messages displayed in activity log with accent color
- Integrated with existing Socket.IO infrastructure

---

### WEBDAV_ROOT_PATH Unified to /Vectrix/mod
**Files changed:**
- `server/routes/koofr.js` — Updated `WEBDAV_ROOT_PATH` default from `/Vectrix/public/music/mod` to `/Vectrix/mod`
- `.env.example` — Updated `WEBDAV_ROOT_PATH` default to `/Vectrix/mod`
- `README.md` — Updated Environment Variables table and Railway Deployment section

---

### Documentation Updates

Added `WEBDAV_ROOT_PATH` environment variable to project documentation for consistency:

**Files changed:**
- `.env.example` — Added `WEBDAV_ROOT_PATH` with default `/Vectrix/public/music/mod`
- `README.md` — Added `WEBDAV_ROOT_PATH` to Environment Variables table
- `README.md` — Added Koofr environment variables to Railway Deployment section

---

## Previous Changes

### Library WebDAV Root Path Update

The Library route WebDAV root path is now configured to `/Vectrix/mod` to align with the new Koofr structure.

**Previous behavior:**
- `KOOFR_ROOT` was set to `/Vectrix/public` in `server/routes/library.js`
- Library browser would list files from `/Vectrix/public/`

**New behavior:**
- `WEBDAV_ROOT_PATH` default updated to `/Vectrix/mod`
- Library now points directly to the `/Vectrix/mod/` folder
- Aligns with the Koofr `/Vectrix` root structure

**Files changed:**
- `server/routes/library.js` — Updated `WEBDAV_ROOT_PATH` default from `/Vectrix/public` to `/Vectrix/mod`

---

### Koofr WebDAV Root Path Update

The Koofr WebDAV root path is now configurable via the `WEBDAV_ROOT_PATH` environment variable instead of being hardcoded.

**Previous behavior:**
- `KOOFR_ROOT` was hardcoded to `/Vectrix/public` in `server/routes/koofr.js`
- The Koofr browser would list all files in `/Vectrix/public/`

**New behavior:**
- `KOOFR_ROOT` now reads from `WEBDAV_ROOT_PATH` environment variable
- Default value: `/Vectrix/public/music/mod`
- The Koofr browser now directly points to the MOD folder: `/Vectrix/public/music/mod/`
- Users don't need to navigate into the `/public/music/mod/` subdirectory

**Files changed:**
- `server/routes/koofr.js` — Updated to use `WEBDAV_ROOT_PATH` env variable with fallback to `/Vectrix/public/music/mod`

**Railway deployment:**
- `WEBDAV_ROOT_PATH` variable updated to `/Vectrix/public/music/mod`
- Deployment `7a277a98-b867-4eca-a8b3-1df9cbe39260` deployed successfully

## Verification

- [x] Client build completed successfully
- [x] Railway deployment succeeded
- [x] Railway `WEBDAV_ROOT_PATH` variable updated to `/Vectrix/public/music/mod`
