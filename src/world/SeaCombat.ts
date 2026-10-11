/** Renderer-independent naval damage and dive rules. All distances are metres. */
export type SeaKind = 'eboat' | 'trawler' | 'flakship' | 'merchant' | 'destroyer' | 'cruiser' | 'battleship' | 'uboat' | 'battery' | 'flak88' | 'tower' | 'radar' | 'searchlight';
export type SeaWeapon = 'gun' | 'rocket' | 'bomb';
export type SeaPartKind = 'hull' | 'turret' | 'flak' | 'magazine';
export interface SeaSpec { label: string; length: number; beam: number; hp: number; speed: number; turrets: number; flak: number; score: number; shore?: boolean }
export const SEA_KINDS: Record<SeaKind, SeaSpec> = {
  eboat: { label: 'E-boat', length: 38, beam: 7, hp: 170, speed: 19, turrets: 0, flak: 1, score: 150 },
  trawler: { label: 'Armed trawler', length: 58, beam: 12, hp: 300, speed: 6, turrets: 1, flak: 1, score: 250 },
  flakship: { label: 'Flak ship', length: 90, beam: 19, hp: 520, speed: 5, turrets: 0, flak: 6, score: 450 },
  merchant: { label: 'Merchant ship', length: 130, beam: 22, hp: 500, speed: 5, turrets: 0, flak: 0, score: 400 },
  destroyer: { label: 'Destroyer', length: 150, beam: 17, hp: 850, speed: 12, turrets: 3, flak: 3, score: 700 },
  cruiser: { label: 'Heavy cruiser', length: 220, beam: 26, hp: 1400, speed: 8, turrets: 3, flak: 5, score: 1000 },
  battleship: { label: 'Tirpitz-class battleship', length: 350, beam: 48, hp: 2400, speed: 5, turrets: 4, flak: 8, score: 2400 },
  uboat: { label: 'U-boat', length: 78, beam: 8, hp: 360, speed: 7, turrets: 1, flak: 1, score: 600 },
  battery: { label: 'Coastal battery', length: 40, beam: 34, hp: 650, speed: 0, turrets: 1, flak: 0, score: 450, shore: true },
  flak88: { label: '88 mm flak battery', length: 18, beam: 18, hp: 220, speed: 0, turrets: 0, flak: 1, score: 250, shore: true },
  tower: { label: 'Flak tower', length: 36, beam: 36, hp: 650, speed: 0, turrets: 0, flak: 4, score: 500, shore: true },
  radar: { label: 'Radar station', length: 23, beam: 23, hp: 170, speed: 0, turrets: 0, flak: 0, score: 300, shore: true },
  searchlight: { label: 'Searchlight', length: 12, beam: 12, hp: 100, speed: 0, turrets: 0, flak: 0, score: 100, shore: true },
};
export interface SeaPart { kind: SeaPartKind; hp: number; maxHp: number; x: number; y: number; z: number; radius: number }
export type SinkState = 'afloat' | 'listing' | 'breaking' | 'settling' | 'sunk';
export type DiveState = 'surfaced' | 'diving' | 'submerged' | 'escaped';
export class SeaCombat {
  readonly spec: SeaSpec;
  readonly parts: SeaPart[] = [];
  hp: number;
  sink: SinkState = 'afloat';
  sinkTime = 0;
  dive: DiveState = 'surfaced';
  diveTime = 0;
  depth = 0;
  constructor(readonly kind: SeaKind) {
    const s = this.spec = SEA_KINDS[kind]; this.hp = s.hp;
    const h = kind === 'uboat' ? 2 : s.shore ? (kind === 'tower' ? 32 : 8) : s.beam * 0.32;
    const add = (kind: SeaPartKind, hp: number, x: number, y: number, z: number, radius: number) => this.parts.push({ kind, hp, maxHp: hp, x, y, z, radius });
    // Several hull spheres cover a long, narrow ship without a huge empty hitbox.
    const n = Math.ceil(s.length / s.beam);
    for (let i = 0; i < n; i++) add('hull', s.hp, 0, h * 0.25, (i + 0.5) * s.length / n - s.length / 2, s.beam * 0.64);
    for (let i = 0; i < s.turrets; i++) add('turret', kind === 'battleship' ? 180 : 100, 0, kind === 'battery' ? 5 : h + 4, s.length * (s.turrets === 1 ? (kind === 'battery' ? .4 : .22) : -0.34 + i * 0.68 / (s.turrets - 1)), s.beam * 0.22 + 3);
    for (let i = 0; i < s.flak; i++) add('flak', 80, (i % 2 ? 1 : -1) * s.beam * 0.34, h + 3, (Math.floor(i / 2) - Math.floor((s.flak - 1) / 2) / 2) * s.length * 0.17, 4.5);
    if (kind === 'battleship' || kind === 'cruiser' || kind === 'destroyer') add('magazine', s.hp, 0, 1, s.length * 0.19, s.beam * 0.65);
  }
  get alive() { return this.sink === 'afloat' && this.dive !== 'escaped'; }
  get resolved() { return this.sink === 'sunk' || this.dive === 'escaped'; }
  get armourOpen() {
    if (this.kind !== 'battleship') return true;
    for (const p of this.parts) if ((p.kind === 'turret' || p.kind === 'flak') && p.hp > 0) return false;
    return true;
  }
  attack() { if (this.kind === 'uboat' && this.alive && this.dive === 'surfaced') { this.dive = 'diving'; this.diveTime = 0; } }
  /** Returns actual damage; submerged boats only accept nearby depth-charge-like bomb blasts. */
  damage(index: number, amount: number, weapon: SeaWeapon): number {
    if (!this.alive || !Number.isFinite(amount) || amount <= 0) return 0;
    const p = this.parts[index]; if (!p || p.hp <= 0) return 0;
    if (this.dive === 'submerged' && (weapon !== 'bomb' || this.depth > 16)) return 0;
    this.attack();
    if (p.kind === 'turret' || p.kind === 'flak') {
      const dmg = Math.min(p.hp, amount); p.hp -= dmg; return dmg;
    }
    if (!this.armourOpen) return 0;
    const armoured = this.spec.length >= 140;
    const multiplier = p.kind === 'magazine' && weapon !== 'gun' ? 1.8 : armoured && weapon === 'gun' ? 0.22 : 1;
    const dmg = Math.min(this.hp, amount * multiplier); this.hp -= dmg;
    if (this.hp <= 0) { this.sink = 'listing'; this.sinkTime = 0; }
    return dmg;
  }
  update(dt: number) {
    if (dt <= 0 || !Number.isFinite(dt)) return;
    if (this.sink !== 'afloat') {
      this.sinkTime += dt;
      const big = this.spec.length >= 140;
      this.sink = this.sinkTime >= (big ? 32 : 14) ? 'sunk' : this.sinkTime >= (big ? 18 : 5) ? 'settling' : big && this.sinkTime >= 8 ? 'breaking' : 'listing';
      return;
    }
    if (this.dive === 'diving' || this.dive === 'submerged') {
      this.diveTime += dt; this.depth = Math.min(35, this.diveTime * 1.15);
      if (this.diveTime >= 9) this.dive = 'submerged';
      if (this.diveTime >= 30) this.dive = 'escaped';
    }
  }
}

/** Bounded fleet sizes, endless cycles; every fifth wave is a battleship group. */
export function seaWave(wave: number): SeaKind[] {
  const n = Math.max(1, Math.floor(wave));
  const fleets: SeaKind[][] = [
    ['eboat', 'eboat', 'trawler'],
    ['merchant', 'merchant', 'merchant', 'trawler', 'flakship'],
    ['destroyer', 'destroyer', 'uboat', 'eboat'],
    ['battery', 'battery', 'flak88', 'tower', 'radar', 'searchlight', 'cruiser'],
    ['battleship', 'destroyer', 'flakship', 'uboat'],
  ];
  const result = [...fleets[(n - 1) % 5]];
  for (let i = 0; i < Math.min(3, Math.floor((n - 1) / 5)); i++) result.push(i === 2 ? 'destroyer' : 'eboat');
  return result;
}

/** A shallow, fast bomb can skip twice; steep releases detonate on contact. */
export function canSkipBomb(vy: number, horizontalSpeed: number, skips: number): boolean {
  return skips < 2 && horizontalSpeed > 65 && vy < 0 && -vy / horizontalSpeed < 0.42;
}
