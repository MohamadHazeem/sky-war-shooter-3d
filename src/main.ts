import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Atmos, syncAtmosUniforms } from './render/Atmosphere';
import './style.css';

const engine = new Engine(document.getElementById('app')!);
engine.camera.position.set(0, 7600, 0);
const params = new URLSearchParams(location.search);
const yaw = parseFloat(params.get('yaw') ?? '90');
const pitch = parseFloat(params.get('pitch') ?? '-8');
engine.camera.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
const box = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 5), new THREE.MeshStandardMaterial({ color: 0x8a8460, roughness: 0.7 }));
box.position.set(-200, 7610, -40);
box.castShadow = box.receiveShadow = true;
engine.scene.add(box);
(window as any).engine = engine;
(window as any).Atmos = Atmos;
(window as any).syncAtmos = syncAtmosUniforms;
engine.start();
