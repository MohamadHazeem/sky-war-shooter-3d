// Key remapping for the main actions. The game code keeps asking for the default codes
// (input.hit('KeyR'), e.code === 'Tab', ...); Input translates every physical key press to
// the code of the action it is bound to before anyone else sees it. So a player who binds
// Reload to T presses T and the game still receives 'KeyR'. While a mission is being
// played, a default key that has been moved to another action is switched off, so the old
// key no longer triggers it.
//
// Saved in localStorage under its own key so it never collides with the main Settings.

export type ActionId = 'fire' | 'zoom' | 'reload' | 'map' | 'seat1' | 'seat2' | 'seat3' | 'seat4' | 'seat5' | 'pause' | 'help';

export interface ActionDef { id: ActionId; label: string; def: string }

// def = the code the game listens for (and the default binding)
export const ACTIONS: readonly ActionDef[] = [
  { id: 'fire', label: 'Fire (alternative to the left button)', def: 'Space' },
  { id: 'zoom', label: 'Zoom / look down the sight (alternative to the right button)', def: 'KeyB' },
  { id: 'reload', label: 'Reload', def: 'KeyR' },
  { id: 'map', label: 'Big radar map', def: 'Tab' },
  { id: 'seat1', label: 'Gun position 1', def: 'Digit1' },
  { id: 'seat2', label: 'Gun position 2', def: 'Digit2' },
  { id: 'seat3', label: 'Gun position 3', def: 'Digit3' },
  { id: 'seat4', label: 'Gun position 4', def: 'Digit4' },
  { id: 'seat5', label: 'Gun position 5', def: 'Digit5' },
  { id: 'pause', label: 'Pause', def: 'KeyP' },
  { id: 'help', label: 'Controls card', def: 'KeyH' },
];

// Keys with a fixed meaning elsewhere in the game: they cannot take a remappable action.
export const RESERVED: Readonly<Record<string, string>> = {
  Escape: 'pause / back', F1: 'controls card',
  KeyW: 'throttle', KeyS: 'throttle', KeyA: 'rudder', KeyD: 'rudder', KeyQ: 'roll', KeyE: 'roll',
  KeyV: 'P-51 view', KeyC: 'free look', KeyM: 'flight mode', KeyF: 'photo mode',
  KeyI: 'keyboard aim', KeyJ: 'keyboard aim', KeyK: 'keyboard aim', KeyL: 'keyboard aim',
  ArrowUp: 'keyboard aim', ArrowDown: 'keyboard aim', ArrowLeft: 'keyboard aim', ArrowRight: 'keyboard aim',
  ShiftLeft: 'photo mode', ShiftRight: 'photo mode', Enter: 'menus',
  MetaLeft: 'system', MetaRight: 'system', AltLeft: 'system', AltRight: 'system', ControlLeft: 'system', ControlRight: 'system',
};

const STORE_KEY = 'sws3d.keys.v1';

export type Bindings = Record<ActionId, string>;

export function defaultBindings(): Bindings {
  const b = {} as Bindings;
  for (const a of ACTIONS) b[a.id] = a.def;
  return b;
}

// Physical code -> logical code ('' = switched off). Codes not in the table pass through.
export function buildTranslation(b: Bindings): Map<string, string> {
  const map = new Map<string, string>();
  const bound = new Set(Object.values(b));
  for (const a of ACTIONS) {
    const key = b[a.id];
    if (key === a.def) continue;
    map.set(key, a.def);
    // the old default key stops doing this action, unless it is now bound to something else
    if (!bound.has(a.def) && !map.has(a.def)) map.set(a.def, '');
  }
  return map;
}

export type BindResult = { ok: true; swapped?: ActionId } | { ok: false; reason: string };

export class KeyMap {
  bindings: Bindings = defaultBindings();
  private table = new Map<string, string>();
  capturing = false;  // the settings screen is waiting for a key: no translation
  onChange?: () => void;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
      const raw = this.storage?.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Bindings>;
        for (const a of ACTIONS) if (typeof saved[a.id] === 'string' && saved[a.id]) this.bindings[a.id] = saved[a.id]!;
      }
    } catch { /* storage unavailable or corrupt: defaults */ }
    this.rebuild();
  }

  private rebuild() { this.table = buildTranslation(this.bindings); }

  private save() {
    try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.bindings)); } catch { /* storage unavailable */ }
    this.onChange?.();
  }

  /** Bind an action to a physical key. Another action holding that key swaps onto the old one. */
  bind(id: ActionId, code: string): BindResult {
    if (RESERVED[code]) return { ok: false, reason: `${keyLabel(code)} is used for ${RESERVED[code]}` };
    const old = this.bindings[id];
    let swapped: ActionId | undefined;
    for (const a of ACTIONS) if (a.id !== id && this.bindings[a.id] === code) { this.bindings[a.id] = old; swapped = a.id; }
    this.bindings[id] = code;
    this.rebuild();
    this.save();
    return { ok: true, swapped };
  }

  reset() {
    this.bindings = defaultBindings();
    this.rebuild();
    this.save();
  }

  isDefault() { return ACTIONS.every((a) => this.bindings[a.id] === a.def); }

  /** Logical code for a physical key ('' = switched off while playing). */
  translate(code: string, playing: boolean): string {
    const t = this.table.get(code);
    if (t === undefined) return code;
    if (t === '' && !playing) return code;  // in menus the old key keeps its native meaning
    return t;
  }

  /** Display label of the key bound to an action. */
  label(id: ActionId) { return keyLabel(this.bindings[id]); }
}

export function keyLabel(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names: Record<string, string> = {
    Space: 'Space', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps',
    Backspace: 'Bksp', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  };
  return names[code] ?? code;
}

// The `key` value a synthetic event for a logical code carries (menus read e.key)
export function keyValue(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return ' ';
  return code;
}

export const keyMap = new KeyMap();
