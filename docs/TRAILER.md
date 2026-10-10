# Trailer, social card, sharing and anonymous stats

## In-engine trailer: `sws.trailer()`

A 57-second scripted cinematic played over a live survival mission (`src/dev/Trailer.ts`):

| time | shot |
|---|---|
| 0–8 s | establishing shot over the formation and the cloud sea, "1943" caption |
| 8–15 s | slow orbit around a B-17 |
| 15–23 s | chase camera behind a Fw 190 diving on the bombers |
| 23–31 s | the gunner's view: the gun swings onto the nearest fighter and fires (tracers) |
| 31–37 s | kill: side camera on a fighter, it is shot down, slow motion, fire and smoke |
| 37–48 s | the Luftkreuzer battle group (`sws.boss`) closes in ahead of the formation |
| 48–57 s | wide drift over the formation, title card, fade to black |

The HUD is hidden, the player's bomber takes no damage, and what you see is a 16:9 compositor
canvas (letterbox, captions, title) laid over the page. It ends in the main menu. P (pause) or
`sws.stopTrailer()` aborts it.

### Record it to a WebM

1. `npm run dev` and open the printed URL in Chrome or Edge (Firefox works too). Use a large
   window, a fast machine and graphics quality High.
2. Click once anywhere on the page (browsers only start audio after a user gesture).
3. Open the developer console and run:

   ```js
   await sws.trailer({ record: true })            // 1280x720, 30 fps, game audio included
   await sws.trailer({ record: true, width: 1920, height: 1080, bitrate: 16e6 })
   await sws.trailer({ record: true, save: true }) // also written to trailer-out/ (git-ignored)
   ```

4. Keep the tab visible and in front for the whole minute. Recording is real time: it
   needs `requestAnimationFrame`, which browsers pause in hidden or background tabs (and the
   Claude built-in browser pane when it is not showing). When it finishes the browser downloads
   `sky-war-shooter-3d-trailer-<date>.webm`; the promise resolves with `{ bytes, url, mime, saved }`
   and `sws.trailerBlob` holds the file.

Options: `audio: false` (video only), `fps`, `download: false`, `weather` (a `Weather` preset,
e.g. `sws.CAMPAIGN[5].weather` for low evening sun), `start` (jump into the timeline, for testing).

Without recording, a hidden or headless tab can still drive the timeline frame by frame:
`sws.trailer(); sws.step(57 * 30, 1 / 30, false)`.

Convert for sites that do not take WebM: `ffmpeg -i trailer.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac trailer.mp4`.
Never commit the video files (`trailer-out/` is ignored).

## Social preview card: `sws.ogCard()`

`public/og-image.jpg` (1200x630) is rendered in-engine by `src/dev/OgCard.ts`: a Fw 190 diving
past a B-17 above an evening cloud sea, with the title. In the dev server console:

```js
await sws.ogCard()                         // renders and saves public/og-image.jpg
await sws.ogCard({ save: false, keep: true, cam: [45, 10, -95], look: [-31, 2, 70], fov: 46 })
```

Saving goes through the dev-only `POST /__dev/save` endpoint in `vite.config.ts`, which writes
only `public/og-image.jpg`, `docs/screenshots/*.png|jpg` and `trailer-out/*.webm`. The card is
referenced by the Open Graph / Twitter tags in `index.html` (absolute URL on the workers.dev
domain) and is left out of the service worker's precache.

## Share buttons

`src/game/Share.ts`: "📸 Share screenshot" in the pause menu, the debrief and photo mode (F, then
Enter or the on-screen button). It renders one frame at full resolution, copies it before the
browser presents it (the renderer has no `preserveDrawingBuffer`), stamps it with the game name,
mission, score and kills, and shares the PNG with the Web Share API where files can be shared.
Elsewhere the PNG is downloaded and the share text with the link goes to the clipboard. The
debrief also has "Share result": "I downed 34 fighters in 'Black Thursday' — Sky War Shooter 3D"
plus the link.

## Anonymous gameplay stats

`src/net/Analytics.ts` sends one anonymous summary per mission to Firestore (`analytics_events`)
when the mission ends or is abandoned (at most one write per mission): mission, mode, role,
outcome, duration, kills, accuracy, bombers lost, rounds, shots, deaths, score, seat time and
switches, ability uses, perks, a settings snapshot (quality, aim assist, difficulty, flight mode,
language, touch, gamepad), the device class (screen size bucket, touch, pixel ratio) and the
frame rate (average, 10th percentile, bucket). No name, user id, free text or precise device data.
Builds from `npm run dev` mark their events `dev: true`.

It is off when the player sets Settings → Privacy → "Share anonymous gameplay stats" to Off
(default On), and whenever the browser sends Do-Not-Track or Global Privacy Control.

`firestore.rules` makes the collection create-only with every field validated (types, ranges,
fixed key sets, size limits), unreadable by clients, and rate-limited through
`analytics_limits/{uid}` (one write per 10 s). Deploy rules with
`npx firebase-tools deploy --only firestore:rules --project sky-war-shooter-3d`;
`node tools/analytics_rules_check.mjs` checks them live.

Report (uses the Firebase CLI login on this machine, `tools/firebase_token.mjs`):

```
node tools/analytics_report.mjs                 # last 30 days
node tools/analytics_report.mjs --days 7 --prod # production builds only
node tools/analytics_report.mjs --last 10       # plus the newest events
node tools/analytics_report.mjs --json          # raw events
```
