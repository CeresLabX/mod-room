# MOD-ROOM CHANGELOG — 2026-05-17

## Feature: Synced MOD Channel Muting

MOD Room channel mute state is now synchronized across all users in a room. Previously, toggling a channel ON/OFF only affected the local user's browser. Now, when any user mutes or unmutes a MOD channel, all other users in the room see the change instantly.

### What Changed

**Server**
- `server/roomSync.js` — Added `channelEnabled: Array(16).fill(true)` to the in-memory active room state
- `server/index.js` — Added `channel-mute-update` socket event handler that validates the payload, updates `roomSyncState.channelEnabled`, and broadcasts to all room members; includes `channelEnabled` in `room-state` response so new joiners get the current state

**Client**
- `client/src/hooks/useSocket.js` — Added `socket.on('channel-mute-update', ...)` → `handlers.onChannelMuteUpdate`
- `client/src/components/RoomView.jsx` — Added `channelEnabled` state (null = use default, array = synced from server); `handleChannelMuteUpdate` updates state when server broadcasts; `handleRoomState` hydrates channel state on room join; passes `channelEnabled` and `onChannelMuteUpdate` to PlayerPanel
- `client/src/components/PlayerPanel.jsx` — Added `channelEnabled` prop (from RoomView/synced state) and `onChannelMuteUpdate` prop; on channel toggle, emits `channel-mute-update` with full 16-element array; added `useEffect` to apply server-synced channel state to the modplayer worklet

### How It Works
1. User clicks a channel toggle (e.g., CH03 ON → OFF)
2. PlayerPanel updates local modplayer worklet immediately (responsive UI)
3. PlayerPanel calls `onChannelMuteUpdate(i, nextEnabled)` → RoomView → `emit('channel-mute-update', { channelIndex, channelEnabled: [...] })`
4. Server receives, validates, stores in `roomSyncState.channelEnabled`, broadcasts to all room sockets
5. Other clients receive `channel-mute-update`, update their `channelEnabled` state, which triggers PlayerPanel's sync effect to call `modPlayer.setChannelEnabledAt()` for each channel
6. All users converge on the same 16-element array

### Verification
- `npm run build` — ✓ 155 modules, no errors
