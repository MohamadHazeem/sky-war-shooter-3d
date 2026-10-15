# Historical raid mode — figures and sources (Phase 11 goal 31)

The raid notes, outcomes and briefings in `src/game/HistoricalRaids.ts` are written in our own words.
The numbers are the commonly cited figures. Where the literature disagrees we use the most often quoted
round number and say "about" in the game. The crews in the game are fictional, and combat time and
distances are compressed.

| Raid | Date | Dispatched | Lost (MIA) | Loss rate | Airmen lost | Luftwaffe fighters lost | Bomber gunners' claims | Escort |
|---|---|---|---|---|---|---|---|---|
| Schweinfurt-Regensburg (Mission 84) | 17 Aug 1943 | 376 B-17 (146 Regensburg, 230 Schweinfurt) | 60 (24 + 36) | 16% | ~550 killed, missing or captured (some accounts give 600+ casualties including wounded) | ~27 | 288 | P-47s to the German border only |
| Black Thursday (Mission 115) | 14 Oct 1943 | 291 B-17 | 60, plus 17 wrecked on return (121 damaged) | 20.6% (26% with write-offs) | ~600 | ~38 | 186 | P-47s to near Aachen |
| Big Week (Operation Argument) | 20–25 Feb 1944 | ~3,800 bomber sorties (Eighth and Fifteenth AF) | 226 bombers (some sources 247 with write-offs), 28 fighters | 5.9% | ~2,600 killed, missing or seriously wounded | 262 fighters, nearly 100 pilots killed (older figures: 355) | — | P-38, P-47 and P-51 escorts for most of the route |
| Berlin (Mission 250) | 6 Mar 1944 | 730 heavy bombers (B-17 and B-24), 801 escort fighters | 69 bombers, 11 escort fighters | 9.5% | ~700 missing | ~66 (estimates vary) | 97 (179 with the escorts' claims) | P-51s all the way |

How the game uses them:
- **Briefings** quote the dispatched/lost numbers for the day (and for each force on 17 August).
- **Fighter pressure:** `pressure()` maps the historical loss rate onto the base mission's fighters
  (×0.82 to ×1.12), so Black Thursday is the hardest and Big Week the lightest.
- **End screen:** the player's group of 12 is compared with history scaled to 12 ships
  (`lost / dispatched × 12`, and the same for Luftwaffe fighters lost). Within ±4 points of the
  historical loss rate counts as "As in history".
- Big Week is flown as its first day (Leipzig, 20 February), but it is compared with the whole week's figures.

## Sources
- Roger A. Freeman, *The Mighty Eighth War Diary* (Jane's, 1981): day-by-day dispatched/lost figures.
- Martin Middlebrook, *The Schweinfurt-Regensburg Mission* (1983): 17 August figures, German losses and claims.
- Donald Caldwell & Richard Muller, *The Luftwaffe over Germany: Defense of the Reich* (2007): German losses for Black Thursday, Big Week and Berlin.
- Office of Statistical Control, *Army Air Forces Statistical Digest, World War II* (1945).
- National Museum of the U.S. Air Force fact sheets on the Schweinfurt-Regensburg mission and Big Week.
- Wikipedia, "Big Week" — https://en.wikipedia.org/wiki/Big_Week (the 226 / 262 / ~100 pilots figures).
- 445th Bomb Group, "Mission 33" (6 March 1944) — https://445bg.org/mission-33.html (730 dispatched, 69 failed to return, escort losses and claims).
- American Air Museum in Britain, "8th Air Force 250" — https://www.americanairmuseum.com/mission/810
- Air & Space Forces Magazine, "Forceful 'Argument'" — https://airandspaceforces.com/?p=4678

The figures were checked against the web sources above on 15 October 2026. The book figures are as
commonly quoted; we did not re-check them against the printed books.
