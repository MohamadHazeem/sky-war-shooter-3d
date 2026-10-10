import * as THREE from 'three';

// B-17G crew/gun station geometry in the model frame (+Z nose, +Y up, +X left wing).
export type StationId = 'waistL' | 'waistR' | 'top' | 'ball' | 'tail';

export interface StationDef {
  id: StationId;
  label: string;
  key: string;
  type: 'waist' | 'turret' | 'tail';
  pivot: THREE.Vector3;      // gun mount pivot
  rest: { yaw: number; pitch: number }; // radians, yaw about +Y from +Z
  yaw: [number, number];     // limits relative to rest (rad)
  pitch: [number, number];
  twin: boolean;
  eyeBack: number;           // eye distance behind the pivot along the gun axis
  eyeUp: number;
  crew: string;
}

const D = THREE.MathUtils.degToRad;

export const STATIONS: Record<StationId, StationDef> = {
  waistL: {
    id: 'waistL', label: 'Left Waist', key: '1', type: 'waist',
    pivot: new THREE.Vector3(0.84, 0.27, -7.44), rest: { yaw: D(90), pitch: 0 },
    yaw: [D(-52), D(52)], pitch: [D(-38), D(48)], twin: false, eyeBack: 0.62, eyeUp: 0.2, crew: 'Sgt. Price',
  },
  waistR: {
    id: 'waistR', label: 'Right Waist', key: '2', type: 'waist',
    pivot: new THREE.Vector3(-0.84, 0.27, -7.44), rest: { yaw: D(-90), pitch: 0 },
    yaw: [D(-52), D(52)], pitch: [D(-38), D(48)], twin: false, eyeBack: 0.62, eyeUp: 0.2, crew: 'Sgt. Walsh',
  },
  top: {
    id: 'top', label: 'Top Turret', key: '3', type: 'turret',
    pivot: new THREE.Vector3(0, 1.5, 1.15), rest: { yaw: 0, pitch: D(8) },
    yaw: [-Math.PI, Math.PI], pitch: [D(-4), D(85)], twin: false, eyeBack: 0.25, eyeUp: 0.08, crew: 'Sgt. Mendez',
  },
  ball: {
    id: 'ball', label: 'Ball Turret', key: '4', type: 'turret',
    pivot: new THREE.Vector3(0, -1.45, -4.65), rest: { yaw: Math.PI, pitch: D(-20) },
    yaw: [-Math.PI, Math.PI], pitch: [D(-90), D(2)], twin: false, eyeBack: 0.22, eyeUp: 0.0, crew: 'Sgt. Reilly',
  },
  tail: {
    id: 'tail', label: 'Tail Gun', key: '5', type: 'tail',
    pivot: new THREE.Vector3(0, 0.3, -15.6), rest: { yaw: Math.PI, pitch: 0 },
    yaw: [D(-32), D(32)], pitch: [D(-28), D(28)], twin: false, eyeBack: 0.55, eyeUp: 0.16, crew: 'Sgt. Dawson',
  },
};

export const STATION_ORDER: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];

// direction from yaw/pitch in model frame
export function dirFromYawPitch(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Is a model-frame direction within a station's field of fire?
export function inArc(st: StationDef, localDir: THREE.Vector3): boolean {
  const yaw = Math.atan2(localDir.x, localDir.z);
  const pitch = Math.asin(THREE.MathUtils.clamp(localDir.y / localDir.length(), -1, 1));
  const dy = wrapAngle(yaw - st.rest.yaw);
  return dy >= st.yaw[0] && dy <= st.yaw[1] && pitch >= st.pitch[0] && pitch <= st.pitch[1];
}

// Additional AI-only stations on every bomber (chin turret, cheek guns)
export const AI_EXTRA = [
  { pivot: new THREE.Vector3(0, -1.3, 5.6), rest: { yaw: 0, pitch: D(-5) }, yaw: [D(-80), D(80)] as [number, number], pitch: [D(-40), D(25)] as [number, number] },
];
