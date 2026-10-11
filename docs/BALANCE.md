# Balance pass (October 2026)

A data-driven pass over every mission and mode. The numbers come from the scripted player
(`src/dev/autoplay.ts`) at two skill levels, run on frozen development builds. This page covers
the harness, the before/after numbers, what changed and why, where the knobs are, and what is still open.

## Targets (from the player)

| Area | Target (human level) |
|---|---|
| Campaign missions | 6–12 min each; finales up to ~15 min |
| Battle group (boss) | 4–7 min; still hard (telegraphed salvos, enrage, last stand stay) |
| Survival | rounds of 3–5 min |
| Raids (Defend the Field / Night Fighter) | human fails 25–35 %; near-perfect bot passes ~95 % |
| Train Busting | round 3 (airfield) completes reliably |
| Difficulty | Recruit / Veteran / Ace respected; Ace stays brutal |

## The harness

* **Human-level bot:** `autoplay(engine, game, mission, steps, { skill })`. `skill: 1` is the old near-perfect bot.
  `skill: 0` adds several human errors (the `HUMAN` table, `src/dev/autoplay.ts:49`):
  * an aim error that wanders (Ornstein-Uhlenbeck);
  * a misjudged lead per target;
  * laggy tracking;
  * a reaction delay after each target switch;
  * a trigger held after the shot is gone, and fire opened at longer range.

  Calibrated on the guns of the B-17: the bot hits 65–85 %, the human level 35–45 %. In the P-51 the bot
  itself only hits ~30–55 %, so the human level is set at ~0.6× that (18–30 %). Values in between scale every error.
  Battle-group accuracy is always higher (60 %+), because the ships are huge.
* **Telegraph response:** the scripted gunner now goes for a glowing (charging) weapon first, as the crew calls it,
  at both skills.
* **Metrics** (`lastMetrics`):
  * duration of each round, with kills and bombers lost per round;
  * battle-group time to breach and time to kill, per ship;
  * damage and hits taken, lowest airframe health, crew wounds;
  * bombers lost, kills per minute, accuracy;
  * failures and their causes;
  * raid bombers through, and Train Busting objectives and how each round ended.
* **Queue runner** `src/dev/balance.ts` (`sws.balance`): one job per page load, so every run starts from a clean
  profile (no Armory upgrades, a fresh campaign state, no wounded crew). `sws.balance.suite('all' | 'campaign' | 'modes' | 'bosses' | 'raids')`,
  `enqueue(jobs)`, `start()`, `results()`, `table()`. A job can override the boss knobs for one run (`boss: {...}`), e.g. to
  replay the old values. `tools/balance_sink.mjs` collects each finished run into a JSONL file from the shell;
  `tools/balance_report.mjs file.jsonl` prints a Markdown summary.

```
NODE_ENV=development npx vite build --mode development --outDir /tmp/sws-balance
npx vite preview --outDir /tmp/sws-balance --port 4175 --strictPort &
node tools/balance_sink.mjs /tmp/sws-balance-results.jsonl &
# in the built-in browser on http://127.0.0.1:4175/ :
sws.balance.clear(); sws.balance.enqueue(sws.balance.suite('all')); sws.balance.start()
node tools/balance_report.mjs /tmp/sws-balance-results.jsonl
```

