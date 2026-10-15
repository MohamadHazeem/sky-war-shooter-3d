import type { PhraseTable, Pattern } from '../types';

// French for ar/battle.ts (same keys and patterns).

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
  Clear: 'Dégagé', Overcast: 'Couvert', Storm: 'Tempête', 'Red dusk': 'Crépuscule rouge', 'Light rain': 'Pluie fine',
  'Heavy rain': 'Forte pluie', Snow: 'Neige', 'Fog / low cloud': 'Brouillard / nuages bas', Thunderstorm: 'Orage',
  overcast: 'couvert', storm: 'tempête',
};
const mood = (s: string, tr: (s: string) => string) => MOOD[s] ?? tr(s);

const rounds = (n: string | number) => `${n} ${+n <= 1 ? 'manche' : 'manches'}`;

const HEAD = new RegExp(`^Operation ${OP} — (\\d+) rounds, (.+?), ((?:(?:overcast|storm), )?${TOD})(?:, boss in round (\\d+))?$`);
function headline(m: RegExpMatchArray, tr: (s: string) => string): string {
  const w = m[4].split(', ').map((s) => mood(s, tr)).join(', ');
  return `Opération ${m[1]} — ${rounds(m[2])}, ${tr(m[3])}, ${w}${m[5] ? `, groupe de combat à la manche ${m[5]}` : ''}`;
}

