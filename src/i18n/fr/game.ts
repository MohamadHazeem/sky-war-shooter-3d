// French for ar/game.ts (same keys and patterns).
import type { PhraseTable } from '../types';

const STATION: Record<string, string> = {
  'Left Waist': 'Sabord gauche',
  'Right Waist': 'Sabord droit',
  'Top Turret': 'Tourelle dorsale',
  'Ball Turret': 'Tourelle ventrale',
  'Tail Gun': 'Mitrailleuse de queue',
};
const STATION_UP: Record<string, string> = Object.fromEntries(Object.entries(STATION).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
const ST = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';

const MONTHS: Record<string, string> = {
  JANUARY: 'JANVIER', FEBRUARY: 'FÉVRIER', MARCH: 'MARS', APRIL: 'AVRIL', MAY: 'MAI', JUNE: 'JUIN',
  JULY: 'JUILLET', AUGUST: 'AOÛT', SEPTEMBER: 'SEPTEMBRE', OCTOBER: 'OCTOBRE', NOVEMBER: 'NOVEMBRE', DECEMBER: 'DÉCEMBRE',
};

const pl = (s: string, one: string, many: string) => (+s <= 1 ? `${s} ${one}` : `${s} ${many}`);
const round = (a: string, b?: string) => (b ? `Manche ${a}/${b}` : `Manche ${a}`);

// Text shown in capitals: tr() handles capitalised text; only dates need the fallback
function upper(s: string, tr: (s: string) => string): string {
  const d = tr(s);
  if (d !== s) return d;
  const date = s.match(/^(\d{1,2}) ([A-Z]+) (\d{4})$/);
  if (date && MONTHS[date[2]]) return `${date[1]} ${MONTHS[date[2]]} ${date[3]}`;
  return s;
}

const MODE: Record<string, string> = { 'MOUSE AIM': 'VISÉE SOURIS', DIRECT: 'DIRECT', COCKPIT: 'COCKPIT', CHASE: 'POURSUITE' };
const QUALITY: Record<string, string> = { low: 'basse', medium: 'moyenne', high: 'haute' };

const table: PhraseTable = {
  phrases: {
    // ---- gun stations ----
    ...STATION,
    ...STATION_UP,

    // ---- crew panel ----
    'Pilot': 'Pilote',
    'Co-Pilot': 'Copilote',
    'Navigator': 'Navigateur',
    'Bombardier': 'Bombardier',
    'Engineer': 'Mécanicien',
    'Radio': 'Radio',
    'Ball': 'Ventrale',
    'Waist L': 'Sabord G',
    'Waist R': 'Sabord D',
    'Tail': 'Queue',
    'OK': 'OK',
    'WOUNDED': 'BLESSÉ',

    // ---- banners ----
    'FIVE CONFIRMED': 'CINQ CONFIRMÉS',
    'Ace in a day': 'As en un jour',
    'They\'re sending everything they have': 'Ils envoient tout ce qu\'ils ont',
    'More fighters inbound': 'D\'autres chasseurs en approche',
    'INCOMING': 'ATTAQUE',
    'ALL GUNS SECURE': 'ARMES EN SÉCURITÉ',
    'MISSION FAILED': 'MISSION ÉCHOUÉE',
    'Mission complete': 'Mission accomplie',
    'Shot down': 'Abattu',
    'BAIL OUT! BAIL OUT!': 'ÉVACUEZ ! ÉVACUEZ !',
    'Crew, abandon the aircraft': 'Équipage, abandonnez l\'appareil',
    '5 kill streak · +50% score': 'Série de 5 · +50 % de score',
    'ON FIRE': 'EN FEU',
    'SOMEWHERE OVER THE REICH': 'QUELQUE PART AU-DESSUS DU REICH',
    'OVER THE RUHR, SPRING 1944': 'AU-DESSUS DE LA RUHR, PRINTEMPS 1944',
    'THE CLOCK IS RUNNING': 'LE TEMPS PRESSE',
    'TRAINING FLIGHT · OVER THE WASH': 'VOL D\'ENTRAÎNEMENT · AU-DESSUS DU WASH',

    // ---- tips ----
    '<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire': '<kbd>Souris</kbd> : pointer l\'arme · <kbd>Clic gauche maintenu</kbd> : tirer',
    'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom': 'Anticipez les chasseurs — visez là où ils seront · <kbd>Bouton droit</kbd> pour zoomer',
    'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position': 'Les rafales courtes refroidissent le canon · <kbd>1–5</kbd> changer de poste',
    '<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires': '<kbd>Bougez la souris</kbd> pour voler où vous regardez · <kbd>Bouton gauche</kbd> pour tirer',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle': 'Placez le viseur K-14 devant l\'ennemi et tirez · <kbd>W/S</kbd> gaz',
    'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view': 'Les Fw 190 vont vous traquer — continuez de virer · <kbd>V</kbd> vue poursuite',
    '<kbd>Drag</kbd> to swing the gun · <kbd>Hold FIRE</kbd> to shoot': '<kbd>Glissez</kbd> pour pointer l\'arme · <kbd>Maintenez TIR</kbd> pour tirer',
    'Lead the fighters — aim where they will be · <kbd>ZOOM</kbd> for the ring sight': 'Anticipez les chasseurs — visez là où ils seront · <kbd>ZOOM</kbd> pour le viseur annulaire',
    'Short bursts keep the barrel cool · tap a gun position to change seats': 'Les rafales courtes refroidissent le canon · touchez un poste pour en changer',
    '<kbd>Drag</kbd> on the left to fly · <kbd>FIRE</kbd> shoots': '<kbd>Glissez</kbd> à gauche pour voler · <kbd>TIR</kbd> pour tirer',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>THR</kbd> lever for power': 'Placez le viseur K-14 devant l\'ennemi et tirez · manette <kbd>GAZ</kbd> pour la puissance',
    'Fw 190s will come for you — keep turning · <kbd>VIEW</kbd> chase view': 'Les Fw 190 vont vous traquer — continuez de virer · <kbd>VUE</kbd> vue poursuite',
    'Guns topped up': 'Munitions complétées',
    'RELOADING — new ammunition box': 'RECHARGEMENT — nouvelle caisse de munitions',
    'BARREL OVERHEATED — let it cool': 'CANON EN SURCHAUFFE — laissez-le refroidir',
    '<kbd>Space</kbd> skip': '<kbd>Espace</kbd> passer',

    // ---- kill feed ----
    'P-51 lost': 'P-51 perdu',
    'You are wounded': 'Vous êtes blessé',
    'Fire\'s out — took a heavy hit': 'Feu éteint — gros coup encaissé',
    'Streak cooled off': 'Série terminée',

    // ---- field upgrades ----
    '6 KILLS · FIELD UPGRADE': '6 VICTOIRES · AMÉLIORATION DE TERRAIN',
    '5 KILLS · FIELD PROMOTION': '5 VICTOIRES · PROMOTION AU FRONT',

    // ---- hangar / armory headers ----
    'ARMORY': 'ARMURERIE',
    'B-17 gunner loadout (P-51 loadout: between rounds)': 'Équipement du mitrailleur B-17 (équipement P-51 : entre les manches)',
    'Back': 'Retour',

    // ---- HUD objective line ----
    'Gunnery School — follow the instructions': 'École de tir — suivez les instructions',
    'Stand by — enemy fighters approaching': 'Attention — chasseurs ennemis en approche',
    'Hold steady through the flak': 'Tenez bon dans la flak',
    'Scan the sky — more fighters expected': 'Surveillez le ciel — d\'autres chasseurs arrivent',

    // ---- pilot HUD mode line ----
    'MOUSE AIM': 'VISÉE SOURIS',
    'DIRECT': 'DIRECT',
    'COCKPIT': 'COCKPIT',
    'CHASE': 'POURSUITE',
    'STALL': 'DÉCROCHAGE',

    // ---- gunner HUD station line ----
    'RELOADING': 'RECHARGEMENT',
    'BARREL HOT': 'CANON CHAUD',

    // ---- debrief: end-of-mission reasons ----
    'Both pilots were hit and the Sky Queen fell out of control.': 'Les deux pilotes ont été touchés et le Sky Queen est parti en perdition.',
    'The tail was shot away.': 'La queue a été arrachée par les tirs.',
    'A wing was shot off.': 'Une aile a été arrachée.',
    'All four engines were knocked out.': 'Les quatre moteurs ont été mis hors service.',
    'The Sky Queen was shot down.': 'Le Sky Queen a été abattu.',
    'Your Mustang flew into the ground.': 'Votre Mustang s\'est écrasé au sol.',
    'Your Mustang was shot down.': 'Votre Mustang a été abattu.',
    'You were seriously wounded and could no longer man your gun.': 'Grièvement blessé, vous ne pouviez plus servir votre arme.',
    'The formation fought its way through. Good shooting, gunner.': 'La formation s\'est frayé un passage. Beau tir, mitrailleur.',
    'The bombers made it through. Outstanding work, Blue Leader.': 'Les bombardiers sont passés. Excellent travail, Blue Leader.',

    // ---- debrief: medals and tiles ----
    'Air Medal': 'Air Medal',
    'Ace in a Day': 'As en un jour',
    'Distinguished Flying Cross': 'Distinguished Flying Cross',
    'Silver Star': 'Silver Star',
    'Purple Heart': 'Purple Heart',
    'Gun kills': 'Victoires au canon',
    'ONLINE LEADERBOARD': 'CLASSEMENT EN LIGNE',
    'You': 'Vous',

    // ---- loading screen ----
    'Starting the engines…': 'Démarrage des moteurs…',
    'Loading aircraft…': 'Chargement des avions…',
    'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.': 'WebGL 2 est requis. Utilisez un navigateur de bureau récent avec l\'accélération matérielle activée.',
    'Forming up over England…': 'Rassemblement au-dessus de l\'Angleterre…',
    'Ready': 'Prêt',

    // ---- cinematics ----
    'KILL CAM': 'CAMÉRA DE VICTOIRE',
    '{what} · DESTROYED': '{what} · DÉTRUIT',
    'BANDIT': 'ENNEMI',
    'CLICK TO SKIP': 'CLIQUEZ POUR PASSER',
    'MISSION COMPLETE': 'MISSION ACCOMPLIE',
    'Mission {n} · {title}': 'Mission {n} · {title}',
    '▶ Replay best moment': '▶ Revoir le meilleur moment',
    'REPLAY': 'REPLAY',
    'BEST MOMENT': 'MEILLEUR MOMENT',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · F exit': 'MODE PHOTO · WASD déplacer · souris regarder · Q/E bas/haut · Shift plus vite · molette vitesse · F quitter',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · Enter share · F exit': 'MODE PHOTO · WASD déplacer · souris regarder · Q/E bas/haut · Shift plus vite · molette vitesse · Entrée partager · F quitter',

    // ---- kill juice and streak meter ----
    'DOUBLE KILL': 'DOUBLÉ',
    'TRIPLE KILL': 'TRIPLÉ',
    'QUAD KILL': 'QUADRUPLÉ',
    'RAMPAGE': 'CARNAGE',
    'ON FIRE ×{n}': 'EN FEU ×{n}',
    'ON FIRE  ×{n}': 'EN FEU  ×{n}',
    '{label} DOWN': '{label} ABATTU',
    'STREAK': 'SÉRIE',
    'ON YOU': 'SUR VOUS',
  },
  patterns: [
    // ---- banners ----
    [/^MISSION (\d+) · (.+)$/, (m, tr) => `MISSION ${m[1]} · ${upper(m[2], tr)}`],
    [/^(\d{1,2}) (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) (\d{4})$/, (m) => `${m[1]} ${MONTHS[m[2]]} ${m[3]}`],
    [/^DAILY RUN · (.+)$/, 'SORTIE DU JOUR · $1'],
    [/^ROUND (\d+)$/, 'MANCHE $1'],
    [/^Wave (\d+)$/, 'Vague $1'],

    // ---- field upgrade labels ----
    [/^WAVE (\d+) CLEARED$/, 'VAGUE $1 REPOUSSÉE'],
    [/^WAVE (\d+) SURVIVED$/, 'VAGUE $1 SURVÉCUE'],

    // ---- hangar between rounds ----
    [/^ROUND (\d+) CLEARED$/, 'MANCHE $1 TERMINÉE'],
    [/^(\d+) kills this round · \+(\d+) merit$/, (m) => `${pl(m[1], 'victoire', 'victoires')} cette manche · +${m[2]} mérite`],
    [/^Round (\d+) of (\d+)$/, 'Manche $1 sur $2'],
    [/^Round (\d+)$/, 'Manche $1'],

    // ---- HUD: mission line, formation, crew ----
    [/^(.+) · (\d+:\d{2})$/, (m, tr) => `${upper(m[1], tr)} · ${m[2]}`],
    [/^(\d+)\/(\d+) B-17s$/, '$1/$2 B-17'],
    [/^Gunner wounded \((\d+)\/4\)$/, 'Mitrailleur blessé ($1/4)'],

    // ---- HUD objective line ----
    [/^Round (\d+)(?:\/(\d+))? — (\d+:\d{2}) · (\d+) fighters$/, (m) => `${round(m[1], m[2])} — ${m[3]} · ${pl(m[4], 'chasseur', 'chasseurs')}`],
    [/^Round (\d+)(?:\/(\d+))? — clear the last (\d+) fighters?$/, (m) => `${round(m[1], m[2])} — ${+m[3] <= 1 ? 'abattez le dernier chasseur' : `abattez les ${m[3]} derniers chasseurs`}`],
    [/^Round (\d+)(?:\/(\d+))? — (.+)$/, (m, tr) => `${round(m[1], m[2])} — ${tr(m[3])}`],
    [/^Round (\d+)\/(\d+)$/, 'Manche $1/$2'],
    [/^Wave (\d+) — (\d+) fighters remaining$/, (m) => `Vague ${m[1]} — ${+m[2] <= 1 ? `${m[2]} chasseur restant` : `${m[2]} chasseurs restants`}`],
    [/^Hold out — escort ETA (\d+)s$/, 'Tenez bon — escorte dans $1 s'],
    [/^(\d+) enemy fighters? attacking$/, (m) => (+m[1] <= 1 ? `${m[1]} chasseur ennemi attaque` : `${m[1]} chasseurs ennemis attaquent`)],

    // ---- pilot HUD mode line ----
    [/^(MOUSE AIM|DIRECT) · (COCKPIT|CHASE)( · STALL)?$/, (m) => `${MODE[m[1]]} · ${MODE[m[2]]}${m[3] ? ' · DÉCROCHAGE' : ''}`],

    // ---- gunner HUD ----
    [new RegExp(`^${ST} — (RELOADING|BARREL HOT)$`), (m) => `${STATION[m[1]]} — ${m[2] === 'RELOADING' ? 'RECHARGEMENT' : 'CANON CHAUD'}`],
    [/^([1-5]) (LEFT WAIST|RIGHT WAIST|TOP TURRET|BALL TURRET|TAIL GUN)$/, (m) => `${m[1]} ${STATION_UP[m[2]]}`],
    [new RegExp(`^${ST} kills$`), (m) => `Victoires · ${STATION[m[1]]}`],

    // ---- tips ----
    [/^Fighters attacking the (.+) — press <kbd>(.+)<\/kbd>$/, (m, tr) => `Chasseurs sur le poste ${tr(m[1])} — appuyez sur <kbd>${m[2]}</kbd>`],
    [/^(\d+) fighters? in the (.+) arc — press <kbd>(.+)<\/kbd>$/, (m, tr) => `${pl(m[1], 'chasseur', 'chasseurs')} dans le secteur ${tr(m[2])} — appuyez sur <kbd>${m[3]}</kbd>`],
    [/^Graphics set to <kbd>(\w+)<\/kbd> to keep the frame rate up \(change in Settings\)$/, (m) => `Graphismes réglés sur <kbd>${QUALITY[m[1]] ?? m[1]}</kbd> pour garder la fluidité (modifiable dans les Paramètres)`],

    // ---- kill feed ----
    [/^([^—]{1,40}?) destroyed — AI gunner, (.+)$/, (m, tr) => `${tr(m[1])} détruit — mitrailleur IA, ${m[2]}`],
    [/^([^—]{1,40}?) destroyed — Escort P-51$/, (m, tr) => `${tr(m[1])} détruit — P-51 d'escorte`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed — (.+)$/, (m, tr) => `${tr(m[1])} détruit — ${tr(m[2])}`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed$/, (m, tr) => `${tr(m[1])} détruit`],
    [/^Double — \+(\d+)$/, 'Doublé — +$1'],
    [/^Triple — \+(\d+)$/, 'Triplé — +$1'],
    [/^(\d+)× — \+(\d+)$/, '$1× — +$2'],
    [/^B-17 "(.+)" going down$/, 'Le B-17 « $1 » tombe'],

    // ---- debrief reasons ----
    [/^(.+\.) The crew bailed out over enemy territory\.$/, (m, tr) => `${tr(m[1])} L'équipage a sauté au-dessus du territoire ennemi.`],
    [/^Both pilots were hit and the (.+) fell out of control\.$/, 'Les deux pilotes ont été touchés et le $1 est parti en perdition.'],
    [/^The (.+) was shot down\.$/, 'Le $1 a été abattu.'],
    [/^Too many bombers lost — (\d+) Fortresses went down\.$/, 'Trop de bombardiers perdus — $1 Forteresses abattues.'],

    // ---- loading ----
    [/^Loading aircraft and sounds… ([\d.]+) \/ ([\d.]+) MB$/, 'Chargement des avions et des sons… $1 / $2 Mo'],

    // ---- enemy marker label ----
    [/^(.+?) {2}(\d+)m$/, (m, tr) => `${tr(m[1])}  ${m[2]}m`],
  ],
};
export default table;
