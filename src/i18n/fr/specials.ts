import type { PhraseTable, Pattern } from '../types';

// French for ar/specials.ts (same keys and patterns).

const FIRST = ['otto', 'wilhelm', 'ernst', 'kurt', 'johann'];
const LAST = ['kessler', 'brandauer', 'falkenrath', 'reinholt', 'steinbrecher'];
const R_RANK = '(Hauptmann|Major|Oberleutnant)';
const R_SHORT = '(Hptm\\.|Maj\\.|Oblt\\.)';
const R_FIRST = `(${FIRST.join('|')})`;
const R_LAST = `(${LAST.join('|')})`;
const re = (s: string, flags = 'i') => new RegExp(`^${s}$`, flags);
const SIDE: Record<string, string> = { RIGHT: 'DROITE', LEFT: 'GAUCHE' };
const vic = (n: string) => `${n} ${+n <= 1 ? 'VICTOIRE' : 'VICTOIRES'}`;

const patterns: Pattern[] = [
  [re(`ACE SQUADRON · ${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `ESCADRILLE D’AS · ${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST}`), (m) => `${m[1]} ${m[2]} ${m[3]}`],
  [re(`ACE · (\\d+) VICTORIES`), (m) => `AS · ${vic(m[1])}`],
  [re(`${R_LAST}'s Staffel`), (m) => `Staffel de ${m[1]}`],
  [re(`${R_SHORT} ${R_LAST} · (\\d+)`), '$1 $2 · $3'],
  [re(`${R_SHORT} ${R_LAST} got away`), '$1 $2 s’est échappé'],
  [re(`${R_SHORT} ${R_LAST} shot down`), '$1 $2 abattu'],
  [re(`${R_SHORT} ${R_LAST}`), '$1 $2'],
  [re(R_LAST), '$1'],
  [re('(.+) \\(yellow nose\\)'), (m, tr) => `${tr(m[1])} (nez jaune)`],
  [re('\\+(\\d+) WINGMEN'), (m) => `+${m[1]} ${+m[1] <= 1 ? 'ÉQUIPIER' : 'ÉQUIPIERS'}`],
  [re(`Yellow noses, twelve o'clock high! That's ${R_LAST}'s Staffel — (\\d+) kills!`),
    (m) => `Nez jaunes, midi haut ! C’est la Staffel de ${m[1]} — ${m[2]} victoires !`],
  [re(`${R_LAST} is breaking off — the yellow noses are heading home\\.`), '$1 décroche — les nez jaunes rentrent chez eux.'],
  [re(`You got ${R_LAST}! The whole group saw him go down!`), 'Vous avez eu $1 ! Tout le groupe l’a vu tomber !'],
  [re(`Somebody got ${R_LAST}! Scratch one Experte!`), 'Quelqu’un a eu $1 ! Un Experte de moins !'],
  [re(`Viermots ahead\\. ${R_LAST} here — the fat one in the middle is mine\\. Horrido!`), 'Viermots devant. Ici $1 — le gros au milieu est pour moi. Horrido !'],
  [/^Achtung, Amis\. Number (\d+) is flying in that box\. Pauke, pauke!$/, 'Achtung, Amis. Le numéro $1 vole dans ce box. Pauke, Pauke !'],

  [/^(\d+) HEAVY FIGHTERS WITH ROCKETS$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'CHASSEUR LOURD' : 'CHASSEURS LOURDS'} À ROQUETTES`],
  [/^(\d+) \/ (\d+) LEFT$/, 'RESTE $1 / $2'],
  [/^(\d+) LAUNCHERS?$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'LANCEUR' : 'LANCEURS'}`],

  [/^HEAD-ON ×(\d+)$/, 'DE FACE ×$1'],
  [/^109s diving on (.+)! She's out of formation — they're going for her!$/, 'Des 109 piquent sur $1 ! Il est hors formation — ils foncent dessus !'],
  [/^(.+) hanging back out of range — he's got rocket tubes! He'll lob them in from a kilometre!$/,
    (m, tr) => `${tr(m[1])} reste hors de portée — il a des tubes lance-roquettes ! Il va tirer à un kilomètre !`],
  [/^Zerstörers! Twin-engine destroyers forming up at (.+) — they're carrying rockets!$/,
    (m, tr) => `Zerstörer ! Des bimoteurs se forment à ${tr(m[1])} — ils portent des roquettes !`],
  [/^Zerstörer formation on the <b>(RIGHT|LEFT)<\/b> — <kbd>(\d)<\/kbd> (right|left) waist · break them up before they fire$/,
    (m) => `Formation de Zerstörer à <b>${SIDE[m[1]]}</b> — <kbd>${m[2]}</kbd> sabord ${m[3] === 'right' ? 'droit' : 'gauche'} · dispersez-les avant qu’ils tirent`],
];

const table: PhraseTable = {
  phrases: {
    'SPECIAL EVENT': 'ÉVÉNEMENT SPÉCIAL',
    'Yellow noses — bring down the Staffelkapitän': 'Nez jaunes — abattez le Staffelkapitän',
    'The aces are coming head-on — <b>TOP TURRET</b> <kbd>3</kbd> · bring down the leader': 'Les as attaquent de face — <b>TOURELLE DORSALE</b> <kbd>3</kbd> · abattez le chef',
    'ALONE': 'SEUL',
    'ACE': 'AS',
    'Ace down': 'As abattu',
    'Zerstörer wave': 'Vague de Zerstörer',
    'Break up the formation before the salvos land': 'Dispersez la formation avant les salves',
    'Zerstörer wave broken up': 'Vague de Zerstörer dispersée',
    'Rocket barrage': 'Barrage de roquettes',
    'Shoot down the launchers standing off at 1 km': 'Abattez les lanceurs qui restent à 1 km',
    'SHOOT DOWN THE LAUNCHERS': 'ABATTEZ LES LANCEURS',
    'Launchers on <b>BOTH BEAMS</b> — <kbd>1</kbd> left · <kbd>2</kbd> right waist': 'Lanceurs sur <b>LES DEUX FLANCS</b> — <kbd>1</kbd> sabord gauche · <kbd>2</kbd> sabord droit',
    'Rocket barrage broken up': 'Barrage de roquettes brisé',
    'LAUNCHER': 'LANCEUR',

    "That's the last of the destroyers! Nice work, boys.": 'C’était le dernier Zerstörer ! Beau travail, les gars.',
    "Launchers are down! That's the end of the rockets.": 'Les lanceurs sont abattus ! Fini les roquettes.',
    "They're out of rockets — the heavies are heading home.": 'Plus de roquettes — les lourds rentrent chez eux.',
    'Close up, Kinder. We go through them together — and nobody turns away before me.': 'Serrez, Kinder. On les traverse ensemble — et personne ne dégage avant moi.',
    'Indianer at the bombers? Let them come. Today I paint another bar on my rudder.': 'Des Indianer près des bombardiers ? Qu’ils viennent. Aujourd’hui, je peins une barre de plus sur ma dérive.',

    'PINCER': 'TENAILLE',
    'KOMET': 'KOMET',
    'JET': 'JET',
    'ROCKETS': 'ROQUETTES',
    'ZERSTÖRER': 'ZERSTÖRER',
    'TOP COVER': 'COUVERTURE HAUTE',
    'BARRAGE': 'BARRAGE',

    "They're forming up for a head-on pass! Twelve o'clock high — a whole line of them!": 'Ils se forment pour une passe de face ! Midi haut — toute une ligne !',
    "Schwarm forming up dead ahead, twelve o'clock high! Head-on pass coming!": 'Un Schwarm se forme droit devant, midi haut ! Passe de face imminente !',
    "Head-on attack forming at <b>12 O'CLOCK HIGH</b> — take the <b>TOP TURRET</b> <kbd>3</kbd>": 'Attaque de face à <b>MIDI HAUT</b> — prenez la <b>TOURELLE DORSALE</b> <kbd>3</kbd>',
    "Two pairs splitting up — one each side! Three o'clock and nine o'clock, they're going to hit us together!": 'Deux paires se séparent — une de chaque côté ! Trois heures et neuf heures, ils vont frapper ensemble !',
    'Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right': 'Tenaille sur <b>LES DEUX FLANCS</b> — choisissez un sabord : <kbd>1</kbd> gauche · <kbd>2</kbd> droit',
    "Komet! Rocket fighter climbing up from six o'clock low — he's fast!": 'Komet ! Chasseur-fusée qui monte à six heures bas — il est rapide !',
    "They're turning in — rockets!": 'Ils virent vers nous — roquettes !',
    'Here come the 109s — straight down out of the sun!': 'Voilà les 109 — ils plongent depuis le soleil !',
    'Flak coming up — heavy guns below us. Hold steady.': 'La flak monte — grosses pièces sous nous. Tenez bon.',
    "Me 163 climbing from <b>6 O'CLOCK LOW</b> — <b>BALL</b> <kbd>4</kbd> or <b>TAIL</b> <kbd>5</kbd>": 'Me 163 qui monte à <b>SIX HEURES BAS</b> — <b>VENTRALE</b> <kbd>4</kbd> ou <b>QUEUE</b> <kbd>5</kbd>',
    "Jet coming up from six o'clock! Never seen anything that fast!": 'Un jet arrive à six heures ! Jamais rien vu d’aussi rapide !',
    "109s staying up high — top cover. They'll pounce on anybody who drops out of formation!": 'Des 109 restent en haut — couverture haute. Ils fondront sur quiconque quitte la formation !',
  },
  patterns,
};
export default table;
