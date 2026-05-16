# Mod Room Changelog — 2026-05-16 Retro Visualizer Suite

## Summary

Added a full retro/DOS/MOD-inspired visualizer suite with **10 total visualizers** (up from 3). Users can now switch between visualizers mid-playback using a persistent dropdown selector. All visualizers react to the Web Audio API analyser when available and fall back to ambient animation for playback engines that don't expose analyser data.

## New Visualizers

| # | ID | Name | Style |
|---|-----|------|-------|
| 1 | `spectrum` | Spectrum Bars | Classic tracker-style vertical frequency bars (existing, retained) |
| 2 | `scope` | Oscilloscope | Retro waveform scope (existing, retained) |
| 3 | `tracker` | Tracker Meters | 8-channel MOD tracker level meters (existing, retained) |
| 4 | `starfield` | Starfield Pulse | DOS demo-scene starfield — stars pulse/stretch with bass |
| 5 | `vu-meters` | VU Meter Deck | Left/right retro stereo VU meters with peak hold |
| 6 | `neon-tunnel` | Neon Tunnel | Retro 3D wireframe tunnel reacting to beat/volume |
| 7 | `plasma` | Plasma Field | Old-school Amiga demo-scene plasma, low-res pixel style |
| 8 | `pixel-eq` | Pixel Equalizer | Chunky DOS/VGA block equalizer with shine effects |
| 9 | `piano-roll` | Piano Roll | Falling MIDI-style note blocks with lane structure |
| 10 | `matrix-rain` | Matrix Rain | Falling green characters, tracker symbols, speed reacts to music |

## Architecture

```
client/src/visualizers/
  registry.js          — visualizer ID/name/description registry
  StarfieldPulse.jsx  — starfield with bass-reactive stretch
  VUMeterDeck.jsx     — left/right VU meters with peak hold
  NeonTunnel.jsx      — 3D wireframe tunnel (pure canvas, no libs)
  PlasmaField.jsx     — low-res plasma on offscreen canvas
  PixelEqualizer.jsx   — chunky block equalizer
  PianoRoll.jsx       — falling note blocks
  MatrixRain.jsx       — character rain with tracker symbols
```

**Lazy loading**: Each new visualizer is a separate Vite chunk (~2–3 KB gzipped). They are only loaded when selected, keeping the initial bundle fast.

**Visualizer interface**: Each visualizer accepts `analyserNode`, `status`. When `analyserNode` is unavailable (e.g., YouTube embeds, some MIDI setups), visualizers run ambient fake-animation mode using sine-wave fake frequency data.

**Registry**: `client/src/visualizers/registry.js` exports `registry` (array of `{ id, name, description, category }`) and `VISUALIZER_NONE = 'none'`.

## UI Changes

- **Visualizer selector**: Replaced the 3-tab button group with a styled `<select>` dropdown + random button + description text.
- **Persistence**: Selected visualizer is saved to `localStorage` key `modroom-visualizer` and restored on page reload.
- **OFF mode**: Selecting `— OFF —` stops the visualizer canvas entirely for lower CPU usage.
- **Random button**: `[⟳]` button picks a random visualizer from the registry.

## CSS Changes

- Replaced `.visualizer-tabs` / `.visualizer-tab` with `.visualizer-selector`, `.visualizer-select`, `.visualizer-desc`.
- Added styles for canvas-based visualizers (CRT scanlines, neon glow, pixel borders).

## Performance Notes

- All visualizers use `requestAnimationFrame` and cancel cleanly on component unmount.
- Visualizer canvas/interval is not rendered at all when `— OFF —` is selected.
- No analyser = ambient animation only (no audio hook required).
- All canvas drawing is pixel-ratio aware.

## Files Changed

- `client/src/components/Visualizer.jsx` — refactored to use registry + lazy loading + dropdown selector
- `client/src/styles/index.css` — selector styles, removed old tab styles
- `client/src/visualizers/registry.js` — new registry module
- `client/src/visualizers/StarfieldPulse.jsx` — new
- `client/src/visualizers/VUMeterDeck.jsx` — new
- `client/src/visualizers/NeonTunnel.jsx` — new
- `client/src/visualizers/PlasmaField.jsx` — new
- `client/src/visualizers/PixelEqualizer.jsx` — new
- `client/src/visualizers/PianoRoll.jsx` — new
- `client/src/visualizers/MatrixRain.jsx` — new
- `docs/MOD-ROOM-CHANGELOG-2026-05-16.md` — this file

## Build Artifacts

Each new visualizer is emitted as a separate lazy-loaded chunk:

```
assets/StarfieldPulse-CUl3ovq3.js    ~2.6 KB
assets/VUMeterDeck-Wuq8Riug.js       ~2.9 KB
assets/NeonTunnel-BSQgvz6x.js        ~3.0 KB
assets/PlasmaField-ClWVG1bJ.js       ~2.3 KB
assets/PixelEqualizer-DtpJlHse.js    ~2.1 KB
assets/PianoRoll-LLxWUi6Y.js         ~2.4 KB
assets/MatrixRain-D3K63co_.js        ~2.5 KB
```

## Known Limitations

- Visualizer selection is **local** to each user (not synced across room members).
- Visualizers do not react to YouTube iframe embeds (no analyser available).
- MIDI playback analyser availability depends on the `jzz` synth initialization.
- Matrix Rain and Plasma Field use pseudo-random ambient animation when no analyser is available.
- The `neon-tunnel` 3D effect may be slightly CPU-intensive on very low-end mobile devices.

## Verification

- ✅ Build completes with 0 errors
- ✅ All 7 new visualizer chunks confirmed accessible on production (`/assets/StarfieldPulse-*.js` → 200)
- ✅ Main bundle confirmed to contain all 10 visualizer names + `visualizer-selector`
- ✅ Health check: `GET /api/health` → `200 {"status":"ok"}`
- ✅ No new dependencies introduced

---

# Feature/Bug Fix Batch — Room Sync, Controls, Layout, Security

## Implemented

- Added 16 visible MOD channel toggles (`CH01`–`CH16`) in the player panel for `.mod` playback.
- Patched the `modplayer` worklet at build time so channel mute/unmute messages affect individual tracker channels in real time.
- Changed volume controls to a 1–100 scale with default 20, preserving saved user preference via `localStorage`.
- Synced visualizer selection through room state:
  - stored as `rooms.visualizer_id`
  - sent in room snapshots
  - broadcast through `visualizer-update`
  - new joiners inherit the active room visualizer
- Tightened 1080p layout so queue and activity panels stay independently scrollable without stretching the page.
- Rebuilt VU Meter Deck into a polished retro stereo meter + 16-channel activity deck.
- Reworked Neon Tunnel for faster motion, stronger beat/volume response, and bounded lightweight canvas rendering.
- Hardened `/api/library` and `/api/library/file` path handling with server-side root locking and parent traversal rejection.

## Verification

- ✅ `npm run build` succeeds from `client/`.
- ✅ Server files pass `node --check`.
- ✅ Built assets include channel-mute worklet message handling.
- ✅ Built client includes visualizer room sync, volume preference/default, and channel controls.
