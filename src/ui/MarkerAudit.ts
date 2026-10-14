import * as THREE from 'three';
import { projectMarker, shownObject, markerAtmosphereAlpha, liveMarkerTarget } from './MarkerProjection';
import type { Aircraft } from '../world/Aircraft';

export type MarkerMode = 'world' | 'edge' | 'radar' | 'damage' | 'forecast';
export interface MarkerSample {
  kind: string; targetId: number | string | null; mode: MarkerMode;
  exists: boolean; alive: boolean; visible: boolean; front: boolean; on: boolean;
  x: number; y: number; projectedX: number; projectedY: number;
}
/** Pure audit, shared by Vitest and the browser. Radar, edge arrows, damage history and
 * explicitly labelled forecasts are NOT claims of an aircraft at a screen coordinate. */
export function auditMarkers(markers: readonly MarkerSample[], tolerancePx = 2) {
  const errors: { index: number; targetId: number | string | null; kind: string; reason: string }[] = [];
  markers.forEach((m, index) => {
    let reason = '';
    const needsTarget = m.mode !== 'forecast' && !(m.mode === 'damage' && m.targetId === null);
    if (needsTarget && !m.exists) reason = 'missing target';
    else if (needsTarget && !m.alive) reason = 'dead target';
    else if (m.mode === 'world') {
      if (!m.front || !m.on) reason = 'outside camera frustum';
      else if (!m.visible) reason = 'invisible target';
      else if (!Number.isFinite(m.x + m.y) || Math.hypot(m.x - m.projectedX, m.y - m.projectedY) > tolerancePx) reason = 'projection mismatch';
    }
    if (reason) errors.push({ index, targetId: m.targetId, kind: m.kind, reason });
  });
  return { checked: markers.length, falseMarkers: errors.length, errors, markers };
}
interface Record {
  kind: string; target: Aircraft | null; root: THREE.Object3D | null; mode: MarkerMode;
  anchor: THREE.Vector3; x: number; y: number; range: number; id: string | number | null;
  state?: { alive?: boolean; hp?: number; resolved?: boolean };
}
const pool: Record[] = [];
let count = 0;
export const markerCapture = { enabled: false };
export function beginMarkerFrame() { count = 0; }
/** Called at actual draw sites, not from a second reconstruction of what ought to draw.
 * Pool only grows during development; production calls are no-ops. */
export function recordMarker(kind: string, target: Aircraft | null, mode: MarkerMode, x: number, y: number,
  pos?: THREE.Vector3, root: THREE.Object3D | null = target?.root ?? null, range = 2800, id: string | number | null = target?.id ?? null, state?: Record['state']) {
  if (!markerCapture.enabled) return;
  let r = pool[count++];
  if (!r) { r = { kind, target, root, mode, anchor: new THREE.Vector3(), x, y, range, id }; pool.push(r); }
  r.state = state; r.kind = kind; r.target = target; r.root = root; r.mode = mode; r.x = x; r.y = y; r.range = range; r.id = id;
  // Store the local anchor so the audit independently reprojects the rendered transform.
  if (pos) r.anchor.copy(pos); else if (root) root.getWorldPosition(r.anchor); else r.anchor.set(0, 0, 0);
  if (root) root.worldToLocal(r.anchor);
}
const point = new THREE.Vector3();
export function captureMarkerAudit(cam: THREE.Camera, W: number, H: number, aircraft: readonly Aircraft[], spotted: (a: Aircraft) => boolean) {
  const markers: MarkerSample[] = [];
  for (let i = 0; i < count; i++) {
    const r = pool[i], a = r.target;
    point.copy(r.anchor); if (r.root) r.root.localToWorld(point);
    const p = projectMarker(point, cam);
    markers.push({ kind: r.kind, targetId: r.id, mode: r.mode,
      exists: a ? aircraft.includes(a) && !a.remove : !!r.root?.parent,
      alive: (a ? liveMarkerTarget(a) : !!r.root?.parent) && r.state?.alive !== false && r.state?.resolved !== true && (r.state?.hp ?? 1) > 0,
      visible: !!r.root && shownObject(a?.model ?? r.root) && (!a || spotted(a)) && markerAtmosphereAlpha(point, cam, r.range) > 0,
      front: p.front, on: p.on, x: r.x, y: r.y, projectedX: (p.x * .5 + .5) * W, projectedY: (-p.y * .5 + .5) * H,
    });
  }
  return auditMarkers(markers);
}
