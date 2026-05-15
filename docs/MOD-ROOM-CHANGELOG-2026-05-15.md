# Mod Room Changelog — 2026-05-15 Production Library + Playback Stabilization

## Context
Kevin reported a chain of production issues in Mod Room:

1. Library rows showed `ADDING...` but tracks did not reliably appear.
2. Some browser sessions showed Socket.IO/WebSocket errors.
3. Added tracks sometimes appeared only temporarily or disappeared on refresh.
4. MOD files began playing, but:
   - Next initially did not advance.
   - Refresh showed an empty playlist until another track was added.
   - Clicking another playlist track did not play it.
   - Pause and Stop behaved the same.
   - The UI did not reliably show a Play button after pausing.
   - The time/progress bar continued to advance while paused.

## Confirmed Architecture

The Mod Room library is connected to Koofr via **WebDAV**, not Railway object storage.

Production library/file flow:

- WebDAV base: Koofr DAV endpoint
- App root: `/Vectrix/public`
- Library index: recursive WebDAV walk into Postgres-backed `music_library_index`
- Playback proxy: `/api/library/file?relativePath=...`
- File fetch mode: binary-safe streaming / `arrayBuffer()`, not text

Verified production WebDAV proxy returned a playable XM sample as:

- HTTP `200`
- Content-Type `audio/x-xm`

## Reindex

Production library reindex completed after Railway env refresh/redeploy:

- folders: `101`
- files: `75,501`
- playable: `74,010`
- skipped: `1,491`

## Commits Applied

### `040d676` — `fix: use polling fallback and visible library add state`

- Changed Socket.IO client to start with HTTP polling and then upgrade to WebSocket.
- Added visible Add state in the library browser:
  - row shows `⏳ ADDING...`
  - other file rows dim while one add is in progress
  - duplicate clicks are ignored while pending

### `fbd6dc7` — `fix: tolerate websocket probe failures during add`

- Added `tryAllTransports: true` to Socket.IO client.
- Changed reconnect logic so an initial `connect_error` / WebSocket probe failure does not immediately fail Add.
- The client now waits for fallback/retry before surfacing a reconnect failure.

### `dcb3321` — `fix: add HTTP queue fallback for library adds`

- Added `POST /api/rooms/:roomId/queue` HTTP endpoint.
- Endpoint inserts queue items into Postgres, updates idle playback state, returns `{ ok, itemId, queue }`, and broadcasts over Socket.IO when available.
- Client fell back to HTTP queue-add if Socket.IO ACK timed out/failed.

### `bd08c4a` — `fix: make library add HTTP-first and hydrate playback`

- Changed Library Add to use the HTTP queue endpoint as the source-of-truth immediately instead of waiting on Socket.IO first.
- Hydrated local playback/current-item state from the HTTP response so the track appears and can play even if a Socket.IO broadcast is missed.
- Fixed room-code route order so `/api/rooms/code/:code` is not captured by the dynamic `/:roomId` route.

### `3a04b3c` — `fix: hydrate room on refresh and make next reliable`

- Added HTTP room snapshot fallback on room page load/refresh.
- `GET /api/rooms/:roomId` now accepts either canonical UUID or human room code.
- Added `POST /api/rooms/:roomId/next` HTTP endpoint.
- Changed Next / track-ended behavior to use the HTTP endpoint first, with Socket.IO fallback.
- Fixed refresh issue where the playlist could look empty until another track was added.

### `d8df6dd` — `fix: reliable playback controls`

- Added reliable HTTP playback control endpoints:
  - `POST /api/rooms/:roomId/play`
  - `POST /api/rooms/:roomId/pause`
  - `POST /api/rooms/:roomId/stop`
- Clicking a queue item now uses HTTP `/play` first, then Socket.IO fallback.
- Main Play button now uses HTTP `/play` first.
- Pause now persists the exact paused timestamp server-side.
- Stop now resets timestamp to `0` while keeping the current item loaded, so Play can resume from the beginning.
- UI Stop no longer calls Pause internally.
- Player controls now decide Play/Pause display from authoritative playback state instead of only local hook status.
- Paused progress no longer continues advancing server-side.

## Production Deployments Verified

Relevant successful Railway deployments:

- `fde4b192-892b-4acb-a012-d7baaf15b7ed` — polling fallback / visible Add state
- `24b3f0ff-2eff-4bf9-b42c-701ddb9e7635` — HTTP queue fallback
- `fd1c467b-842d-405e-a118-9edd4b0aac48` — HTTP-first Add + playback hydration
- `c89785b7-0a12-4964-a8c7-d663a5321212` — refresh hydration + reliable Next
- `e2266e8f-93dc-4e71-b4c6-62dde8cdd77a` — reliable playback controls

Health endpoint returned HTTP `200` after deployments.

## Production Verification Performed

### Library / WebDAV

- Production `/api/library/file?...` fetched tracker file successfully.
- Worklet assets loaded:
  - `chiptune3.worklet-*.js`
  - `libopenmpt.worklet.js`

### Add / Refresh

Verified in production:

- Add track by room code succeeds.
- Add returns queue and current playback state.
- Refresh/rejoin by room code preserves queue.
- HTTP snapshot returns queued tracks without needing another add.

### Next

Verified in production:

- Add two tracks.
- `POST /api/rooms/:roomId/next` advances current item to track 2.
- Socket rejoin sees queue length 2 and current track 2.

### Play / Pause / Stop

Verified in production:

- `POST /api/rooms/:roomId/play` can play a selected queued track.
- `POST /api/rooms/:roomId/pause` pauses and freezes timestamp.
- After waiting while paused, HTTP room snapshot still reports the same timestamp.
- `POST /api/rooms/:roomId/stop` resets timestamp to `0` while preserving current item.
- Resume after Stop plays the same current item from `0`.

## Current Design Decision

Mod Room now treats HTTP endpoints as the reliable mutation/source-of-truth path for room and playback changes:

- Add
- Next
- Play selected queue item
- Pause
- Stop

Socket.IO remains responsible for live multi-user broadcasts and real-time sync, but a stale or partially reconnected socket should no longer make core controls silently fail.

## Files Changed Most Significantly

- `client/src/components/RoomView.jsx`
  - HTTP-first Add/Next/Play/Pause/Stop control flow
  - HTTP snapshot hydration on refresh
  - local playback hydration from HTTP responses

- `client/src/components/PlayerPanel.jsx`
  - reliable Play/Pause/Stop button behavior
  - Stop is now distinct from Pause

- `server/routes/rooms.js`
  - HTTP queue endpoint
  - HTTP next endpoint
  - HTTP play/pause/stop endpoints
  - room-code-aware room snapshot route

- `client/src/hooks/useSocket.js`
  - polling-first Socket.IO with WebSocket upgrade and transport fallback

- `server/public/assets/*`
  - rebuilt production client bundles

## Notes / Follow-up

- Hard refresh is recommended after each deployment because stale Vite bundles can preserve old client behavior.
- Socket.IO is still used and should continue to be monitored, but core room mutations are no longer socket-only.
- Further browser-level QA should focus on multi-user synchronization after HTTP control changes.
