import type { PhraseTable, Pattern } from '../types';

// German for ar/battle.ts (same keys and patterns).

// Weekly.ts OPERATIONS: code names stay as they are
const OPS = [
  'Thunderclap', 'Argument', 'Pointblank', 'Clarion', 'Frantic', 'Gomorrah', 'Tidal Wave', 'Hydra', 'Crossbow', 'Chattanooga',
  'Jericho', 'Varsity', 'Cobra', 'Grubworm', 'Aphrodite', 'Juggler', 'Starkey', 'Carpetbagger', 'Cadillac', 'Lucky Strike',
  'Iron Cross', 'Long Reach', 'Hailstorm', 'Black Ribbon', 'Steel Rain', 'Nightjar', 'Overcast', 'High Card',
];
const OP = `(${OPS.join('|')})`;
const ENEMY = '(?:Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)';
const SEAT = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';
const TOD = '(?:dawn|morning sun|noon|dusk)';
const MOOD: Record<string, string> = {
  Clear: 'Klar', Overcast: 'Bedeckt', Storm: 'Sturm', 'Red dusk': 'Rote Dämmerung', 'Light rain': 'Leichter Regen',
  'Heavy rain': 'Starker Regen', Snow: 'Schnee', 'Fog / low cloud': 'Nebel / tiefe Wolken', Thunderstorm: 'Gewitter',
  overcast: 'bedeckt', storm: 'Sturm',
};
const mood = (s: string, tr: (s: string) => string) => MOOD[s] ?? tr(s);

const rounds = (n: string | number) => `${n} ${+n === 1 ? 'Runde' : 'Runden'}`;

const HEAD = new RegExp(`^Operation ${OP} — (\\d+) rounds, (.+?), ((?:(?:overcast|storm), )?${TOD})(?:, boss in round (\\d+))?$`);
function headline(m: RegExpMatchArray, tr: (s: string) => string): string {
  const w = m[4].split(', ').map((s) => mood(s, tr)).join(', ');
  return `Operation ${m[1]} — ${rounds(m[2])}, ${tr(m[3])}, ${w}${m[5] ? `, Kampfverband in Runde ${m[5]}` : ''}`;
}

