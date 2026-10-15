// Gamepad button remapping, the gamepad twin of KeyMap. GamepadInput keeps asking for the
// default (logical) buttons (RT = fire, X = reload, ...); while a mission is being flown the
// physical buttons are translated through a permutation first, so a player who moves Fire to
// RB presses RB and Gamepad.ts still sees RT. Binding a button that another action holds
// swaps the two, so every button always has exactly one meaning.
//
// Start (pause) and View (controls card / chord modifier) are fixed so the player can never
// lock themselves out. Menus, photo mode and the replay theatre use the standard layout.
//
// Saved in localStorage under its own key.

export type PadActionId = 'fire' | 'zoom' | 'reload' | 'bombsight' | 'prevGun' | 'nextGun' | 'map' | 'ping'
  | 'wingAttack' | 'wingProtect' | 'mustangs' | 'overdrive' | 'focus' | 'look';

export interface PadActionDef { id: PadActionId; label: string; def: number }

// standard-mapping button indices (same numbers as Gamepad.ts B)
export const PAD_START = 9, PAD_BACK = 8;
export const PAD_RESERVED: readonly number[] = [PAD_BACK, PAD_START];

// def = the logical button Gamepad.ts reads for the action (and its default)
export const PAD_ACTIONS: readonly PadActionDef[] = [
  { id: 'fire', label: 'Fire', def: 7 },
  { id: 'zoom', label: 'Zoom / look down the sight', def: 6 },
  { id: 'reload', label: 'Reload, or answer an emergency prompt', def: 2 },
  { id: 'bombsight', label: 'Bombsight (P-51: cockpit / chase view)', def: 3 },
  { id: 'prevGun', label: 'Previous gun position', def: 4 },
  { id: 'nextGun', label: 'Next gun position', def: 5 },
  { id: 'map', label: 'Big radar map', def: 12 },
  { id: 'ping', label: 'Ping target (P-51: wingman cover me)', def: 15 },
  { id: 'wingAttack', label: 'P-51 wingman: attack my target', def: 14 },
  { id: 'wingProtect', label: 'P-51 wingman: protect the bombers', def: 13 },
  { id: 'mustangs', label: 'Ability: call the Mustangs', def: 0 },
  { id: 'overdrive', label: 'Ability: Overdrive', def: 1 },
  { id: 'focus', label: 'Ability: Focus', def: 10 },
  { id: 'look', label: 'Free look (hold)', def: 11 },
];

const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '✚↑', '✚↓', '✚←', '✚→'];

/** Printed name of a standard-mapping button (Xbox names, ✚ = the D-pad). */
export function padButtonLabel(i: number): string { return NAMES[i] ?? `#${i}`; }

const STORE_KEY = 'sws3d.pad.v1';

export type PadBindings = Record<PadActionId, number>;

export function defaultPadBindings(): PadBindings {
  const b = {} as PadBindings;
  for (const a of PAD_ACTIONS) b[a.id] = a.def;
  return b;
}

/** Physical -> logical button table (identity for every button no action has moved). */
export function buildPadTable(b: PadBindings, size = 17): number[] {
  const t = Array.from({ length: size }, (_, i) => i);
  for (const a of PAD_ACTIONS) if (b[a.id] < size) t[b[a.id]] = a.def;
  return t;
}

export type PadBindResult = { ok: true; swapped?: PadActionId } | { ok: false; reason: string };

export class PadMap {
  bindings: PadBindings = defaultPadBindings();
  /** physical button -> logical button (read every frame by GamepadInput) */
  table: number[] = buildPadTable(this.bindings);
  /** the settings screen is waiting for a button for this action */
  capturing: PadActionId | null = null;
  /** called with the pressed button (or -1 = cancelled) when a capture ends */
  onCapture?: (button: number) => void;
  onChange?: () => void;

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
      const raw = this.storage?.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PadBindings>;
        const next = defaultPadBindings();
        for (const a of PAD_ACTIONS) if (Number.isInteger(saved[a.id])) next[a.id] = saved[a.id]!;
        // only a clean permutation of the remappable buttons is accepted
        if (valid(next)) this.bindings = next;
      }
    } catch { /* storage unavailable or corrupt: defaults */ }
    this.table = buildPadTable(this.bindings);
  }

  private save() {
    this.table = buildPadTable(this.bindings);
    try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.bindings)); } catch { /* storage unavailable */ }
    this.onChange?.();
  }

  /** Bind an action to a physical button; the action holding it takes this one's old button. */
  bind(id: PadActionId, button: number): PadBindResult {
    if (PAD_RESERVED.includes(button)) return { ok: false, reason: 'reserved' };
    if (!PAD_ACTIONS.some((a) => a.def === button)) return { ok: false, reason: 'unknown' };
    const old = this.bindings[id];
    let swapped: PadActionId | undefined;
    for (const a of PAD_ACTIONS) if (a.id !== id && this.bindings[a.id] === button) { this.bindings[a.id] = old; swapped = a.id; }
    this.bindings[id] = button;
    this.save();
    return { ok: true, swapped };
  }

  reset() { this.bindings = defaultPadBindings(); this.save(); }

  isDefault() { return PAD_ACTIONS.every((a) => this.bindings[a.id] === a.def); }

  /** Logical button for a physical one. */
  logical(physical: number) { return this.table[physical] ?? physical; }

  /** Printed name of the button bound to an action. */
  label(id: PadActionId) { return padButtonLabel(this.bindings[id]); }

  startCapture(id: PadActionId, done: (button: number) => void) {
    this.capturing = id;
    this.onCapture = done;
  }

  /** GamepadInput: a button was pressed while capturing (-1 = cancel). */
  finishCapture(button: number) {
    const done = this.onCapture;
    this.capturing = null;
    this.onCapture = undefined;
    done?.(button);
  }
}

function valid(b: PadBindings) {
  const seen = new Set<number>();
  for (const a of PAD_ACTIONS) {
    const v = b[a.id];
    if (seen.has(v) || PAD_RESERVED.includes(v) || !PAD_ACTIONS.some((x) => x.def === v)) return false;
    seen.add(v);
  }
  return true;
}

export const padMap = new PadMap();
