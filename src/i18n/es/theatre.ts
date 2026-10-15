// Spanish for ar/theatre.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MARK = '(Double kill|Triple kill|\\d+× kill|Boss kill|Ace down|Close call|Near miss|Kill|Moment)';

const patterns: Pattern[] = [
  [/^(\d+)× kill$/, 'Derribo ×$1'],
  [/^Mission (\d+) · (.+)$/, (m, tr) => `Misión ${m[1]} · ${tr(m[2])}`],
  [new RegExp(`^${MARK} · (.+)$`), (m, tr) => `${tr(m[1])} · ${tr(m[2])}`],
  [/^You · (P-51|B-17)$/, 'Tú · $1'],
  [/^(.+) #(\d+)$/, (m, tr) => `${tr(m[1])} #${m[2]}`],
  [/^Saved (\d+)×(\d+) PNG$/, 'PNG de $1×$2 guardado'],
  [/^Moment saved \((\d+)\/(\d+)\)$/, 'Momento guardado ($1/$2)'],
  [/^(\d+)\/(\d+) saved: delete one from Theatre in the title menu first$/, '$1/$2 guardados: borra antes uno desde Sala en el menú principal'],
  [/^(\d+)\/(\d+) saved: delete one first$/, '$1/$2 guardados: borra uno antes'],
];

const table: PhraseTable = {
  phrases: {
    // timeline moments
    'Double kill': 'Doble derribo',
    'Triple kill': 'Triple derribo',
    'Boss kill': 'Jefe derribado',
    'Ace down': 'As derribado',
    'Close call': 'Por los pelos',
    'Near miss': 'Casi',
    'Kill': 'Derribo',
    'Moment': 'Momento',
    'Replay': 'Repetición',
    'Mission': 'Misión',

    // playback interface
    'REPLAY THEATRE': 'SALA DE REPETICIONES',
    'Hide the interface (H)': 'Ocultar la interfaz (H)',
    'Hide UI': 'Ocultar IU',
    'Back (Esc)': 'Volver (Esc)',
    'Exit': 'Salir',
    'Camera': 'Cámara',
    'Player': 'Jugador',
    'Orbit': 'Órbita',
    'Free': 'Libre',
    'Director': 'Director',
    'Aircraft': 'Aviones',
    '· Tab cycles': '· Tab para cambiar',
    'Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–5 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit':
      'Espacio reproducir/pausa · ←/→ fotograma · Mayús+←/→ 5 s · ,/. momentos · 1–5 cámara · Libre: WASD Q/E, arrastra para mirar, Mayús rápido · Órbita: arrastrar, rueda · H ocultar IU · Esc salir',
    'Photo': 'Foto',
    'Field of view': 'Campo de visión',
    'Auto FOV': 'Campo de visión auto',
    'Depth of field': 'Profundidad de campo',
    'Focus distance': 'Distancia de enfoque',
    'Exposure': 'Exposición',
    'Resolution': 'Resolución',
    'Screen': 'Pantalla',
    '2× screen': '2× pantalla',
    '3× screen': '3× pantalla',
    'Save screenshot': 'Guardar captura',
    'Moments': 'Momentos',
    'Keep the 15 s around the playhead (up to 5 saved)': 'Guarda los 15 s alrededor del cabezal (hasta 5)',
    'Save moment': 'Guardar momento',
    'Previous moment (,)': 'Momento anterior (,)',
    'Step back one frame (←)': 'Retroceder un fotograma (←)',
    'Play / pause (Space)': 'Reproducir / pausa (Espacio)',
    'Step forward one frame (→)': 'Avanzar un fotograma (→)',
    'Next moment (.)': 'Momento siguiente (.)',
    'H — SHOW INTERFACE': 'H — MOSTRAR INTERFAZ',
    // phone / touch layout
    'TAP HERE TO SHOW THE INTERFACE': 'TOCA AQUÍ PARA MOSTRAR LA INTERFAZ',
    'Drag to orbit or look around · pinch with two fingers to zoom · Free camera: the move pad bottom left, ▲ ▼ up / down':
      'Arrastra para orbitar o mirar · pellizca con dos dedos para el zoom · Cámara libre: el pad de movimiento abajo a la izquierda, ▲ ▼ subir / bajar',
    'Move the free camera': 'Mover la cámara libre',
    'Camera up': 'Subir cámara',
    'Camera down': 'Bajar cámara',
    'auto': 'auto',
    'off': 'no',
    '{n} m': '{n} m',
    'Rendering…': 'Renderizando…',
    'Saving…': 'Guardando…',
    'Screenshot failed': 'Error al guardar la captura',
    'Nothing to save here': 'Aquí no hay nada que guardar',
    'Could not save (storage unavailable)': 'No se pudo guardar (almacenamiento no disponible)',

    // saved moments library
    'Saved moments': 'Momentos guardados',
    '{n} s': '{n} s',
    'Watch': 'Ver',
    'Delete': 'Borrar',
    'No saved moments yet. After a mission, open the Replay theatre from the debriefing and press “Save moment” (up to 5 are kept).':
      'Aún no hay momentos guardados. Tras una misión, abre la sala de repeticiones desde el informe y pulsa “Guardar momento” (se guardan hasta 5).',
    'Replay theatre': 'Sala de repeticiones',
    'Theatre': 'Sala',
    'saved moments': 'momentos guardados',
    'You': 'Tú',

    // FPS counter
    'fps': 'fps',
    'ms': 'ms',
    'Hz': 'Hz',
    'max {n}': 'máx. {n}',
    '{n}% res': 'res. {n} %',
  },
  patterns,
};
export default table;