const patterns: Pattern[] = [
  [new RegExp(`^B-17 ${SEAT}$`), (m, tr) => `B-17, ${tr(m[1])}`],
  [new RegExp(`^(${ENEMY})s only$`), 'nur $1'],
  [new RegExp(`^(${ENEMY}(?:, ${ENEMY})+)$`), (m) => m[1]],
  [/^(\d+)–(\d+) at once$/, '$1–$2 gleichzeitig'],
  [/^endless (\d+:\d\d) rounds$/, 'endlose Runden zu $1'],
  [/^(\d+) × (\d+:\d\d)$/, (m) => `${rounds(m[1])} × ${m[2]}`],
  [new RegExp(`^(Clear|Overcast|Storm|Red dusk|Light rain|Heavy rain|Snow|Fog / low cloud|Thunderstorm), (${TOD})$`), (m, tr) => `${mood(m[1], tr)}, ${tr(m[2])}`],
  [/^battle group every (\d+) rounds$/, 'Kampfverband alle $1 Runden'],
  [/^battle group in round (\d+)$/, 'Kampfverband in Runde $1'],
  [/^(\d+) rounds?$/, (m) => rounds(m[1])],
  [/^(Endless rounds|\d+ rounds?) · (.+)$/, (m, tr) => `${m[1] === 'Endless rounds' ? 'Endlose Runden' : tr(m[1])} · ${tr(m[2])}`],
  [/^A battle of your own making: (.+)\.$/, (m, tr) => `Eine Schlacht nach deinen Regeln: ${m[1].split(' · ').map(tr).join(' · ')}.`],
  [/^Survive (\d+) rounds?$/, (m) => `Überstehe ${rounds(m[1])}`],

  [new RegExp(`^Operation ${OP}$`), 'Operation $1'],
  [new RegExp(HEAD.source), headline],
  [new RegExp(`^Week (\\d+): (${HEAD.source.slice(1, -1)})$`), (m, tr) => `Woche ${m[1]}: ${tr(m[2])}`],
  [/^Weekly Challenge · Week (\d+), (\d{4})$/, 'Wochen-Challenge · Woche $1, $2'],
  [/^This week's challenge, the same for every crew: (.+)\.$/, (m, tr) => `Die Challenge dieser Woche, für alle Besatzungen gleich: ${tr(m[1])}.`],
  [/^The enemy schedule is fixed for the week\. Fly all (\d+) rounds to complete it: the first completion each week pays (\d+) merit and a weekly ribbon, and earns the (.+) nose art, found nowhere else\.$/,
    (m, tr) => `Der Angriffsplan des Feindes steht für die ganze Woche fest. Fliege alle ${m[1]} Runden, um sie abzuschließen: Der erste Abschluss jeder Woche bringt ${m[2]} Verdienst und ein Wochenband, dazu die Nose-Art „${tr(m[3])}“, die es sonst nirgends gibt.`],
  [/^Survive all (\d+) rounds$/, 'Überstehe alle $1 Runden'],
  [/^Destroy the battle group in round (\d+)$/, 'Vernichte den Kampfverband in Runde $1'],
  [new RegExp(`^Operation ${OP} complete\\. The weekly ribbon is yours\\.$`), 'Operation $1 abgeschlossen. Das Wochenband gehört dir.'],
  [/^(\d+)d (\d+)h (\d+)m$/, '$1 T $2 Std. $3 Min.'],
  [/^(\d+)h (\d+)m$/, '$1 Std. $2 Min.'],
  [/^Weekly Challenge — week (\d+)$/, 'Wochen-Challenge — Woche $1'],
  [/^\+(\d+) merit · weekly ribbon(?: · (.+) nose art unlocked \(hangar\))?$/,
    (m, tr) => `+${m[1]} Verdienst · Wochenband${m[2] ? ` · Nose-Art „${tr(m[2])}“ freigeschaltet (Hangar)` : ''}`],
  [/^WEEK (\d+) · (B-17 GUNNER|P-51 ESCORT) · TOP 10$/, (m) => `WOCHE ${m[1]} · ${m[2] === 'B-17 GUNNER' ? 'B-17-SCHÜTZE' : 'P-51-BEGLEITJÄGER'} · TOP 10`],
];

const table: PhraseTable = {
  phrases: {
    'Custom Battle': 'Eigene Schlacht',
    'Weekly': 'Wöchentlich',
    'Set up your own battle: seat, enemy types, numbers, skill, rounds, weather and time of day, battle group, special events, flak and escorts. Custom battles are not posted to the online leaderboards.':
      'Stell deine eigene Schlacht zusammen: Stand, Feindtypen, Anzahl, Können, Runden, Wetter und Tageszeit, Kampfverband, Sonderereignisse, Flak und Begleitschutz. Eigene Schlachten kommen nicht in die Online-Bestenlisten.',
    'A new scenario every Monday, the same for every crew, with its own leaderboard and a weekly-only reward.':
      'Jeden Montag ein neues Szenario, für alle Besatzungen gleich, mit eigener Bestenliste und einer Belohnung nur für diese Woche.',

    'Recruit': 'Rekrut',
    'Veteran': 'Veteran',
    'Ace': 'Ass',
    'Insane': 'Wahnsinn',
    'Storm': 'Sturm',
    'Red dusk': 'Rote Dämmerung',
    'dawn': 'Morgengrauen',
    'morning sun': 'Morgensonne',
    'noon': 'Mittag',
    'dusk': 'Abenddämmerung',
    'every type': 'alle Typen',
    'special events': 'Sonderereignisse',
    'flak': 'Flak',
    'escorts': 'Begleitschutz',
    'storm front later': 'später Sturmfront',
    'clearing later': 'später aufklarend',
    'Custom Battle — Gunner': 'Eigene Schlacht — Schütze',
    'Custom Battle — Escort': 'Eigene Schlacht — Begleitjäger',
    'Custom battle': 'Eigene Schlacht',
    'Custom battles are not posted to the online leaderboards.': 'Eigene Schlachten kommen nicht in die Online-Bestenlisten.',
    'Battle won. Every round flown, and the formation still holds.': 'Schlacht gewonnen. Jede Runde geflogen, und die Formation hält noch.',

    'SURVIVAL · YOUR RULES': 'ÜBERLEBEN · DEINE REGELN',
    'Role': 'Rolle',
    'Gunner seat': 'Schützenstand',
    'Enemy types': 'Feindtypen',
    'Fighters at once': 'Jäger gleichzeitig',
    'min': 'min',
    'max': 'max',
    'Enemy skill': 'Feindliches Können',
    'Round length': 'Rundendauer',
    'Rounds': 'Runden',
    'Endless': 'Endlos',
    'until you are shot down': 'bis du abgeschossen wirst',
    'Weather': 'Wetter',
    'Time of day': 'Tageszeit',
    'Sun elevation: dawn to noon': 'Sonnenstand: Morgengrauen bis Mittag',
    'dawn / dusk': 'Dämmerung',
    'morning': 'Vormittag',
    'Battle group': 'Kampfverband',
    'Boss round': 'Boss-Runde',
    'giant flying warships': 'riesige fliegende Kriegsschiffe',
    'Extras': 'Extras',
    'Special events': 'Sonderereignisse',
    'aces, Zerstörer, rockets': 'Asse, Zerstörer, Raketen',
    'mid-round barrage': 'Sperrfeuer mitten in der Runde',
    'Escorts': 'Begleitschutz',
    'Mustangs on your side': 'Mustangs an deiner Seite',
    'Weather front': 'Wetterfront',
    'the sky turns mid-battle': 'das Wetter schlägt mitten im Kampf um',
    'Custom battles are not posted to the online leaderboards. Your last set-up is kept.': 'Eigene Schlachten kommen nicht in die Online-Bestenlisten. Deine letzte Einstellung bleibt gespeichert.',
    'Defaults': 'Standard',
    'Start': 'Start',
    '{n} of {total}': '{n} von {total}',
    '{min}–{max}': '{min}–{max}',
    'off': 'aus',
    'round {n}, then every {n}': 'Runde {n}, dann alle {n}',
    'round {n}': 'Runde {n}',
    'Last set-up': 'Letzte Einstellung',
    'Set up battle': 'Schlacht einrichten',
    'Fly last set-up': 'Letzte Einstellung fliegen',

    'The Jet Staffel': 'Die Düsenstaffel',
    'Wonder weapons': 'Wunderwaffen',
    'The Zerstörergeschwader': 'Das Zerstörergeschwader',
    'The Sturmgruppe': 'Die Sturmgruppe',
    'A Gustav swarm': 'Ein Gustav-Schwarm',
    'The day fighters': 'Die Tagjäger',
    'Everything the Luftwaffe has': 'Alles, was die Luftwaffe hat',
    'A mixed Jagdverband': 'Ein gemischter Jagdverband',
    "Post a score on this week's board": 'Trag eine Punktzahl in die Wochenliste ein',
    'Lightning Shield': 'Blitzschild',
    'Weekly Challenge reward': 'Belohnung der Wochen-Challenge',
    'NEXT SCENARIO IN': 'NÄCHSTES SZENARIO IN',
    'WEEKLY CHALLENGE · WEEK {w}, {y}': 'WOCHEN-CHALLENGE · WOCHE {w}, {y}',
    '{r} rounds of {len} · {min}–{max} fighters at once · {skill} skill': '{r} Runden zu {len} · {min}–{max} Jäger gleichzeitig · Können: {skill}',
    ' · battle group in round {n}': ' · Kampfverband in Runde {n}',
    'no special events': 'keine Sonderereignisse',
    'no flak': 'keine Flak',
    'no escorts': 'kein Begleitschutz',
    'Gunners fly the {seat} · the enemy schedule is the same for every crew all week': 'Schützen fliegen am Stand {seat} · der Angriffsplan ist die ganze Woche für alle gleich',
    '✔ Completed this week · 1 weekly ribbon': '✔ Diese Woche geschafft · 1 Wochenband',
    '✔ Completed this week · {n} weekly ribbons': '✔ Diese Woche geschafft · {n} Wochenbänder',
    'Reward for completing it: +{n} merit, a weekly ribbon': 'Belohnung für den Abschluss: +{n} Verdienst, ein Wochenband',
    ' and the <b>{name}</b> nose art (weekly-only)': ' und die Nose-Art <b>{name}</b> (nur diese Woche)',
    'WEEKLY CHALLENGE': 'WOCHEN-CHALLENGE',
    'ends in': 'endet in',
    ...Object.fromEntries(OPS.map((k) => [`Operation ${k}`, `Operation ${k}`])),
  },
  patterns,
};
export default table;
