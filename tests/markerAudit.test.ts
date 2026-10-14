import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { auditMarkers, type MarkerSample } from '../src/ui/MarkerAudit';
import { projectMarker, cloudPathLength, liveMarkerTarget, shownObject, markerAtmosphereAlpha } from '../src/ui/MarkerProjection';
import { Atmos } from '../src/render/Atmosphere';
import { weatherNow } from '../src/render/WeatherState';

const base: MarkerSample = { kind: 'box', targetId: 1, mode: 'world', exists: true, alive: true, visible: true, front: true, on: true, x: 100, y: 80, projectedX: 100, projectedY: 80 };
describe('marker projection', () => {
  for (const reversed of [false, true]) it(`rejects behind/near/far and off-screen points (reversed=${reversed})`, () => {
    const cam = new THREE.PerspectiveCamera(60, 1, .1, 1000);
    Object.defineProperty(cam, 'reversedDepth', {value: reversed}); cam.updateProjectionMatrix();
    expect(projectMarker(new THREE.Vector3(0, 0, -100), cam).on).toBe(true);
    expect(projectMarker(new THREE.Vector3(0, 0, 100), cam).front).toBe(false);
    expect(projectMarker(new THREE.Vector3(0, 0, -.01), cam).front).toBe(false);
    expect(projectMarker(new THREE.Vector3(0, 0, -1001), cam).front).toBe(false);
    expect(projectMarker(new THREE.Vector3(1000, 0, -100), cam).on).toBe(false);
    expect(projectMarker(new THREE.Vector3(0, 0, 0), cam).on).toBe(false);
  });
  it('refreshes camera after shake, zoom and floating-origin shifts', () => {
    const cam = new THREE.PerspectiveCamera(62, 1.6, .03, 260000);
    cam.position.set(6000, 7600, 5000); cam.rotation.y = .4;
    cam.fov = 32; cam.updateProjectionMatrix();
    const pos = new THREE.Vector3(0, 0, -500).applyQuaternion(cam.quaternion).add(cam.position);
    expect(projectMarker(pos, cam).x).toBeCloseTo(0, 8);
    const offset = new THREE.Vector3(6000, 0, 5000); cam.position.sub(offset); pos.sub(offset);
    expect(projectMarker(pos, cam).x).toBeCloseTo(0, 8);
  });
  it('excludes dead, dying and despawned targets and hidden or zero scale models', () => {
    for (const state of [{alive:false,remove:false,falling:true},{alive:true,remove:true,falling:false},{alive:true,remove:false,falling:true}]) expect(liveMarkerTarget(state)).toBe(false);
    const root = new THREE.Group(), model = new THREE.Group(); root.add(model); new THREE.Scene().add(root);
    expect(shownObject(model)).toBe(true); root.visible = false; expect(shownObject(model)).toBe(false);
    root.visible = true; model.scale.setScalar(0); expect(shownObject(model)).toBe(false);
    model.scale.setScalar(1); model.removeFromParent(); expect(shownObject(model)).toBe(false);
  });
  it('measures cloud intersections including horizontal rays and both directions', () => {
    expect(cloudPathLength(7600, 5000, 2600, 3900, 5900)).toBeCloseTo(900);
    expect(cloudPathLength(5000, 7600, 2600, 3900, 5900)).toBeCloseTo(900);
    expect(cloudPathLength(5000, 5000, 120, 3900, 5900)).toBe(120);
    expect(cloudPathLength(7600, 7600, 2000, 3900, 5900)).toBe(0);
  });
  it('hides cloud-obscured and fog-extinguished targets', () => {
    const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 7600, 0);
    const oldFog = weatherNow.fog, oldSpotting = weatherNow.spotting;
    weatherNow.fog = 0; weatherNow.spotting = 1;
    expect(markerAtmosphereAlpha(new THREE.Vector3(0, 7600, -500), cam)).toBeGreaterThan(0);
    expect(markerAtmosphereAlpha(new THREE.Vector3(0, (Atmos.lowBase + Atmos.lowTop) / 2, 0), cam, 10000)).toBe(0);
    weatherNow.fog = .01;
    expect(markerAtmosphereAlpha(new THREE.Vector3(0, 7600, -500), cam)).toBe(0);
    weatherNow.fog = oldFog; weatherNow.spotting = oldSpotting;
  });
});
describe('marker audit', () => {
  it('detects each false-marker class and accepts intentional non-projected cues', () => {
    const records: MarkerSample[] = [base, {...base,exists:false}, {...base,alive:false}, {...base,front:false}, {...base,visible:false}, {...base,x:104}, {...base,x:NaN}];
    expect(auditMarkers(records).falseMarkers).toBe(6);
    expect(auditMarkers([{...base,mode:'radar',front:false,visible:false,x:0},{...base,mode:'edge',front:false,x:0},{...base,mode:'forecast',exists:false,alive:false},{...base,mode:'damage',targetId:null,exists:false,alive:false}]).falseMarkers).toBe(0);
    expect(auditMarkers([{...base,mode:'radar',exists:false}]).falseMarkers).toBe(1);
    expect(auditMarkers([{...base,mode:'damage',alive:false}]).falseMarkers).toBe(1);
  });
});

describe('draw-site instrumentation', () => {
  it('reprojects the mesh independently and rejects stale, hidden and misaligned records', async () => {
    const { markerCapture, beginMarkerFrame, recordMarker, captureMarkerAudit } = await import('../src/ui/MarkerAudit');
    const { aircraftMarkerAlpha } = await import('../src/ui/MarkerProjection');
    const scene = new THREE.Scene(), root = new THREE.Group(), model = new THREE.Group();
    scene.add(root);root.add(model);root.position.set(0,7600,-500);
    const cam = new THREE.PerspectiveCamera(60,1,.1,1000);cam.position.y=7600;
    const a = {id:123,root,model,alive:true,falling:false,remove:false} as unknown as import('../src/world/Aircraft').Aircraft;
    const world = {aircraft:[a],spotted:()=>true} as unknown as import('../src/world/World').World;
    markerCapture.enabled=true; beginMarkerFrame(); recordMarker('target-box',a,'world',500,500);
    expect(captureMarkerAudit(cam,1000,1000,[a],()=>true).falseMarkers).toBe(0);
    root.position.x=40;
    expect(captureMarkerAudit(cam,1000,1000,[a],()=>true).errors[0].reason).toBe('projection mismatch');
    expect(captureMarkerAudit(cam,1000,1000,[],()=>true).errors[0].reason).toBe('missing target');
    a.remove=true;expect(aircraftMarkerAlpha(a,world,cam)).toBe(0);a.remove=false;
    model.visible=false;expect(aircraftMarkerAlpha(a,world,cam)).toBe(0);model.visible=true;
    root.removeFromParent();expect(aircraftMarkerAlpha(a,world,cam)).toBe(0);
    beginMarkerFrame();expect(captureMarkerAudit(cam,1000,1000,[a],()=>true).checked).toBe(0);
    markerCapture.enabled=false;
  });
  it('requires the current attack to target this player, and ends warnings after breakoff', async () => {
    const {attackingPlayer}=await import('../src/ui/MarkerProjection');
    const player={}, neighbour={};
    expect(attackingPlayer('attack',neighbour,player)).toBe(false);
    expect(attackingPlayer('duel',neighbour,player)).toBe(false);
    expect(attackingPlayer('attack',player,player)).toBe(true);
    expect(attackingPlayer('dogfight',player,player)).toBe(true);
    expect(attackingPlayer('extend',player,player)).toBe(false);
    expect(attackingPlayer('attack',null,null)).toBe(false);
  });
});
