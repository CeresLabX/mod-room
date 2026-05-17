# MOD Room Changelog — 2026-05-17

## Changes

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
