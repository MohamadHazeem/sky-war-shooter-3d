import * as THREE from 'three';
import type { Aircraft } from '../world/Aircraft';
import type { World } from '../world/World';
import { Atmos } from '../render/Atmosphere';
import { weatherNow } from '../render/WeatherState';
import { spottingAlpha } from '../render/WeatherPresets';

export interface MarkerProjection { x: number; y: number; depth: number; front: boolean; on: boolean }
export const markerProjection: MarkerProjection = { x: 0, y: 0, depth: 0, front: false, on: false };
const view = new THREE.Vector3();
const center = new THREE.Vector3();

/** Camera-space depth works with both conventional and reversed-Z projection matrices.
 * NDC z < 1 alone accepts BEHIND-camera points with reversed depth. */
export function projectMarker(pos: THREE.Vector3, cam: THREE.Camera, out = markerProjection): MarkerProjection {
  cam.updateWorldMatrix(true, false);
  view.copy(pos).applyMatrix4(cam.matrixWorldInverse);
  out.depth = -view.z;
  const perspective = cam as THREE.PerspectiveCamera;
  out.front = out.depth >= (perspective.near ?? .01) && out.depth <= (perspective.far ?? Infinity);
  if (Math.abs(view.z) < 1e-8) {
    // A point exactly on the eye plane still needs a finite directional cue.
    out.x = view.x; out.y = view.y; out.on = false;
    return out;
  }
  view.applyMatrix4(cam.projectionMatrix);
  out.x = view.x; out.y = view.y;
  out.on = out.front && Number.isFinite(out.x) && Number.isFinite(out.y) && Math.abs(out.x) < 1 && Math.abs(out.y) < 1;
  return out;
}

export function liveMarkerTarget(a: Pick<Aircraft, 'alive' | 'remove' | 'falling'>): boolean {
  return a.alive && !a.remove && !a.falling;
}
export function shownObject(root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = root; node; node = node.parent) {
    if (!node.visible || node.scale.x === 0 || node.scale.y === 0 || node.scale.z === 0) return false;
    if ((node as THREE.Scene).isScene) return true;
  }
  return false;
}
/** Conservative cloud rule: do not draw through a populated cloud slab. The CPU cannot
 * sample the GPU's eroded noise, so even clear holes lose labels after 80 m in the slab. */
export function cloudPathLength(y0: number, y1: number, distance: number, base: number, top: number): number {
  if (Math.abs(y1 - y0) < 1e-6) return y0 >= base && y0 <= top ? distance : 0;
  const a = (base - y0) / (y1 - y0), b = (top - y0) / (y1 - y0);
  return Math.max(0, Math.min(1, Math.max(a, b)) - Math.max(0, Math.min(a, b))) * distance;
}
export function markerAtmosphereAlpha(pos: THREE.Vector3, cam: THREE.Camera, range = 2800): number {
  const d = pos.distanceTo(cam.position);
  const rangeAlpha = spottingAlpha(d, range, weatherNow.spotting);
  if (rangeAlpha <= 0) return 0;
  const transmission = Math.exp(-Math.min(d, 4500) * weatherNow.fog - d / (26000 * Math.max(.01, Atmos.haze)));
  if (transmission < .35) return 0;
  let cloud = 0;
  if (Atmos.lowCoverage > .15 && Atmos.lowDensity > 0) cloud += cloudPathLength(cam.position.y, pos.y, d, Atmos.lowBase, Atmos.lowTop);
  if (Atmos.highCoverage > .15 && Atmos.highDensity > 0) cloud += cloudPathLength(cam.position.y, pos.y, d, Atmos.highBase, Atmos.highTop);
  return rangeAlpha * transmission * Math.max(0, 1 - cloud / 80);
}
export function aircraftMarkerAlpha(a: Aircraft, world: World, cam: THREE.Camera, range = 2800): number {
  if (!liveMarkerTarget(a) || !world.aircraft.includes(a) || !shownObject(a.model) || !world.spotted(a)) return 0;
  a.root.getWorldPosition(center);
  return markerAtmosphereAlpha(center, cam, range);
}
export function projectAircraft(a: Aircraft, cam: THREE.Camera): MarkerProjection {
  a.root.getWorldPosition(center);
  return projectMarker(center, cam);
}

/** An attack on a neighbouring bomber is not an attack on the player's position. */
export function attackingPlayer(state: string, target: unknown, player: unknown): boolean {
  return !!player && target === player && (state === 'attack' || state === 'duel' || state === 'dogfight');
}
