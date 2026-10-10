import * as THREE from 'three';
import type { Game } from './Game';

const _v = new THREE.Vector3();

// Cinematic camera over the formation behind the menus (Game.frame() calls update() while
// menuMode is on). Four shots, 10 s each: close on the lead B-17, the waist-gunner view
// from the reference footage, a wide pass over the box, and a low look along the fuselage.
export class MenuScene {
  private shot = 0;
  private shotT = 0;
  private gunnerView = false;   // shot 1 has the gunner attached to the waist gun

  constructor(private g: Game) {}

  // Back to the title (Game.startMenu)
  reset() {
    this.shot = 0;
    this.shotT = 0;
    this.gunnerView = false;
  }

  // A mission takes the gunner over (MissionFlow.startMission detaches it)
  onMissionStart() { this.gunnerView = false; }

  update(dt: number) {
    const g = this.g;
    this.shotT += dt;
    const shots = 4;
    if (this.shotT > 10) { this.shotT = 0; this.shot = (this.shot + 1) % shots; }
    const pb = g.world.playerBomber;
    if (!pb) return;
    const cam = g.engine.camera;
    if (cam.parent !== g.engine.scene) g.engine.scene.add(cam);
    const t = this.shotT;
    const center = pb.pos;
    // Shot 1 = the waist-gunner view from the reference footage
    if (this.shot === 1) {
      if (!this.gunnerView) { g.gunner.attach(pb, 'waistL'); this.gunnerView = true; }
      // slow scripted sweep along the formation
      const s = g.gunner.state;
      s.tYaw = Math.sin(t * 0.25) * 0.35 + 0.15;
      s.tPitch = Math.sin(t * 0.33) * 0.06 + 0.02;
      g.input.enabled = false;
      g.gunner.update(dt);
      g.input.enabled = true;
      return;
    }
    if (this.gunnerView) { g.gunner.detach(); this.gunnerView = false; }
    let pos: THREE.Vector3, look: THREE.Vector3;
    if (this.shot === 0) {
      pos = _v.copy(center).add(new THREE.Vector3(34 - t * 0.6, 6 + Math.sin(t * 0.2) * 2, 26 - t * 2.2));
      look = center.clone().add(new THREE.Vector3(0, 0, 4));
    } else if (this.shot === 2) {
      pos = _v.copy(g.world.formationCenter).add(new THREE.Vector3(-260 + t * 10, 120, 240 - t * 6));
      look = g.world.formationCenter.clone().add(new THREE.Vector3(0, -30, -80));
    } else {
      pos = _v.copy(center).add(new THREE.Vector3(-8 + t * 0.4, 3.5, -36 + t * 0.8));
      look = center.clone().add(new THREE.Vector3(0, 1, 10));
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.fov = this.shot === 2 ? 40 : 52;
    cam.updateProjectionMatrix();
    g.engine.post.nearFocus = 0.1;
    g.engine.post.dofStrength = 0;
    g.engine.post.noBlurDist = 1e6;
  }
}