const patterns: Pattern[] = [
  [new RegExp(`^B-17 ${SEAT}$`), (m, tr) => `B-17, ${tr(m[1])}`],
  [new RegExp(`^(${ENEMY})s only$`), '$1 uniquement'],
  [new RegExp(`^(${ENEMY}(?:, ${ENEMY})+)$`), (m) => m[1]],
  [/^(\d+)–(\d+) at once$/, '$1–$2 à la fois'],
  [/^endless (\d+:\d\d) rounds$/, 'manches sans fin de $1'],
  [/^(\d+) × (\d+:\d\d)$/, (m) => `${rounds(m[1])} × ${m[2]}`],
  [new RegExp(`^(Clear|Overcast|Storm|Red dusk|Light rain|Heavy rain|Snow|Fog / low cloud|Thunderstorm), (${TOD})$`), (m, tr) => `${mood(m[1], tr)}, ${tr(m[2])}`],
  [/^battle group every (\d+) rounds$/, (m) => `groupe de combat toutes les ${rounds(m[1])}`],
  [/^battle group in round (\d+)$/, 'groupe de combat à la manche $1'],
  [/^(\d+) rounds?$/, (m) => rounds(m[1])],
  [/^(Endless rounds|\d+ rounds?) · (.+)$/, (m, tr) => `${m[1] === 'Endless rounds' ? 'Manches sans fin' : tr(m[1])} · ${tr(m[2])}`],
  [/^A battle of your own making: (.+)\.$/, (m, tr) => `Une bataille à votre façon : ${m[1].split(' · ').map(tr).join(' · ')}.`],
  [/^Survive (\d+) rounds?$/, (m) => `Survivez à ${rounds(m[1])}`],

  [new RegExp(`^Operation ${OP}$`), 'Opération $1'],
  [new RegExp(HEAD.source), headline],
  [new RegExp(`^Week (\\d+): (${HEAD.source.slice(1, -1)})$`), (m, tr) => `Semaine ${m[1]} : ${tr(m[2])}`],
  [/^Weekly Challenge · Week (\d+), (\d{4})$/, 'Défi hebdomadaire · Semaine $1, $2'],
  [/^This week's challenge, the same for every crew: (.+)\.$/, (m, tr) => `Le défi de la semaine, le même pour tous les équipages : ${tr(m[1])}.`],
  [/^The enemy schedule is fixed for the week\. Fly all (\d+) rounds to complete it: the first completion each week pays (\d+) merit and a weekly ribbon, and earns the (.+) nose art, found nowhere else\.$/,
    (m, tr) => `Le programme ennemi est fixe pour la semaine. Volez les ${m[1]} manches pour le terminer : la première réussite de la semaine rapporte ${m[2]} de mérite et un ruban hebdomadaire, plus la peinture de nez « ${tr(m[3])} », introuvable ailleurs.`],
  [/^Survive all (\d+) rounds$/, 'Survivez aux $1 manches'],
  [/^Destroy the battle group in round (\d+)$/, 'Détruisez le groupe de combat à la manche $1'],
  [new RegExp(`^Operation ${OP} complete\\. The weekly ribbon is yours\\.$`), 'Opération $1 terminée. Le ruban hebdomadaire est à vous.'],
  [/^(\d+)d (\d+)h (\d+)m$/, '$1 j $2 h $3 min'],
  [/^(\d+)h (\d+)m$/, '$1 h $2 min'],
  [/^Weekly Challenge — week (\d+)$/, 'Défi hebdomadaire — semaine $1'],
  [/^\+(\d+) merit · weekly ribbon(?: · (.+) nose art unlocked \(hangar\))?$/,
    (m, tr) => `+${m[1]} de mérite · ruban hebdomadaire${m[2] ? ` · peinture de nez « ${tr(m[2])} » débloquée (hangar)` : ''}`],
  [/^WEEK (\d+) · (B-17 GUNNER|P-51 ESCORT) · TOP 10$/, (m) => `SEMAINE ${m[1]} · ${m[2] === 'B-17 GUNNER' ? 'MITRAILLEUR B-17' : 'ESCORTE P-51'} · TOP 10`],
];

const table: PhraseTable = {
  phrases: {
    'Custom Battle': 'Bataille personnalisée',
    'Weekly': 'Hebdo',
    'Set up your own battle: seat, enemy types, numbers, skill, rounds, weather and time of day, battle group, special events, flak and escorts. Custom battles are not posted to the online leaderboards.':
      'Préparez votre propre bataille : poste, types ennemis, nombre, niveau, manches, météo et heure, groupe de combat, événements spéciaux, flak et escorte. Les batailles personnalisées ne figurent pas dans les classements en ligne.',
    'A new scenario every Monday, the same for every crew, with its own leaderboard and a weekly-only reward.':
      'Un nouveau scénario chaque lundi, le même pour tous les équipages, avec son propre classement et une récompense exclusive.',

    'Recruit': 'Recrue',
    'Veteran': 'Vétéran',
    'Ace': 'As',
    'Insane': 'Démentiel',
    'Storm': 'Tempête',
    'Red dusk': 'Crépuscule rouge',
    'dawn': 'aube',
    'morning sun': 'soleil du matin',
    'noon': 'midi',
    'dusk': 'crépuscule',
    'every type': 'tous les types',
    'special events': 'événements spéciaux',
    'flak': 'flak',
    'escorts': 'escorte',
    'storm front later': 'front orageux ensuite',
    'clearing later': 'éclaircies ensuite',
    'Custom Battle — Gunner': 'Bataille personnalisée — Mitrailleur',
    'Custom Battle — Escort': 'Bataille personnalisée — Escorte',
    'Custom battle': 'Bataille personnalisée',
    'Custom battles are not posted to the online leaderboards.': 'Les batailles personnalisées ne figurent pas dans les classements en ligne.',
    'Battle won. Every round flown, and the formation still holds.': 'Bataille gagnée. Toutes les manches volées, et la formation tient toujours.',

    'SURVIVAL · YOUR RULES': 'SURVIE · VOS RÈGLES',
    'Role': 'Rôle',
    'Gunner seat': 'Poste de tir',
    'Enemy types': 'Types ennemis',
    'Fighters at once': 'Chasseurs à la fois',
    'min': 'min',
    'max': 'max',
    'Enemy skill': 'Niveau ennemi',
    'Round length': 'Durée de manche',
    'Rounds': 'Manches',
    'Endless': 'Sans fin',
    'until you are shot down': 'jusqu’à ce que vous soyez abattu',
    'Weather': 'Météo',
    'Time of day': 'Heure',
    'Sun elevation: dawn to noon': 'Hauteur du soleil : de l’aube à midi',
    'dawn / dusk': 'aube / crépuscule',
    'morning': 'matin',
    'Battle group': 'Groupe de combat',
    'Boss round': 'Manche du boss',
    'giant flying warships': 'cuirassés volants géants',
    'Extras': 'Extras',
    'Special events': 'Événements spéciaux',
    'aces, Zerstörer, rockets': 'as, Zerstörer, roquettes',
    'mid-round barrage': 'barrage en pleine manche',
    'Escorts': 'Escorte',
    'Mustangs on your side': 'des Mustang à vos côtés',
    'Weather front': 'Front météo',
    'the sky turns mid-battle': 'le ciel change en pleine bataille',
    'Custom battles are not posted to the online leaderboards. Your last set-up is kept.': 'Les batailles personnalisées ne figurent pas dans les classements en ligne. Votre dernière configuration est conservée.',
    'Defaults': 'Par défaut',
    'Start': 'Commencer',
    '{n} of {total}': '{n} sur {total}',
    '{min}–{max}': '{min}–{max}',
    'off': 'désactivé',
    'round {n}, then every {n}': 'manche {n}, puis toutes les {n}',
    'round {n}': 'manche {n}',
    'Last set-up': 'Dernière configuration',
    'Set up battle': 'Configurer la bataille',
    'Fly last set-up': 'Rejouer la dernière config.',

    'The Jet Staffel': 'La Staffel à réaction',
    'Wonder weapons': 'Armes miracles',
    'The Zerstörergeschwader': 'Le Zerstörergeschwader',
    'The Sturmgruppe': 'La Sturmgruppe',
    'A Gustav swarm': 'Un essaim de Gustav',
    'The day fighters': 'Les chasseurs de jour',
    'Everything the Luftwaffe has': 'Tout ce qu’a la Luftwaffe',
    'A mixed Jagdverband': 'Un Jagdverband mixte',
    "Post a score on this week's board": 'Inscrivez un score au classement de la semaine',
    'Lightning Shield': 'Bouclier de foudre',
    'Weekly Challenge reward': 'Récompense du défi hebdomadaire',
    'NEXT SCENARIO IN': 'PROCHAIN SCÉNARIO DANS',
    'WEEKLY CHALLENGE · WEEK {w}, {y}': 'DÉFI HEBDOMADAIRE · SEMAINE {w}, {y}',
    '{r} rounds of {len} · {min}–{max} fighters at once · {skill} skill': '{r} manches de {len} · {min}–{max} chasseurs à la fois · niveau {skill}',
    ' · battle group in round {n}': ' · groupe de combat à la manche {n}',
    'no special events': 'sans événements spéciaux',
    'no flak': 'sans flak',
    'no escorts': 'sans escorte',
    'Gunners fly the {seat} · the enemy schedule is the same for every crew all week': 'Les mitrailleurs sont au poste {seat} · le programme ennemi est le même pour tous toute la semaine',
    '✔ Completed this week · 1 weekly ribbon': '✔ Terminé cette semaine · 1 ruban hebdomadaire',
    '✔ Completed this week · {n} weekly ribbons': '✔ Terminé cette semaine · {n} rubans hebdomadaires',
    'Reward for completing it: +{n} merit, a weekly ribbon': 'Récompense : +{n} de mérite, un ruban hebdomadaire',
    ' and the <b>{name}</b> nose art (weekly-only)': ' et la peinture de nez <b>{name}</b> (exclusive)',
    'WEEKLY CHALLENGE': 'DÉFI HEBDOMADAIRE',
    'ends in': 'fin dans',
    ...Object.fromEntries(OPS.map((k) => [`Operation ${k}`, `Opération ${k}`])),
  },
  patterns,
};
export default table;
