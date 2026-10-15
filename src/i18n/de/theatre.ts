// German for ar/theatre.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MARK = '(Double kill|Triple kill|\\d+× kill|Boss kill|Ace down|Close call|Near miss|Kill|Moment)';

const patterns: Pattern[] = [
  [/^(\d+)× kill$/, '$1-facher Abschuss'],
  [/^Mission (\d+) · (.+)$/, (m, tr) => `Einsatz ${m[1]} · ${tr(m[2])}`],
  [new RegExp(`^${MARK} · (.+)$`), (m, tr) => `${tr(m[1])} · ${tr(m[2])}`],
  [/^You · (P-51|B-17)$/, 'Du · $1'],
  [/^(.+) #(\d+)$/, (m, tr) => `${tr(m[1])} #${m[2]}`],
  [/^Saved (\d+)×(\d+) PNG$/, 'PNG $1×$2 gespeichert'],
  [/^Moment saved \((\d+)\/(\d+)\)$/, 'Moment gespeichert ($1/$2)'],
  [/^(\d+)\/(\d+) saved: delete one from Theatre in the title menu first$/, '$1/$2 gespeichert: Lösch zuerst einen im Kino im Hauptmenü'],
  [/^(\d+)\/(\d+) saved: delete one first$/, '$1/$2 gespeichert: Lösch zuerst einen'],
];

const table: PhraseTable = {
  phrases: {
    // timeline moments
    'Double kill': 'Doppelabschuss',
    'Triple kill': 'Dreifachabschuss',
    'Boss kill': 'Boss abgeschossen',
    'Ace down': 'Ass abgeschossen',
    'Close call': 'Knapp entkommen',
    'Near miss': 'Knapp vorbei',
    'Kill': 'Abschuss',
    'Moment': 'Moment',
    'Replay': 'Wiederholung',
    'Mission': 'Einsatz',

    // playback interface
    'REPLAY THEATRE': 'WIEDERHOLUNGS-KINO',
    'Hide the interface (H)': 'Oberfläche ausblenden (H)',
    'Hide UI': 'UI ausblenden',
    'Back (Esc)': 'Zurück (Esc)',
    'Exit': 'Beenden',
    'Camera': 'Kamera',
    'Player': 'Spieler',
    'Orbit': 'Orbit',
    'Free': 'Frei',
    'Director': 'Regie',
    'Aircraft': 'Flugzeuge',
    '· Tab cycles': '· Tab wechselt',
    'Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–5 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit':
      'Leertaste Wiedergabe/Pause · ←/→ Bild · Shift+←/→ 5 s · ,/. Momente · 1–5 Kamera · Frei: WASD Q/E, ziehen zum Umsehen, Shift schnell · Orbit: ziehen, Mausrad · H UI ausblenden · Esc beenden',
    'Photo': 'Foto',
    'Field of view': 'Sichtfeld',
    'Auto FOV': 'Auto-Sichtfeld',
    'Depth of field': 'Schärfentiefe',
    'Focus distance': 'Fokusdistanz',
    'Exposure': 'Belichtung',
    'Resolution': 'Auflösung',
    'Screen': 'Bildschirm',
    '2× screen': '2× Bildschirm',
    '3× screen': '3× Bildschirm',
    'Save screenshot': 'Screenshot speichern',
    'Moments': 'Momente',
    'Keep the 15 s around the playhead (up to 5 saved)': 'Die 15 s um den Abspielkopf behalten (bis zu 5)',
    'Save moment': 'Moment speichern',
    'Previous moment (,)': 'Vorheriger Moment (,)',
    'Step back one frame (←)': 'Ein Bild zurück (←)',
    'Play / pause (Space)': 'Wiedergabe / Pause (Leertaste)',
    'Step forward one frame (→)': 'Ein Bild vor (→)',
    'Next moment (.)': 'Nächster Moment (.)',
    'H — SHOW INTERFACE': 'H — OBERFLÄCHE ZEIGEN',
    // phone / touch layout
    'TAP HERE TO SHOW THE INTERFACE': 'HIER TIPPEN, UM DIE OBERFLÄCHE ZU ZEIGEN',
    'Drag to orbit or look around · pinch with two fingers to zoom · Free camera: the move pad bottom left, ▲ ▼ up / down':
      'Ziehen zum Kreisen oder Umsehen · mit zwei Fingern zoomen · Freie Kamera: Steuerfeld unten links, ▲ ▼ hoch / runter',
    'Move the free camera': 'Freie Kamera bewegen',
    'Camera up': 'Kamera hoch',
    'Camera down': 'Kamera runter',
    'auto': 'auto',
    'off': 'aus',
    '{n} m': '{n} m',
    'Rendering…': 'Rendern…',
    'Saving…': 'Speichern…',
    'Screenshot failed': 'Screenshot fehlgeschlagen',
    'Nothing to save here': 'Hier gibt es nichts zu speichern',
    'Could not save (storage unavailable)': 'Speichern nicht möglich (Speicher nicht verfügbar)',

    // saved moments library
    'Saved moments': 'Gespeicherte Momente',
    '{n} s': '{n} s',
    'Watch': 'Ansehen',
    'Delete': 'Löschen',
    'No saved moments yet. After a mission, open the Replay theatre from the debriefing and press “Save moment” (up to 5 are kept).':
      'Noch keine gespeicherten Momente. Öffne nach einem Einsatz das Wiederholungs-Kino aus der Nachbesprechung und drück „Moment speichern“ (bis zu 5 bleiben erhalten).',
    'Replay theatre': 'Wiederholungs-Kino',
    'Theatre': 'Kino',
    'saved moments': 'gespeicherte Momente',
    'You': 'Du',

    // FPS counter
    'fps': 'fps',
    'ms': 'ms',
    'Hz': 'Hz',
    'max {n}': 'max. {n}',
    '{n}% res': '{n} % Aufl.',
  },
  patterns,
};
export default table;
