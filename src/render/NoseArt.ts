import * as THREE from 'three';
import { markOwned } from './Dispose';
import type { Rarity } from '../game/WeaponMods';

// Nose art for the player's B-17: procedurally drawn canvas designs (2:1, transparent
// background) applied as a decal on the left side of the nose. The decal is a small plane
// whose vertices are conformed to the hull by raycasting the airframe, drawn with
// polygonOffset so it never z-fights the skin, and alpha-tested (not blended) so it stays in
// the opaque pass and gets the same haze as the rest of the aircraft.

export interface NoseArtDef { id: string; name: string; rarity: Rarity; free?: boolean; exclusive?: string }   // exclusive: how it is earned (never in crates or for merit)

export const NOSE_ARTS: NoseArtDef[] = [
  { id: 'none', name: 'Bare nose', rarity: 'common', free: true },
  { id: 'script', name: 'Name script', rarity: 'common', free: true },
  { id: 'bombs', name: 'Bombs Away', rarity: 'common' },
  { id: 'lightning', name: 'Lightning Strike', rarity: 'common' },
  { id: 'dice', name: 'Lucky Sevens', rarity: 'rare' },
  { id: 'eagle', name: 'War Eagle', rarity: 'rare' },
  { id: 'tally', name: 'Mission Tally', rarity: 'rare' },
  { id: 'shark', name: 'Shark Mouth', rarity: 'epic' },
  { id: 'ace', name: 'Ace of Spades', rarity: 'epic' },
  { id: 'wings', name: 'Gilded Wings', rarity: 'legendary' },
  { id: 'weeklyace', name: 'Lightning Shield', rarity: 'legendary', exclusive: 'Weekly Challenge reward' },   // Weekly.ts
];

const CW = 512, CH = 256;
const CREAM = '#efe6c8', INK = '#17130c', RED = '#b3261b', GOLD = '#e2b33c', NAVY = '#1f2f57';
const SCRIPT = "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', 'Snell Roundhand', cursive";

type G = CanvasRenderingContext2D;

