// The structural parts of an aircraft, and where each one is on the model. Pure data and
// arithmetic (no three.js), shared by the failure model, the mesh splitter and the tests.
//
// Every fighter-sized model is cut into the same seven parts (model frame: metres, +Z nose,
// +X left wing, +Y up; the frame every model in public/models uses):
//
//   core      centre fuselage with the cockpit and the wing centre section. Never comes off.
//   nose      engine and cowling (single-engine types), the glazed nose (twins)
//   tail      rear fuselage, tailplane and fin
//   wingL     left wing from the root to the outer panel joint (twins: with the engine nacelle)
//   wingLtip  left outer wing panel
//   wingR     right wing, as wingL
//   wingRtip  right outer wing panel
//
// Hero models can name their parts instead of being cut by position: see
// docs/phase10/09-parts-contract.md (part_<name>, joint_<name> and fuel_<name> nodes).

export const PART_NAMES = ['core', 'nose', 'tail', 'wingL', 'wingLtip', 'wingR', 'wingRtip'] as const;
export type PartName = typeof PART_NAMES[number];
export const CORE = 0, NOSE = 1, TAIL = 2, WING_L = 3, WING_L_TIP = 4, WING_R = 5, WING_R_TIP = 6;
export const PART_COUNT = PART_NAMES.length;

/** The part each part hangs from (-1: the core). A part that comes off takes its children with it. */
export const PARENT: readonly number[] = [-1, CORE, CORE, CORE, WING_L, CORE, WING_R];
/** Losing it dooms the aircraft (the outer panels do not: a fighter can limp home without a wingtip). */
export const FATAL: readonly boolean[] = [false, true, true, true, false, true, false];
/** Can be shot or burned off (the core and the engine only part in an explosion). */
export const DETACHABLE: readonly boolean[] = [false, false, true, true, true, true, true];
/** Structural neighbours, for fire spread. */
export const NEIGHBOURS: readonly (readonly number[])[] = [
  [NOSE, TAIL, WING_L, WING_R], [CORE], [CORE], [CORE, WING_L_TIP], [WING_L], [CORE, WING_R_TIP], [WING_R],
];
/** The hit zone (Fighter zones in Aircraft.ts) whose hit points this part's strength is derived from. */
export const PART_ZONE: readonly string[] = ['fuselage', 'engine', 'tail', 'wingL', 'wingL', 'wingR', 'wingR'];
/** Part strength as a share of its zone's hp: an outer panel goes long before the root does. */
export const HP_SHARE: readonly number[] = [1.2, 1.1, 1.0, 0.95, 0.38, 0.95, 0.38];

/** +1 for the left side (+X), -1 for the right side, 0 on the centre line. */
export const sideOf = (part: number) => (part === WING_L || part === WING_L_TIP ? 1 : part === WING_R || part === WING_R_TIP ? -1 : 0);
export const isWing = (part: number) => part >= WING_L;
/** Bit mask of a part and every part hanging from it. */
export function subtree(part: number): number {
  let m = 1 << part;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < PART_COUNT; i++) if (!(m & (1 << i)) && PARENT[i] >= 0 && (m & (1 << PARENT[i]))) { m |= 1 << i; changed = true; }
  }
  return m;
}

// Where the cuts are, as shares of the model's size: root/tip of the semi-span, tail/nose of the
// length from the aft/fore end, tailX the half-span of the tailplane box (share of the semi-span).
export interface LayoutShares { root: number; tip: number; tail: number; tailX: number; nose: number }
export interface KindSpec {
  shares: LayoutShares;
  mass: number;                  // kg, loaded
  massShare: readonly number[];  // per part (normalised)
  fuel: readonly number[];       // per part: 0 none, 1 a full tank, >1 explosive (rocket fuel)
}

const SINGLE = [0.3, 0.3, 0.08, 0.1, 0.03, 0.1, 0.03];   // engine in the nose
const TWIN = [0.34, 0.06, 0.1, 0.2, 0.04, 0.2, 0.04];    // engines in the wings
const fuel = (core: number, wings: number, nose = 0.25) => [core, nose, 0, wings, 0, wings, 0];

