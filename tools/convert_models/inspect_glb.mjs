// Loads .glb files with three's GLTFLoader (in Node) and prints what the game sees:
// node names (+ pivot and local +Z for prop_/fan_ nodes), bounding box, triangle count, textures.
//
//   node tools/convert_models/inspect_glb.mjs public/models/*.glb
//
// Node has no image decoder, so textures are stripped from a copy of the glTF JSON
// before parsing (their sizes are read from the JPEG/PNG headers instead).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

function readGlb(buf) {
  const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off < u8.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const data = u8.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  const pad = (n) => (n + 3) & ~3;
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jl = pad(js.length), bl = bin ? pad(bin.length) : 0;
  const out = new Uint8Array(12 + 8 + jl + (bin ? 8 + bl : 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jl); out.set(js, 20);
  if (bin) {
    const o = 20 + jl;
    dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8);
  }
  return out.buffer;
}

function imageSize(bytes, mime) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === 'image/png') return [dv.getUint32(16), dv.getUint32(20)];
  if (mime === 'image/webp') { // RIFF....WEBP, then a VP8 / VP8L / VP8X chunk
    const tag = String.fromCharCode(...bytes.subarray(12, 16));
    if (tag === 'VP8 ') return [dv.getUint16(26, true) & 0x3fff, dv.getUint16(28, true) & 0x3fff];
    if (tag === 'VP8L') { const b = dv.getUint32(21, true); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
    if (tag === 'VP8X') return [1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))];
    return [0, 0];
  }
  for (let i = 2; i < bytes.length - 9;) { // JPEG: find a SOFn marker
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [dv.getUint16(i + 7), dv.getUint16(i + 5)];
    i += 2 + dv.getUint16(i + 2);
  }
  return [0, 0];
}

const f = (v) => v.toArray().map((x) => x.toFixed(3)).join(', ');

for (const file of process.argv.slice(2)) {
  const buf = readFileSync(file);
  const { json, bin } = readGlb(buf);
  const images = (json.images || []).map((im) => {
    const bv = json.bufferViews[im.bufferView];
    const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const [w, h] = imageSize(bytes, im.mimeType);
    return `${im.name || '?'} ${im.mimeType.replace('image/', '')} ${w}x${h} ${(bv.byteLength / 1024).toFixed(0)} KB`;
  });
  // strip textures so GLTFLoader does not need an image decoder
  for (const m of json.materials || []) {
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture;
  }
  delete json.textures; delete json.images; delete json.samplers;
  for (const k of ['extensionsUsed', 'extensionsRequired']) if (json[k]) json[k] = json[k].filter((e) => e !== 'EXT_texture_webp');

  const gltf = await new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(writeGlb(json, bin), '', res, rej));
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let tris = 0, prims = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    prims++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  console.log(`\n== ${basename(file)}  ${(buf.length / 1024).toFixed(0)} KB`);
  console.log(`  bbox min (${f(box.min)})  max (${f(box.max)})`);
  console.log(`  wingspan (X) ${size.x.toFixed(2)} m  height (Y) ${size.y.toFixed(2)} m  length (Z) ${size.z.toFixed(2)} m`);
  console.log(`  triangles ${tris}  mesh primitives ${prims}`);
  console.log(`  textures: ${images.join(' | ') || '-'}`);
  const names = [];
  root.traverse((o) => {
    if (o === root || !o.name || (o.isMesh && o.parent && o.parent.name === o.name) || o.userData.meshOf) return;
    if (/^(prop|fan)_\d+$|^gun_|^turret_|^cooling_fan$/.test(o.name)) {
      const p = o.getWorldPosition(new THREE.Vector3());
      const z = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
      const r = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      names.push(`${o.name} [pivot (${f(p)}) local+Z (${f(z)}) extent ${r.x.toFixed(2)}x${r.y.toFixed(2)}]`);
    } else names.push(o.name);
  });
  console.log(`  nodes: ${[...new Set(names)].join(', ')}`);
}