// The ship's name in a slanted script with a dark drop shadow (sits on any paint)
function nameScript(g: G, name: string, x: number, y: number, maxW: number, size: number, fill = CREAM) {
  g.save();
  let s = size;
  g.font = `italic bold ${s}px ${SCRIPT}`;
  while (g.measureText(name).width > maxW && s > 16) { s -= 2; g.font = `italic bold ${s}px ${SCRIPT}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(4, s * 0.16); g.strokeStyle = INK;
  g.strokeText(name, x + 3, y + 3);
  g.strokeText(name, x, y);
  g.fillStyle = fill;
  g.fillText(name, x, y);
  g.restore();
}

function bomb(g: G, x: number, y: number, len: number, ang: number) {
  g.save();
  g.translate(x, y); g.rotate(ang);
  const r = len * 0.22;
  g.lineWidth = 4; g.strokeStyle = INK;
  // tail fins
  g.fillStyle = '#6d6a55';
  g.beginPath(); g.moveTo(-len * 0.5, -r * 1.25); g.lineTo(-len * 0.2, -r * 0.5); g.lineTo(-len * 0.2, r * 0.5); g.lineTo(-len * 0.5, r * 1.25); g.closePath(); g.fill(); g.stroke();
  // body
  g.fillStyle = '#3d4130';
  g.beginPath(); g.ellipse(len * 0.05, 0, len * 0.38, r, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = GOLD; g.fillRect(-len * 0.12, -r, len * 0.06, r * 2);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath(); g.ellipse(len * 0.08, -r * 0.45, len * 0.25, r * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

function star(g: G, x: number, y: number, r: number, fill: string, stroke = INK) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineWidth = 4; g.strokeStyle = stroke; g.stroke();
}

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function die(g: G, x: number, y: number, s: number, ang: number, pips: number) {
  g.save(); g.translate(x, y); g.rotate(ang);
  rrect(g, -s / 2, -s / 2, s, s, s * 0.18);
  g.fillStyle = CREAM; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  const p = s * 0.26, layout: Record<number, [number, number][]> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  g.fillStyle = pips === 1 ? RED : INK;
  for (const [a, b] of layout[pips]) { g.beginPath(); g.arc(a * p, b * p, s * 0.08, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function spade(g: G, x: number, y: number, s: number, fill = INK) {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
  g.beginPath();
  g.moveTo(0, -50);
  g.bezierCurveTo(10, -30, 48, -10, 45, 15);
  g.bezierCurveTo(42, 38, 14, 40, 5, 22);
  g.lineTo(14, 50); g.lineTo(-14, 50); g.lineTo(-5, 22);
  g.bezierCurveTo(-14, 40, -42, 38, -45, 15);
  g.bezierCurveTo(-48, -10, -10, -30, 0, -50);
  g.closePath(); g.fillStyle = fill; g.fill();
  g.restore();
}

function wing(g: G, x: number, y: number, dir: 1 | -1, span: number, fill: string) {
  // layered feathers sweeping out and up from the body
  g.save(); g.translate(x, y); g.scale(dir, 1);
  for (let i = 0; i < 6; i++) {
    const t = i / 5, len = span * (1 - t * 0.55), yy = -18 + i * 14;
    g.beginPath();
    g.moveTo(0, yy);
    g.quadraticCurveTo(len * 0.55, yy - 34 + t * 18, len, yy - 26 + t * 30);
    g.quadraticCurveTo(len * 0.6, yy + 6, 0, yy + 14);
    g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = 3.5; g.strokeStyle = INK; g.stroke();
  }
  g.restore();
}

const DRAW: Record<string, (g: G, name: string) => void> = {
  none: () => { /* bare */ },
  script: (g, name) => {
    nameScript(g, name, CW / 2, CH * 0.44, CW * 0.94, 104);
    g.save(); g.lineCap = 'round';
    g.strokeStyle = INK; g.lineWidth = 12;
    g.beginPath(); g.moveTo(CW * 0.12, CH * 0.76); g.quadraticCurveTo(CW * 0.5, CH * 0.62, CW * 0.9, CH * 0.74); g.stroke();
    g.strokeStyle = RED; g.lineWidth = 6; g.stroke();
    g.restore();
  },
  bombs: (g, name) => {
    g.save(); g.strokeStyle = 'rgba(239,230,200,0.9)'; g.lineWidth = 5; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = 130 + i * 120, y = 50 + i * 28;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 70 - k * 6, y - 40 + k * 14); g.lineTo(x - 38 - k * 6, y - 22 + k * 14); g.stroke(); }
      bomb(g, x, y + 8, 110, 0.55);
    }
    g.restore();
    nameScript(g, name, CW / 2, CH * 0.82, CW * 0.9, 60);
  },
  lightning: (g, name) => {
    g.beginPath(); g.arc(150, 100, 82, 0, Math.PI * 2); g.fillStyle = NAVY; g.fill(); g.lineWidth = 7; g.strokeStyle = CREAM; g.stroke();
    g.beginPath();
    g.moveTo(205, 18); g.lineTo(120, 110); g.lineTo(165, 110); g.lineTo(90, 196); g.lineTo(215, 88); g.lineTo(168, 88); g.lineTo(240, 18); g.closePath();
    g.fillStyle = GOLD; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    nameScript(g, name, 370, 110, 250, 64);
    g.fillStyle = RED; g.fillRect(260, 150, 230, 9); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(260, 150, 230, 9);
  },
  dice: (g, name) => {
    die(g, 150, 95, 112, -0.32, 3);
    die(g, 290, 105, 112, 0.28, 4);
    g.save(); g.strokeStyle = CREAM; g.lineWidth = 5; g.lineCap = 'round';
    for (const [x, y] of [[70, 40], [370, 40], [360, 160]]) { g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x + 14, y); g.moveTo(x, y - 14); g.lineTo(x, y + 14); g.stroke(); }
    g.restore();
    nameScript(g, name, CW / 2, CH * 0.85, CW * 0.9, 58);
  },
  eagle: (g, name) => {
    wing(g, 256, 92, 1, 210, '#8a5a2b');
    wing(g, 256, 92, -1, 210, '#8a5a2b');
    // body + tail
    g.beginPath(); g.ellipse(256, 110, 30, 52, 0, 0, Math.PI * 2); g.fillStyle = '#6b4220'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.moveTo(232, 150); g.lineTo(256, 196); g.lineTo(280, 150); g.closePath(); g.fillStyle = CREAM; g.fill(); g.stroke();
    // white head, gold beak, eye
    g.beginPath(); g.arc(256, 52, 26, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(240, 56); g.lineTo(214, 66); g.lineTo(242, 70); g.closePath(); g.fillStyle = GOLD; g.fill(); g.stroke();
    g.beginPath(); g.arc(250, 46, 4.5, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    nameScript(g, name, CW / 2, CH * 0.87, CW * 0.9, 54);
  },
  tally: (g, name) => {
    nameScript(g, name, CW / 2, 52, CW * 0.92, 72);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      if (row === 2 && i > 4) continue;
      bomb(g, 60 + i * 50, 122 + row * 42, 46, -Math.PI / 2);
    }
  },
  shark: (g, name) => {
    // open mouth: dark red, white teeth along both jaws, an eye above
    g.save();
    g.beginPath();
    g.moveTo(20, 110); g.quadraticCurveTo(220, 40, 470, 78); g.quadraticCurveTo(300, 120, 470, 170); g.quadraticCurveTo(220, 200, 20, 130); g.closePath();
    g.fillStyle = '#5a0d0b'; g.fill();
    g.clip();
    g.fillStyle = CREAM; g.strokeStyle = INK; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const x = 40 + i * 36;
      const top = 110 - Math.sin((i / 12) * Math.PI) * 50 + i * 2.8, bot = 130 + Math.sin((i / 12) * Math.PI) * 52 + i * 1.6;
      g.beginPath(); g.moveTo(x - 15, top - 30); g.lineTo(x + 15, top - 30); g.lineTo(x, top + 22); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x - 15, bot + 30); g.lineTo(x + 15, bot + 30); g.lineTo(x + 2, bot - 22); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
    g.beginPath();
    g.moveTo(20, 110); g.quadraticCurveTo(220, 40, 470, 78); g.quadraticCurveTo(300, 120, 470, 170); g.quadraticCurveTo(220, 200, 20, 130); g.closePath();
    g.lineWidth = 8; g.strokeStyle = RED; g.stroke(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.ellipse(70, 52, 28, 18, -0.1, 0, Math.PI * 2); g.fillStyle = CREAM; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(62, 54, 10, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    nameScript(g, name, 300, 226, 330, 44);
  },
  ace: (g, name) => {
    g.save(); g.translate(140, 118); g.rotate(-0.16);
    rrect(g, -62, -92, 124, 184, 14);
    g.fillStyle = CREAM; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
    spade(g, 0, 4, 90);
    g.font = 'bold 34px Georgia, serif'; g.fillStyle = INK; g.textAlign = 'center';
    g.fillText('A', -40, -56); spade(g, -40, -36, 18);
    g.rotate(Math.PI); g.fillText('A', -40, -56); spade(g, -40, -36, 18);
    g.restore();
    nameScript(g, name, 360, 96, 280, 66);
    g.font = "bold 22px 'IBM Plex Mono', monospace"; g.textAlign = 'center'; g.fillStyle = CREAM;
    g.strokeStyle = INK; g.lineWidth = 5; g.strokeText('HIGH CARD', 360, 160); g.fillText('HIGH CARD', 360, 160);
  },
  wings: (g, name) => {
    wing(g, 256, 84, 1, 220, GOLD);
    wing(g, 256, 84, -1, 220, GOLD);
    g.beginPath(); g.arc(256, 88, 48, 0, Math.PI * 2); g.fillStyle = NAVY; g.fill(); g.lineWidth = 6; g.strokeStyle = GOLD; g.stroke();
    g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    star(g, 256, 90, 36, CREAM);
    nameScript(g, name, CW / 2, CH * 0.84, CW * 0.9, 60, GOLD);
  },
  // Weekly Challenge reward: a navy shield split by a gold lightning bolt, seven campaign stars
  weeklyace: (g, name) => {
    const cx = 120, top = 18, w = 96, h = 168;
    const shield = () => {
      g.beginPath();
      g.moveTo(cx - w, top); g.lineTo(cx + w, top); g.lineTo(cx + w, top + h * 0.5);
      g.quadraticCurveTo(cx + w * 0.9, top + h * 0.9, cx, top + h);
      g.quadraticCurveTo(cx - w * 0.9, top + h * 0.9, cx - w, top + h * 0.5); g.closePath();
    };
    shield(); g.fillStyle = NAVY; g.fill(); g.lineWidth = 9; g.strokeStyle = GOLD; g.stroke(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.save(); shield(); g.clip();
    g.fillStyle = RED; g.fillRect(cx - w, top, w * 2, 26);
    g.restore();
    g.beginPath();
    g.moveTo(cx + 30, top + 30); g.lineTo(cx - 34, top + 104); g.lineTo(cx + 2, top + 104); g.lineTo(cx - 30, top + h - 14);
    g.lineTo(cx + 44, top + 80); g.lineTo(cx + 8, top + 80); g.lineTo(cx + 52, top + 30); g.closePath();
    g.fillStyle = GOLD; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    for (let i = 0; i < 7; i++) star(g, 262 + i * 34, 44, 13, i % 2 ? CREAM : GOLD);
    nameScript(g, name, 372, 122, 260, 64);
    g.font = "bold 22px 'IBM Plex Mono', monospace"; g.textAlign = 'center'; g.fillStyle = CREAM;
    g.strokeStyle = INK; g.lineWidth = 5; g.strokeText('WEEKLY ACE', 372, 196); g.fillText('WEEKLY ACE', 372, 196);
  },
};

export function drawNoseArt(id: string, name: string, canvas = document.createElement('canvas')): HTMLCanvasElement {
  canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, CW, CH);
  (DRAW[id] ?? DRAW.script)(g, name || 'Sky Queen');
  return canvas;
}

// Thumbnails for the hangar (data URLs, cached per design + name)
const thumbs = new Map<string, string>();
export function noseArtThumb(id: string, name: string): string {
  const k = id + '|' + name;
  let u = thumbs.get(k);
  if (!u) {
    u = drawNoseArt(id, name).toDataURL('image/png');
    if (thumbs.size > 40) thumbs.clear();
    thumbs.set(k, u);
  }
  return u;
}

// ---------- decal on the aircraft ----------
const DECAL_W = 2.1, DECAL_H = 1.05;   // metres
const textures = new Map<string, THREE.CanvasTexture>();
function texture(id: string, name: string) {
  const k = id + '|' + name;
  let t = textures.get(k);
  if (t) { textures.delete(k); textures.set(k, t); }   // most recently used last
  else {
    t = new THREE.CanvasTexture(drawNoseArt(id, name));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    // Player plus up to 18 formation names, in either language. Keep live squadron textures resident.
    if (textures.size >= 64) { const [ok, old] = textures.entries().next().value!; textures.delete(ok); old.dispose(); }
    textures.set(k, t);
  }
  return t;
}

// The plane conformed to the B-17's left nose side: shared by every dressed bomber (same
// airframe geometry), so it is computed once and never marked owned.
let conformed: THREE.BufferGeometry | null = null;
const _ray = new THREE.Raycaster();
function decalGeometry(model: THREE.Object3D): THREE.BufferGeometry {
  if (conformed) return conformed;
  const airframe = model.getObjectByName('airframe');
  const geo = new THREE.PlaneGeometry(DECAL_W, DECAL_H, 10, 6);
  geo.rotateY(Math.PI / 2);                       // faces +X (the left side), +u runs aft
  // placement from the airframe's bounds: under the cockpit, ahead of the wing root
  let cz = 3.75, cy = 0.05, flatX = 1.25;
  if (airframe) {
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const box = new THREE.Box3().setFromObject(airframe).applyMatrix4(inv);
    cz = box.max.z - 2.7; cy = -0.02;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const o = new THREE.Vector3(), d = new THREE.Vector3(-1, 0, 0).transformDirection(model.matrixWorld);
    const misses: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      // start between the fuselage and the inner nacelle, shoot inward
      o.set(2.1, cy + pos.getY(i), cz + pos.getZ(i)).applyMatrix4(model.matrixWorld);
      _ray.set(o, d); _ray.far = 2.1;
      const hit = _ray.intersectObject(airframe, true)[0];
      if (hit) { const p = hit.point.applyMatrix4(inv); pos.setXYZ(i, p.x + 0.012, p.y, p.z); flatX = Math.max(flatX, p.x); }
      else misses.push(i);
    }
    for (const i of misses) pos.setXYZ(i, flatX + 0.012, cy + pos.getY(i), cz + pos.getZ(i));
  } else {
    geo.translate(flatX, cy, cz);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return (conformed = geo);
}

// Put (or replace) the nose-art decal on a B-17 model. id 'none' removes it.
export function applyNoseArt(model: THREE.Object3D, id: string, name: string, metalness = 0.1) {
  const old = model.getObjectByName('noseArt') as THREE.Mesh | undefined;
  if (old) { old.removeFromParent(); (old.material as THREE.Material).dispose(); }
  if (id === 'none') return;
  const mat = markOwned(new THREE.MeshStandardMaterial({
    map: texture(id, name), alphaTest: 0.5, roughness: 0.62, metalness,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  }));
  const decal = new THREE.Mesh(decalGeometry(model), mat);
  decal.name = 'noseArt';
  decal.castShadow = false; decal.receiveShadow = true;
  decal.renderOrder = 1;
  model.add(decal);
}
