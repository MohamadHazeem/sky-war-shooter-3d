import * as THREE from 'three';

// Procedural props (no external assets). Builders return fresh objects; callers clone them,
// which shares geometry and materials between copies.

const TANK_LENGTH = 2.1;     // m, nose tip to tail
const TANK_RADIUS = 0.34;    // m, barrel radius
const TANK_YELLOW = 0xd9a51e;
const TANK_SEAM = 0xa37a17;  // a shade darker so the joint reads without a new colour

const NOSE_END = 0.22;       // fraction of the length given to the elliptical nose
const TAIL_START = 0.68;     // fraction where the tail cone begins
const TAIL_TIP = 0.28;       // tail-end radius as a fraction of the barrel radius
const SEAM_Z = 0.2;          // seam position along the axis (nose is +Z), inside the barrel

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Half-profile for LatheGeometry. Points run bottom to top (y increasing) so faces point outward.
function tankProfile(): THREE.Vector2[] {
  const N = 48;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -TANK_LENGTH / 2)]; // flat tail cap centre
  for (let i = N; i >= 0; i--) {
    const f = i / N; // 0 at the nose tip, 1 at the tail
    let r: number;
    if (f < NOSE_END) {
      const u = f / NOSE_END;
      r = TANK_RADIUS * Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u))); // ellipsoidal nose
    } else if (f < TAIL_START) {
      r = TANK_RADIUS;
    } else {
      r = TANK_RADIUS * (1 - (1 - TAIL_TIP) * smooth((f - TAIL_START) / (1 - TAIL_START)));
    }
    pts.push(new THREE.Vector2(r, TANK_LENGTH / 2 - f * TANK_LENGTH));
  }
  return pts;
}

// Yellow 300 L belly tank for the Fw 190 (teardrop body, seam ring, tail fin).
// Origin is the tank centre; the long axis is Z with the nose at +Z, matching the fighter's forward.
export function makeDropTank(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'dropTank';
  const paint = new THREE.MeshStandardMaterial({ color: TANK_YELLOW, roughness: 0.5, metalness: 0.2 });
  const seamMat = new THREE.MeshStandardMaterial({ color: TANK_SEAM, roughness: 0.55, metalness: 0.2 });

  // Lathe revolves about Y; rotating +90 deg about X maps +Y onto the +Z forward axis
  const body = new THREE.Mesh(new THREE.LatheGeometry(tankProfile(), 28).rotateX(Math.PI / 2), paint);
  body.castShadow = true;
  group.add(body);

  // Seam ring where the two tank halves are joined: a slim torus (its axis is already Z)
  const seam = new THREE.Mesh(new THREE.TorusGeometry(TANK_RADIUS + 0.004, 0.016, 8, 32), seamMat);
  seam.position.z = SEAM_Z;
  seam.castShadow = true;
  group.add(seam);

  // Small swept tail fin on top of the tail cone. The shape's x is -z so that the
  // rotateY(+90 deg) below lands it on the tail (-Z) end with the right orientation.
  const fin = new THREE.Shape();
  fin.moveTo(0.70, 0.04);
  fin.lineTo(0.70, 0.20);
  fin.lineTo(0.88, 0.30);
  fin.lineTo(1.04, 0.24);
  fin.lineTo(1.04, 0.04);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.035, bevelEnabled: false, curveSegments: 1 });
  finGeo.translate(0, 0, -0.0175).rotateY(Math.PI / 2);
  const finMesh = new THREE.Mesh(finGeo, paint);
  finMesh.castShadow = true;
  group.add(finMesh);

  return group;
}
