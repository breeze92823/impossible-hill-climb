---
gameSlug: bowling-roll
canDie: true
hasScore: true
---

# Bloxity SDK answers (read by audit_sdk)

- **canDie: true** — boulders on the hill lane flatten the rider. `main.js` shows Boxity's death screen
  (`Legion.SDK.deathScreen.show()`), renders a Respawn button fed by `onCountdown`, and only respawns when
  `respawn()` answers true. Without the SDK (dev) it falls back to a timed respawn.
- **hasScore: true** — Wins, Speed, Rebirths and Time Played boards are declared with
  `Legion.SDK.leaderboard.define()` (`src/config.js` `LEADERBOARDS`, `src/bloxity.js`). The game server reports
  them from saved state (`Bowling-roll-backend/src/bloxityBoards.ts`); a signed-in player with no server
  submits from the client. Boxity draws the leaderboard button and panel itself.
- **Ads**: `ads.onBreakStart` / `onBreakEnd` pause the simulation and mute all audio (`main.js`).
- **Auth**: the client sends `Legion.SDK.auth.getToken()`; the server verifies it at
  `POST {BLOXITY_API_URL}/v1/auth/game-token/verify` and uses only the returned `user._id`
  (`Bowling-roll-backend/src/auth.ts`). A client-sent id is never trusted.
- **Rooms / invites**: `game.updateRoom("<relayRoomId>~<colyseusRoomId>")` after joining, `''` on leave; the page's
  `?roomId=` launch parameter is joined directly (`src/net.js`); the server reports its rooms to the matchmaker
  (`legion-room-reporter.ts`). `registerFeature('play_with_friends')` on boot, friend toasts via
  `game.playerJoined` / `playerInRoom`.
- **Chat**: Boxity draws the feed; `chat.onMessage` + `chat.attachBubble` draw the 4 s bubble over the sender.
- **Emotes / gems**: not used.
- **Rewarded ads**: the hub's Free Rewards chest offers `ads.showRewarded('chest-bonus')`; the reward (a small
  Wins + Speed bonus, 5 min cooldown, `ECONOMY.ad*`) is granted only when the status is `completed`.
