// French for ar/theatre.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MARK = '(Double kill|Triple kill|\\d+× kill|Boss kill|Ace down|Close call|Near miss|Kill|Moment)';

const patterns: Pattern[] = [
  [/^(\d+)× kill$/, 'Victoire ×$1'],
  [/^Mission (\d+) · (.+)$/, (m, tr) => `Mission ${m[1]} · ${tr(m[2])}`],
  [new RegExp(`^${MARK} · (.+)$`), (m, tr) => `${tr(m[1])} · ${tr(m[2])}`],
  [/^You · (P-51|B-17)$/, 'Vous · $1'],
  [/^(.+) #(\d+)$/, (m, tr) => `${tr(m[1])} #${m[2]}`],
  [/^Saved (\d+)×(\d+) PNG$/, 'PNG $1×$2 enregistré'],
  [/^Moment saved \((\d+)\/(\d+)\)$/, 'Moment enregistré ($1/$2)'],
  [/^(\d+)\/(\d+) saved: delete one from Theatre in the title menu first$/, "$1/$2 enregistrés : supprimez-en un depuis Théâtre dans le menu principal d'abord"],
  [/^(\d+)\/(\d+) saved: delete one first$/, "$1/$2 enregistrés : supprimez-en un d'abord"],
];

const table: PhraseTable = {
  phrases: {
    // timeline moments
    'Double kill': 'Doublé',
    'Triple kill': 'Triplé',
    'Boss kill': 'Boss abattu',
    'Ace down': 'As abattu',
    'Close call': 'Chaud',
    'Near miss': 'Raté de peu',
    'Kill': 'Victoire',
    'Moment': 'Moment',
    'Replay': 'Rediffusion',
    'Mission': 'Mission',

    // playback interface
    'REPLAY THEATRE': 'THÉÂTRE DES REDIFFUSIONS',
    'Hide the interface (H)': "Masquer l'interface (H)",
    'Hide UI': "Masquer l'IU",
    'Back (Esc)': 'Retour (Échap)',
    'Exit': 'Quitter',
    'Camera': 'Caméra',
    'Player': 'Joueur',
    'Orbit': 'Orbite',
    'Free': 'Libre',
    'Director': 'Réalisateur',
    'Aircraft': 'Avions',
    '· Tab cycles': '· Tab pour changer',
    'Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–5 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit':
      "Espace lecture/pause · ←/→ image · Maj+←/→ 5 s · ,/. moments · 1–5 caméra · Libre : WASD Q/E, glisser pour regarder, Maj rapide · Orbite : glisser, molette · H masquer l'IU · Échap quitter",
    'Photo': 'Photo',
    'Field of view': 'Champ de vision',
    'Auto FOV': 'Champ auto',
    'Depth of field': 'Profondeur de champ',
    'Focus distance': 'Distance de mise au point',
    'Exposure': 'Exposition',
    'Resolution': 'Résolution',
    'Screen': 'Écran',
    '2× screen': '2× écran',
    '3× screen': '3× écran',
    'Save screenshot': "Enregistrer la capture d'écran",
    'Moments': 'Moments',
    'Keep the 15 s around the playhead (up to 5 saved)': 'Garder les 15 s autour de la tête de lecture (5 max.)',
    'Save moment': 'Enregistrer le moment',
    'Previous moment (,)': 'Moment précédent (,)',
    'Step back one frame (←)': 'Image précédente (←)',
    'Play / pause (Space)': 'Lecture / pause (Espace)',
    'Step forward one frame (→)': 'Image suivante (→)',
    'Next moment (.)': 'Moment suivant (.)',
    'H — SHOW INTERFACE': "H — AFFICHER L'INTERFACE",
    // phone / touch layout
    'TAP HERE TO SHOW THE INTERFACE': "TOUCHEZ ICI POUR AFFICHER L'INTERFACE",
    'Drag to orbit or look around · pinch with two fingers to zoom · Free camera: the move pad bottom left, ▲ ▼ up / down':
      'Glissez pour orbiter ou regarder · pincez à deux doigts pour zoomer · Caméra libre : pavé de déplacement en bas à gauche, ▲ ▼ monter / descendre',
    'Move the free camera': 'Déplacer la caméra libre',
    'Camera up': 'Monter la caméra',
    'Camera down': 'Descendre la caméra',
    'auto': 'auto',
    'off': 'désactivé',
    '{n} m': '{n} m',
    'Rendering…': 'Rendu…',
    'Saving…': 'Enregistrement…',
    'Screenshot failed': "Échec de la capture d'écran",
    'Nothing to save here': 'Rien à enregistrer ici',
    'Could not save (storage unavailable)': "Enregistrement impossible (stockage indisponible)",

    // saved moments library
    'Saved moments': 'Moments enregistrés',
    '{n} s': '{n} s',
    'Watch': 'Regarder',
    'Delete': 'Supprimer',
    'No saved moments yet. After a mission, open the Replay theatre from the debriefing and press “Save moment” (up to 5 are kept).':
      'Aucun moment enregistré. Après une mission, ouvrez le théâtre des rediffusions depuis le débriefing et appuyez sur « Enregistrer le moment » (5 au maximum).',
    'Replay theatre': 'Théâtre des rediffusions',
    'Theatre': 'Théâtre',
    'saved moments': 'moments enregistrés',
    'You': 'Vous',

    // FPS counter
    'fps': 'ips',
    'ms': 'ms',
    'Hz': 'Hz',
    'max {n}': 'max {n}',
    '{n}% res': 'rés. {n} %',
  },
  patterns,
};
export default table;
