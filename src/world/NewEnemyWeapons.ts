import * as THREE from 'three';
import { makeGun, type Fighter } from './Aircraft';
import { SCHRAGE_Y, SCHRAGE_Z } from './NewEnemyRules';

/** Called once at spawn, before model-scale is applied to the muzzles. */
export function fitNewEnemyWeapons(f: Fighter) {
  if (f.enemyType === 'me163') {
    f.guns = [-1, 1].map(s => makeGun({ offset: new THREE.Vector3(s * .85, -.15, .8), rate: 7, muzzleVel: 540, damage: 25, cannon: true, ammo: 60, spread: .008 }));
  } else if (f.enemyType === 'me410') {
    f.guns = [-1, 1].map(s => makeGun({ offset: new THREE.Vector3(s * .25, -.32, 4.3), rate: 10, muzzleVel: 700, damage: 14, cannon: true, ammo: 350 }));
    for (const side of [-1, 1]) f.guns.push(makeGun({ offset: new THREE.Vector3(side * .18, .05, 3.8), rate: 15, muzzleVel: 750, damage: 5, ammo: 1000 }));
  } else if (f.enemyType === 'ju88g') {
    f.guns = [-.4, -.2, .2, .4].map(x => makeGun({ offset: new THREE.Vector3(x, -.45, 3.8), rate: 10, muzzleVel: 700, damage: 14, cannon: true, ammo: 200 }));
    for (const side of [-1, 1]) f.guns.push(makeGun({ offset: new THREE.Vector3(side * .22, 1.7, -2.665),
      dir: new THREE.Vector3(0, SCHRAGE_Y, SCHRAGE_Z), oblique: true, rate: 9, muzzleVel: 700,
      damage: 12, cannon: true, ammo: 100, spread: .004, tracerEvery: 2 }));
  }
}