The raw runs (tags: `before`, `after`, `final`, `final2`, `post`, `post2`, `raid2`, `oldboss`; the boss knobs used are in each run's `tune`) are in `docs/balance/results-2026-10-11.jsonl`; `node tools/balance_report.mjs docs/balance/results-2026-10-11.jsonl` summarises them.

All runs use Veteran difficulty and the default aim assist (high), unless a row says otherwise.
A 15-minute mission takes ~40 s of real time.

## Before / after

"Before" is the game as merged at the start of the pass (main with the Game.ts split), with the pre-pass data
(1 run per row, 5 for the raids). "After" is the final tuned data merged with current main (1–9 runs per row; the
medians are shown). Times are mission time (m:ss); `B` marks a battle-group round; `lost*` is bombers lost,
or the raid bombers that got through. The before runs of the gunner battle groups used the old scripted gunner,
which did not go for charging weapons; replaying the old boss values with the new gunner gave
m5 6:01 (bot) / 11:49 (human), and m12 6:38 (bot) / unfinished (human). So most of the gain comes from the data.

| Mission / mode | Bot | Before: pass | time | rounds | boss | acc | lost* | After: pass | time | rounds | boss | acc | lost* | After failures |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| campaign:m1 | bot | 1/1 | 5:33 | 2:43 2:51 | - | 0.69 | 2.0 | 1/1 | 6:21 | 3:00 3:21 | - | 0.71 | 1.0 | - |
| campaign:m1 | human | 1/1 | 5:38 | 2:43 2:56 | - | 0.43 | 2.0 | 1/1 | 6:13 | 2:58 3:16 | - | 0.44 | 5.0 | - |
| campaign:m2 | bot | 1/1 | 6:16 | 3:00 3:16 | - | 0.65 | 5.0 | 1/1 | 6:46 | 3:15 3:31 | - | 0.71 | 4.0 | - |
| campaign:m2 | human | 1/1 | 6:11 | 2:58 3:13 | - | 0.41 | 4.0 | 1/1 | 6:51 | 3:15 3:36 | - | 0.44 | 8.0 | - |
| campaign:m8 | bot | 1/1 | 8:11 | 2:48 2:45 2:38 | - | 0.70 | 5.0 | 1/1 | 8:43 | 2:45 2:53 3:05 | - | 0.69 | 3.0 | - |
| campaign:m8 | human | 1/1 | 8:13 | 2:45 2:48 2:41 | - | 0.42 | 5.0 | 1/1 | 8:01 | 2:45 2:48 2:28 | - | 0.38 | 5.0 | - |
| campaign:m9 | bot | 1/1 | 7:11 | 2:33 2:20 2:18 | - | 0.22 | 3.0 | 7/7 | 7:26 | 2:33 2:25 2:28 | - | 0.51 | 3.4 | - |
| campaign:m9 | human | 0/1 | 4:57 | 2:33 2:13 0:12 | - | 0.36 | 3.0 | 3/4 | 7:03 | 2:33 2:13 2:18 | - | 0.30 | 6.5 | Too many bombers lost — 8 Fortresses went dow |
| campaign:m3 | bot | 1/1 | 8:03 | 2:33 2:40 2:51 | - | 0.63 | 2.0 | 1/1 | 8:08 | 2:33 2:40 2:56 | - | 0.62 | 4.0 | - |
| campaign:m3 | human | 1/1 | 7:28 | 2:30 2:30 2:28 | - | 0.36 | 5.0 | 1/1 | 7:58 | 2:33 2:35 2:51 | - | 0.36 | 2.0 | - |
| campaign:m10 | bot | 1/1 | 7:58 | 2:33 2:35 2:51 | - | 0.64 | 4.0 | 1/1 | 7:58 | 2:33 2:40 2:46 | - | 0.61 | 3.0 | - |
| campaign:m10 | human | 1/1 | 7:41 | 2:33 2:30 2:38 | - | 0.32 | 1.0 | 1/1 | 7:48 | 2:33 2:30 2:46 | - | 0.37 | 4.0 | - |
| campaign:m4 | bot | 1/1 | 9:06 | 2:50 2:50 3:26 | - | 0.47 | 0.0 | 1/1 | 9:06 | 2:50 2:50 3:26 | - | 0.51 | 1.0 | - |
| campaign:m4 | human | 1/1 | 9:06 | 2:50 2:50 3:26 | - | 0.21 | 2.0 | 1/1 | 9:06 | 2:50 2:50 3:26 | - | 0.18 | 2.0 | - |
| campaign:m5 | bot | 1/1 | 11:09 | 2:43 2:48 5:39B | 5:23 | 0.82 | 3.0 | 1/1 | 7:35 | 2:32 2:25 2:39B | 2:23 | 0.80 | 3.0 | - |
| campaign:m5 | human | 0/1 | 41:56 | 2:43 2:45 36:28B | - (1 unfinished) | 0.62 | 9.0 | 3/3 | 10:14 | 2:30 2:30 5:15B | 4:57 | 0.55 | 4.3 | - |
| campaign:m11 | bot | 1/1 | 8:31 | 2:43 2:53 2:56 | - | 0.61 | 7.0 | 1/1 | 8:28 | 2:43 2:53 2:53 | - | 0.60 | 4.0 | - |
| campaign:m11 | human | 1/1 | 8:23 | 2:43 2:48 2:53 | - | 0.39 | 5.0 | 1/1 | 8:16 | 2:40 2:43 2:53 | - | 0.36 | 3.0 | - |
| campaign:m6 | bot | 1/1 | 8:03 | 2:35 2:35 2:53 | - | 0.62 | 5.0 | 1/1 | 7:51 | 2:33 2:40 2:38 | - | 0.54 | 5.0 | - |
| campaign:m6 | human | 1/1 | 7:08 | 2:30 2:15 2:23 | - | 0.34 | 2.0 | 1/1 | 7:16 | 2:30 2:28 2:18 | - | 0.36 | 4.0 | - |
| campaign:m7 | bot | 1/1 | 10:06 | 3:10 3:10 3:46 | - | 0.41 | 6.0 | 5/5 | 10:06 | 3:10 3:10 3:46 | - | 0.38 | 2.6 | - |
| campaign:m7 | human | 1/1 | 10:06 | 3:10 3:10 3:46 | - | 0.35 | 5.0 | 1/1 | 10:06 | 3:10 3:10 3:46 | - | 0.48 | 2.0 | - |
| campaign:m12 | bot | 1/1 | 12:59 | 2:33 2:33 2:28 5:26B | 5:10 | 0.87 | 3.0 | 1/1 | 11:16 | 2:35 2:40 2:23 3:38B | 3:22 | 0.85 | 6.0 | - |
| campaign:m12 | human | 0/1 | 9:37 | 2:35 2:30 2:28 2:04B | - (1 unfinished) | 0.32 | 10.0 | 2/5 | 12:59 | 2:35 2:28 2:28 5:36B | 7:12 (3 unfinished) | 0.46 | 7.8 | The tail was shot away. The crew bailed out o; You were seriously wounded and could no longe |
| survival:gunner | bot | 1/1 | 14:37 | 2:47 2:53 5:55B 3:03 | 5:45 | 0.80 | 4.0 | 1/1 | 9:40 | 3:10 3:03 3:28B | 1:50 | 0.70 | 1.0 | - |
| survival:gunner | human | 1/1 | 18:08 | 2:50 2:58 9:21B 3:00 | 9:11 | 0.56 | 10.0 | 2/2 | 11:38 | 3:15 3:19 5:04B | 4:41 | 0.53 | 2.0 | - |
| survival:pilot | bot | 0/1 | 12:18 | 2:48 2:50 6:40B | - (1 unfinished) | 0.78 | 2.0 | 2/3 | 13:09 | 3:13 3:15 6:39B 3:15 | 6:16 (1 unfinished) | 0.83 | 5.3 | Your Mustang was shot down. |
| survival:pilot | human | 0/1 | 11:42 | 2:50 2:50 6:02B | - (1 unfinished) | 0.84 | 5.0 | 2/3 | 11:06 | 3:15 3:18 4:34B | 4:50 (1 unfinished) | 0.63 | 1.7 | Your Mustang was shot down. |
| raid | bot | 4/5 | 7:42 | 2:03 2:15 3:25 | - | 0.36 | 3.8 through | 5/5 | 8:14 | 2:09 2:23 3:44 | - | 0.37 | 3.2 through | - |
| raid | human | 4/5 | 8:03 | 1:55 2:13 3:28 | - | 0.32 | 3.0 through | 4/5 | 7:56 | 1:53 2:06 3:28 | - | 0.32 | 4.2 through | 7 bombers got through and wrecked the airfiel |
| night | bot | 5/5 | 7:30 | 2:35 1:52 3:03 | - | 0.36 | 0.8 through | 5/5 | 7:28 | 2:35 1:50 3:05 | - | 0.36 | 1.2 through | - |
| night | human | 5/5 | 7:06 | 2:28 1:35 2:56 | - | 0.26 | 0.8 through | 5/5 | 7:32 | 2:35 1:55 3:08 | - | 0.30 | 1.6 through | - |
| strafe | bot | 1/1 | 11:14 | 1:14 4:46 5:14 | - | 0.20 | 0.0 | 3/3 | 9:43 | 1:14 4:13 4:16 | - | 0.20 | 0.0 | - |
| strafe | human | 1/1 | 11:11 | 1:14 4:46 5:11 | - | 0.18 | 0.0 | 3/3 | 9:59 | 1:14 4:45 3:59 | - | 0.19 | 0.0 | - |
| weekly:gunner | bot | 1/1 | 16:28 | 3:15 3:14 3:15 3:15 3:29B | 3:13 | 0.75 | 8.0 | 1/1 | 15:35 | 3:15 3:15 3:15 3:14 2:36B | 2:21 | 0.72 | 9.0 | - |
| weekly:gunner | human | 0/1 | 6:52 | 3:13 3:08 0:32 | - | 0.41 | 4.0 | 1/1 | 16:15 | 3:10 3:10 3:15 3:13 3:28B | 3:12 | 0.52 | 11.0 | - |
| acehunt:gunner | bot | 1/1 | 7:41 | 2:28 2:28 2:46 | - | 0.68 | 2.0 | 1/1 | 7:41 | 2:28 2:27 2:46 | - | 0.68 | 3.0 | - |
| acehunt:gunner | human | 1/1 | 7:33 | 2:25 2:25 2:43 | - | 0.33 | 2.0 | 1/1 | 7:36 | 2:25 2:28 2:43 | - | 0.33 | 5.0 | - |
| acehunt:pilot | bot | 1/1 | 7:31 | 2:25 2:25 2:41 | - | 0.35 | 2.0 | 1/1 | 7:31 | 2:25 2:25 2:41 | - | 0.14 | 0.0 | - |
| acehunt:pilot | human | 1/1 | 7:33 | 2:25 2:25 2:43 | - | 0.12 | 0.0 | 1/1 | 7:31 | 2:25 2:25 2:41 | - | 0.44 | 1.0 | - |

Other difficulty levels (after, single runs):

| Run | Result | Mission | Boss | Lowest airframe health |
|---|---|---|---|---|
| m5 Ace, bot | 2/2 passed | 8:10–9:06 | 2:40–3:38 | 0.66 |
| m5 Ace, human level | 1/3 passed (9 bombers lost; the tail shot away) | 10:49 | 5:32 | 0.20 |
| m12 Ace, bot | 1/2 passed (once shot down in round 2) | 11:10 | 3:01 | 0.52 |
| m12 Ace, human level | 0/1 (the tail shot away in round 2) | - | - | - |
| Survival gunner Ace, human level (3 rounds) | survived | 12:12 | 5:27 | 0.64 |
| m5 Recruit, human level | passed | 9:58 | 4:40 | 0.90 |
| m12 Recruit, human level | passed | 13:12 | 5:14 | 0.88 |

Ace stays brutal: ship health 1.06×, guns 1.2×, the player takes 1.3× damage, +1 escort; the human level loses most Ace boss missions.
Recruit is comfortable (lowest health ~0.9).

### What the numbers said

1. **Battle groups were long because of the fixed costs, not because of their health.** Halving ship health saved
   only ~20 % for the bot. A human-level gunner spent most of the fight on the escort fighters launched every
   28–38 s, and ground through armour at 10 % (the ships were nearly always destroyed without a breach). A human m5
   boss took 6–9 min, and one run never ended (36 min).
2. **A straggling player could not win the boss fight (bug).** With two engines out, the player's B-17 falls out of
   the box (`World.ts:364`, 7 m/s and more, with no limit), while the battle group holds stations round the formation centre. After
   a few minutes she was kilometres away, and the ships were out of reach for good: the 25–40 min "unfinished" m12 and
   m5 runs, ending with "too many bombers lost". Fixed in `BossBattle.fly`: the group now keeps its stations round
   a straggling player.
3. **The P-51 battle group was unwinnable.** Bot and human were both shot down with the group at ~90 %
   (hpScale 0.85, full gun damage, turrets aimed 90 % at the Mustang).
4. **Survival rounds were 2:50**, just under the target; **m1 / m2 were 5:35–6:15**, just under 6 min.
5. **Raids:** the human-level and near-perfect bots score almost alike (the pilot bot is not near-perfect: kill rates
   are within ~15 %). Day raid: ~80 % pass for both. Night Fighter: nobody failed, with at most 2 through of 4 allowed.
6. **Train Busting round 3:** the scrambled Fw 190s are drawn at 2.5× instead of 6×, so their hit zones shrink to
   ~40 % with full structure: long dogfights low down. The round then ran to its 360 s limit.
7. **m9 (P-51 into the storm front)** lost its bombers in round 3: the last-round final wave of ~21 fighters
   on 12 bombers in the storm. 1 bot failure in 7 at first, and 2 of 6 in the Game.ts-split regression.
8. **Pilot campaign rounds (m4 / m7) always end on their `maxTime`.** The bot downs only 5–21 fighters in a mission
   (rounds 2:50–3:46 either way). A one-on-one duel (`swsDuel`, fixed for the Game.ts split) shows kills
   in 16–20 s from astern and ~3 s head-on, so a single bandit is not slippery. Many targets and frequent
   target changes cost the kills.

## Changes (data, plus one bug fix)

| Where | Was | Now | Why |
|---|---|---|---|
| `BossBattle.ts` `BOSS_TUNING.hp` | gunner 0.5, P-51 0.85 | 0.16, 0.4 | boss time, mainly for the human level |
| `BOSS_TUNING.dmg` | 1, 1 | gunner 0.85, P-51 0.45 | the B-17 arrived at the m12 boss half-wrecked and died in it; the P-51 was shot down every time |
| `BOSS_TUNING.diffHp` | 0.15 | 0.3 | Recruit ships 0.94×, Ace 1.06× |
| `BOSS_TUNING.tierHp / tierDmg` | 0.12 / 0.06 | 0 / 0.03 | the m12 group (4 ships, flagship 1.4× core) was the longest fight |
| `BOSS_TUNING.escortEvery / escortCap` | 28+10 s / 3 | 40+12 s / 2 (+1 on Ace) | escorts ate most of a human's boss time |
| `BossBattle.fly` | stations round the formation | round the player's B-17 while she straggles | bug: unwinnable boss (finding 2) |
| `Missions.ts` ROUNDS m1 / m2 | 180 / 210 s | 210 / 240 s | 6+ min, still the easiest missions |
| ROUNDS m5 | 270 s | 230 s | keeps m5 near 10–12 min with its boss |
| ROUNDS m9 | max 11, skill 0.95–1.15 | max 9, 0.95–1.1 | bombers lost in the storm (finding 7) |
| ROUNDS m12 | skill 1.1–1.35 | 1.05–1.3 | human arrived at the boss with 6–8 bombers lost |
| m12 `maxBombersLost` | 6 (+3) | 7 (+3) | the finale's limit (not shown in its objectives) |
| survival `roundDef` duration | 100 s | 125 s | rounds 3:15–3:25 |
| `RaidDefence.ts` `RAIDER_STRUCTURE` | 0.6 | 0.8 | human level let ~1–3 through |
| day raid speed | 92 | 98 m/s | |
| night raid speed, groups | 88 m/s | 96 m/s, +1 Ju 88 in four groups | nobody lost the night |
| `StrafeOps.ts` `FW_STRUCTURE` (new) | 1 | 0.55 | the low-level Fw 190s' hit zones shrink to ~40 % |
| `FW_WAVES` (new) | 45 s / 115 s | 60 s / 150 s | strafe first, then the scramble |
| parked aircraft | 10 | 8 | the airfield round ran to its time limit |

Boss mechanics are untouched: telegraphed flak / rocket / broadside / ram attacks, enrage at half health, last stand,
weak points and breach.

## Knobs for future tuning (file:line)

| Knob | Where |
|---|---|
| Boss health / damage / escorts per role, difficulty and tier | `src/game/BossBattle.ts:78` `BOSS_TUNING` |
| Ships per group, tier per mission | `src/game/BossBattle.ts:202-203` |
| Desperate (last stand) attack cadence | `src/game/BossBattle.ts:586` |
| Ship weak-point / core HP | `src/world/BossShip.ts:29-30` `PART_HP`, `CORE_HP` |
| Armour before the breach (×0.1), breach threshold (40 % of parts), core damage per part (3 %, fuel 12 %) | `src/world/BossShip.ts:172, 341, 396` |
| Campaign round lengths / fighters / skill / rockets | `src/game/Missions.ts:322-335` `ROUNDS` |
| Extra bomber losses allowed with rounds | `src/game/Missions.ts:344` |
| Survival round shape | `src/game/Missions.ts:376` |
| Which rounds are battle-group rounds | `src/game/Missions.ts:402` |
| Final-wave size, round pacing | `src/game/Pacing.ts:39` `DEFAULT_PROFILE` |
| Adaptive difficulty range | `src/game/Adaptive.ts:26` |
| Enemy base structure | `src/world/World.ts:37` `ENEMY_STRUCTURE` |
| Player gunner wound chance (4 wounds = mission over) | `src/world/World.ts:566`, `src/game/Director.ts:306` |
| Field dressing interval, boss-fight wound factor | `src/world/World.ts:38-40` `DRESSING`, `DRESSING_BOSS`, `BOSS_WOUND` |
| Night Fighter visibility (what the HUD, radar, padlock, lead pip and bot see) | `src/game/RaidDefence.ts:620` `spotted`, `SPOT_NEAR` / `SPOT_FLASH` (`:142`); hook `World.spotted` |
| Pilot bot target commitment | `src/dev/autoplay.ts` `COMMIT` (8 s, switch at < 0.45x the score) |
| Straggler drift | `src/world/World.ts:364` |
| Difficulty multipliers (enemy skill and structure, player damage) | `src/game/MissionFlow.ts:72-73` |
| Raid definitions (allowed through, speed, groups) | `src/game/RaidDefence.ts:74, 101` |
| Raider structure / jettison threshold / spawn distance | `src/game/RaidDefence.ts:133, 210, 130` |
| Train Busting low-level Fw 190s, scramble times, round limits | `src/game/StrafeOps.ts:61-62, 548` |
| P-51 scripted rounds (m4, m7: groups, `maxTime`) | `src/game/PilotRounds.ts:35` |
| Campaign-state scaling (Luftwaffe strength ±20 %, formation size) | `src/game/CampaignState.ts:117-118` |
| Ace Hunt rounds | `src/game/Modes.ts:81` |
| Human-level aim model | `src/dev/autoplay.ts:49` `HUMAN` |

## Still open

* **m12 human level:** the boss is now 5–7 min when it is won, and the finale 13–16 min. But the human-level run
  fails ~40 % (2 in 5 in the last batch; 4 in 6 and 3 in 3 passed in the two before it). The causes: the B-17 shot to
  pieces during the boss ("the tail was shot away"), or crew wounds earlier. That is hard, as asked for a finale.
  If it is too hard: `BOSS_TUNING.dmg.gunner`, or the wound chance (`World.ts:557`), which also ends ~1 in 6 of the
  human-level m5 / weekly runs.
* **Raids cannot meet both targets** with this bot. The human level now fails ~20–25 % on the day raid, but the
  "near-perfect" pilot bot is not much better than the human level (it passed 5 of 5 in the final batch, 3 of 4
  in the batch before and 4 of 5 before the pass). Night Fighter is still easy for the bot (2 failures in 22 runs after the change), because the bot
  sees every raider; a human at night does not. It was left a little easy, on purpose. The allowed-through counts
  were not changed, since they are in the voiced briefings.
* **Pilot battle group (survival round 3):** now winnable, at 4:30–6:40, but noisy. The bot and the human level are
  each shot down in about 1 of 3. More runs are needed before any further cut.
* **Pilot campaign kills** stay low (finding 8). The fix belongs in the dogfight AI or in the bot's target choice,
  not in data.
* **Train Busting:** round 3 now ends 'airfield done' in every run (6 of 6), after 3:32–4:40 (before: 5:11–6:03, one run on its time limit).
  Round 2 (the convoy) still takes 4–5 min.
* **Sample sizes:** most campaign rows are single runs per skill (the boss missions, m9, m7 and the raids have 3–8).
  Run-to-run spread is large (±25 % on boss times), so re-run with `suite('bosses')` and `suite('raids')` after any change.

## Follow-up: the three open issues (Phase 5, goal 34)

Same harness, frozen development builds, Veteran, aim assist high. "Before" is the code as committed after the
pass above: the archived runs in `docs/balance/results-2026-10-11.jsonl` (m12: tags `post2` + `final2`, the current
boss values; Night Fighter, m4, m7: every tag) plus fresh m4 / m7 runs on this branch's base (tag `before`). "After" is
this branch (tags `fix34*` in `docs/balance/results-2026-10-11-fix34.jsonl`; m12 and Night Fighter pool `fix34`–`fix34d`,
whose differences only touch the P-51 dogfight AI; m4 / m7 show `fix34`–`fix34c`, see 3. below). Samples are small
(2–8 runs per row): read the rows as a direction, not as a measurement to the percent.
The preview server ran on port 4178, because `tools/balance_sink.mjs` listens on 4176.

| Mission | Bot | Before: fail | time | detail | After: fail | time | detail | After failures |
|---|---|---|---|---|---|---|---|---|
| m12 | bot | 0/3 (0 %) | 11:16 | boss 3:22, wounds 1.7, min hp 0.57 | 0/1 (0 %) | 11:45 | boss 3:31, wounds 0.0, min hp 0.73 | - |
| m12 | human | 6/12 (50 %) | 12:58 | boss 6:44, wounds 2.2, min hp 0.54 | 0/2 (0 %) | 12:54 | boss 5:15, wounds 1.0, min hp 0.56 | - |
| night | bot | 3/23 (13 %) | 7:21 | through 1.8 (max 5), kills 15 | 0/3 (0 %) | 7:37 | through 1.3 (max 3), kills 14 | - |
| night | human | 1/31 (3 %) | 7:14 | through 1.3 (max 6), kills 16 | 0/3 (0 %) | 7:19 | through 2.0 (max 4), kills 16 | - |
| m4 | bot | 0/5 | 9:06 | kills 12 (9-13), rounds ended early 0/15 | 0/3 | 9:05 | kills 11 (8-12), rounds ended early 2/9; <600 m 150 s, 600-1500 m 168 s, beyond 226 s, firing 15 s | - |
| m4 | human | 0/5 | 9:06 | kills 13 (6-15), rounds ended early 3/15 | 0/2 | 9:06 | kills 9.0 (7-11), rounds ended early 0/6; <600 m 176 s, 600-1500 m 216 s, beyond 150 s, firing 22 s | - |
| m7 | bot | 0/13 | 10:06 | kills 11 (7-21), rounds ended early 2/39 | 0/3 | 10:06 | kills 10 (6-18), rounds ended early 0/9; <600 m 160 s, 600-1500 m 240 s, beyond 204 s, firing 13 s | - |
| m7 | human | 0/8 | 10:06 | kills 15.0 (6-21), rounds ended early 1/24 | 0/3 | 10:06 | kills 9 (6-13), rounds ended early 0/9; <600 m 135 s, 600-1500 m 242 s, beyond 227 s, firing 21 s | - |

`fix34` is the final bot code (commitment) with the old dogfight AI; `fix34b` / `fix34c` add the AI changes that were tried and reverted (3. below). m12 "after" is still only 1–2 runs per skill (the batch was cut short by the time box): the human-level failure rate is **not yet measured** against the 15–25 % target.

### 1. m12 finale (human level failed ~50 %)

The failures were spread over the whole mission, not only the boss: four crew wounds in rounds 2–3 (the mission
ends at 4), the tail shot away in round 2, and the B-17 shot apart in the boss fight. Fairness changes, no change
to the boss mechanics:

| Where | Was | Now |
|---|---|---|
| `World.ts` wound chance at the player's station | same in every round | x0.5 while a battle group is up (`BOSS_WOUND`; `World.bossFight`, set by `BossBattle`) |
| `World.ts` field dressing | one wound patched per 100 s without a new wound | 85 s (`DRESSING`), 65 s in a battle-group fight (`DRESSING_BOSS`) |
| `BossBattle.ts` `BOSS_TUNING.dmg.gunner` | 0.85 | 0.75 |

The dressing change also helps the long m5 / weekly gunner missions, where wounds ended ~1 in 6 human-level runs.
Ace keeps its multipliers on top (player damage x1.3, guns x1.2, +1 escort); it was not re-measured here.

### 2. Night Fighter (nobody lost the night)

The HUD now shows only what a pilot could make out at night. One predicate, `RaidDefence.spotted(f)`, installed
as `World.spotted` while a night raid runs (always true otherwise): a raider is marked if it is **coned** by the
searchlights, **within 1.2 km** (`SPOT_NEAR`), or **fired at the Mustang / was hit by it in the last 6 s**
(`SPOT_FLASH`; muzzle flashes and strikes give it away). Everything else shows only as exhaust flames in the 3D view.
It is applied to the enemy brackets and edge arrows (`GameHud.drawOverlay`), the radar blips (`Radar.draw`), the
padlock pick (`PilotController.pickPadlock`), the lead pip, and the raid's own "km TO FIELD" markers.
The scripted pilot obeys the same rule (it only picks spotted bandits) and, with nothing in sight, flies out 3.5 km
along the raid's approach under the searchlight belt instead of circling the field. The allowed-through count (4)
is unchanged (it is in the voiced briefing). No new player-visible strings.

### 3. P-51 campaign kills (5–21 per mission; rounds end on the time limit)

* **Target switching was not the cause.** The bot now commits to a bandit (hysteresis: 8 s, then a switch only to one
  at < 0.45x its score; damaged bandits preferred) and records `extra.switches` and where its time goes
  (`extra.near / mid / far / none / fire`: s with the chased bandit < 600 m / 600–1500 m / beyond / nothing, and s on
  the trigger). Kills did not move (table).
* **The time metrics show the real cause:** in a 9–10 min mission the bot has its bandit inside 600 m for only
  ~2.5 min, spends ~7 min chasing beyond 600 m (bomber attackers fly 1.5–2.3 km set-up runs between passes, and the
  P-51 is only ~10–15 m/s faster than an Fw 190: `power / dragK` gives ~204 vs ~189 m/s), and is on the trigger for
  only 10–35 s. Even inside 600 m it rarely gets its nose on: the scripted pursuit (lead pursuit at full throttle)
  cannot follow a breaking bandit.
* **AI changes tried and reverted** (measured, no gain, so the live game keeps the old dogfight AI): bandits noticing
  the Mustang on their tail at 1200 m instead of 600 m and turning to fight (80 % dogfight instead of 50 %);
  Fw 190 `turnTime` 5 -> 8 s and longer `engageTime`; at most one bandit zooming / extending at a time; the bot easing
  the throttle when closing fast. With those: m4 kills 12 / 7 / 11, m7 10 / 9 / 13 / 6, vs 6–21 before.
* So this stays open (below). The kill rate is limited by the scripted pilot's flying, which probably says little
  about a human with the lead pip and padlock; the next step is a better pursuit in `autoplay.ts` (cut-off / lag
  pursuit towards the bandit's set-up point, throttle and energy management in a turn), then re-measure before any
  AI or data change. Human playtest numbers would settle whether the AI needs anything at all.

### Still open after goal 34

* **P-51 kills** (3. above): not fixed; the m4 / m7 rounds still end on `maxTime`.
* **m12 human level:** re-measure with more runs; the target is 15–25 % failures.
* **Night Fighter:** more runs needed for the human-level target (25–35 % failures). If it is still too easy:
  `SPOT_NEAR` 1200 -> 1000 m, or a shorter cone hold in `Searchlights`.