const KINDS: Record<string, KindSpec> = {
  b17: { shares: { root: 0.14, tip: 0.62, tail: 0.29, tailX: 0.38, nose: 0.19 }, mass: 25400, massShare: [0.32, 0.06, 0.10, 0.21, 0.05, 0.21, 0.05], fuel: fuel(0, 1.5, 0) },
  // Fw 190 A: fuel in two tanks under the cockpit floor
  fw190: { shares: { root: 0.12, tip: 0.6, tail: 0.31, tailX: 0.42, nose: 0.2 }, mass: 4300, massShare: SINGLE, fuel: fuel(1, 0) },
  // Bf 109 G: the L-shaped tank under and behind the pilot
  bf109: { shares: { root: 0.12, tip: 0.6, tail: 0.31, tailX: 0.42, nose: 0.22 }, mass: 3400, massShare: SINGLE, fuel: fuel(1, 0) },
  // P-51D: wing tanks and the fuselage tank behind the pilot
  p51d: { shares: { root: 0.11, tip: 0.6, tail: 0.3, tailX: 0.4, nose: 0.2 }, mass: 4600, massShare: SINGLE, fuel: fuel(0.6, 1) },
  p47d: { shares: { root: 0.13, tip: 0.54, tail: 0.18, tailX: 0.4, nose: 0.22 }, mass: 6500, massShare: SINGLE, fuel: fuel(1, 0) },
  spitfire9: { shares: { root: 0.12, tip: 0.5, tail: 0.18, tailX: 0.3, nose: 0.22 }, mass: 3400, massShare: SINGLE, fuel: fuel(1, 0) },
  bf110: { shares: { root: 0.1, tip: 0.62, tail: 0.28, tailX: 0.44, nose: 0.16 }, mass: 7800, massShare: TWIN, fuel: fuel(0.4, 1, 0) },
  ju88: { shares: { root: 0.1, tip: 0.64, tail: 0.28, tailX: 0.4, nose: 0.14 }, mass: 11000, massShare: TWIN, fuel: fuel(0.6, 1, 0) },
  he111: { shares: { root: 0.09, tip: 0.64, tail: 0.27, tailX: 0.36, nose: 0.12 }, mass: 12000, massShare: TWIN, fuel: fuel(0.4, 1, 0) },
  // Me 262: jets under the wings, fuel fore and aft of the cockpit
  me262: { shares: { root: 0.1, tip: 0.6, tail: 0.27, tailX: 0.4, nose: 0.16 }, mass: 6400, massShare: TWIN, fuel: fuel(1, 0.2, 0) },
  // Me 163: tailless; the fin is the only tail. T-Stoff in the fuselage: violently explosive
  me163: { shares: { root: 0.14, tip: 0.62, tail: 0.2, tailX: 0.16, nose: 0.14 }, mass: 4300, massShare: [0.5, 0.06, 0.04, 0.16, 0.04, 0.16, 0.04], fuel: fuel(1.6, 0.6, 0) },
  do335: { shares: { root: 0.12, tip: 0.6, tail: 0.27, tailX: 0.4, nose: 0.17 }, mass: 9600, massShare: SINGLE, fuel: fuel(1, 0.3) },
};
export const DEFAULT_KIND = KINDS.fw190;
export function kindSpec(kind: string): KindSpec { return KINDS[kind] ?? DEFAULT_KIND; }

/** Cut positions in the model frame (metres). */
export interface Layout { rootX: number; tipX: number; tailZ: number; tailX: number; noseZ: number }
export interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

export function layoutFrom(s: LayoutShares, b: Box): Layout {
  const semi = Math.max(Math.abs(b.minX), Math.abs(b.maxX), 1e-3), len = Math.max(b.maxZ - b.minZ, 1e-3);
  return { rootX: s.root * semi, tipX: s.tip * semi, tailZ: b.minZ + s.tail * len, tailX: s.tailX * semi, noseZ: b.maxZ - s.nose * len };
}

/** The part a point of the model (model frame, unscaled metres) belongs to. */
export function classify(x: number, _y: number, z: number, L: Layout): number {
  const ax = Math.abs(x);
  if (z < L.tailZ && ax < L.tailX) return TAIL;
  if (z > L.noseZ && ax <= L.rootX * 1.6) return NOSE;   // a radial cowling is a little wider than the fuselage
  if (ax > L.rootX) return ax > L.tipX ? (x > 0 ? WING_L_TIP : WING_R_TIP) : (x > 0 ? WING_L : WING_R);
  return CORE;
}

/** Joint where a part meets its parent (model frame): the torn edge that burns and smokes. */
export function jointOf(part: number, L: Layout, com: { x: number; y: number; z: number }, out: { x: number; y: number; z: number }) {
  out.x = com.x; out.y = com.y; out.z = com.z;
  if (part === WING_L || part === WING_R) out.x = L.rootX * sideOf(part);
  else if (part === WING_L_TIP || part === WING_R_TIP) out.x = L.tipX * sideOf(part);
  else if (part === TAIL) out.z = L.tailZ;
  else if (part === NOSE) out.z = L.noseZ;
  return out;
}
