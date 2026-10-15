#!/usr/bin/env node
// Finishes the hero aircraft built by tools/hero/luftwaffe/build.py (Blender):
//   tools/hero/luftwaffe/out/<kind>.glb + <kind>_{base,orm,normal,ace}.png  ->  public/models/<kind>.glb (+ <kind>_ace.webp)
//
//   node tools/hero/luftwaffe/finish.mjs                 # every kind found in tools/hero/luftwaffe/out
//   node tools/hero/luftwaffe/finish.mjs bf109 fw190
//
// Steps: attach the PBR set to the 'hero_<kind>' material (base colour, ORM packed as glTF wants it:
// occlusion R / roughness G / metalness B, tangent-space normal map), set up the glass, move meshes off
// the named nodes (the same isolateNamedMeshes as tools/compress_models.mjs so pivots keep their
// transforms), WebP textures and meshopt geometry. The ace livery's base colour is written next to the
// model as a WebP that the game loads only when an ace flies that type (world/HeroLook.ts).
// KTX2 (goal 05b): with a Basis Universal encoder (BASISU=/path/to/basisu, or basisu on PATH) the same maps are
// also written as <kind>_{base,normal,orm}.ktx2 (UASTC, Zstandard, mipmaps); world/HeroLook.ts swaps them in
// for the embedded WebP once the renderer can transcode them, and keeps the WebP on any failure.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsIOR } from '@gltf-transform/extensions';
import { meshopt, textureCompress, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { finishNormalPng } from '../normal-finish.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = process.env.HERO_SRC ?? join(REPO, 'tools/hero/luftwaffe/out');
const OUT = process.env.HERO_OUT ?? join(REPO, 'public/models');
// Shipped sizes: 2048 colour/markings, 1024 normal/packed material maps.
// Mipmapped KTX2 replaces the embedded WebP without adding runtime texture slots.
const TEX = { base: Number(process.env.HERO_TEX ?? 2048), normal: 1024, orm: 1024, ace: Number(process.env.HERO_TEX ?? 2048) };
const Q = Number(process.env.WEBP_QUALITY ?? 95);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

function isolateNamedMeshes(doc) {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getName() === '') continue;
    const holder = doc.createNode('').setMesh(mesh).setExtras({ meshOf: node.getName() });
    node.setMesh(null).addChild(holder);
  }
}

async function png(kind, map, size = TEX[map] ?? TEX.base) {
  if (map === 'normal') return finishNormalPng(readFileSync(join(SRC, `${kind}_${map}.png`)), size);
  return sharp(readFileSync(join(SRC, `${kind}_${map}.png`))).resize(size, size).png().toBuffer();
}

function findBasisu() {
  for (const c of [process.env.BASISU, 'basisu']) {
    if (!c) continue;
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); return c; } catch { /* next */ }
  }
  return null;
}
const BASISU = findBasisu();
// UASTC 4x4 (+ RDO, Zstandard) with mipmaps; colour in sRGB, normal / ORM linear
async function ktx2(kind, map, name) {
  const dir = mkdtempSync(join(tmpdir(), 'herok-'));
  const src = join(dir, `${kind}_${name}.png`);
  writeFileSync(src, await png(kind, map));
  // The Bf 109's dense atlas needs slightly more colour RDO to retain its 8 MiB budget.
  const args = ['-ktx2', '-uastc', '-uastc_level', '2', '-uastc_rdo_l', name === 'base' ? (kind === 'bf109' ? '1.3' : '0.6') : '1.0', '-mipmap',
    '-ktx2_zstandard_level', '12', '-output_path', dir];
  if (name !== 'base') args.push('-linear');
  if (name === 'normal') args.push('-normal_map');
  execFileSync(BASISU, [...args, src], { stdio: 'ignore' });
  const out = readFileSync(join(dir, `${kind}_${name}.ktx2`));
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(join(OUT, `${kind}_${name}.ktx2`), out);
  return out.length;
}

const want = process.argv.slice(2);
const kinds = want.length ? want : readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
mkdirSync(OUT, { recursive: true });
if (!BASISU) console.log('no Basis encoder (BASISU): WebP only');
for (const kind of kinds) {
  const doc = await io.read(join(SRC, `${kind}.glb`));
  const root = doc.getRoot();
  const skin = root.listMaterials().find((m) => m.getName() === `hero_${kind}`);
  const glass = root.listMaterials().find((m) => m.getName() === `hero_${kind}_glass`);
  if (!skin) throw new Error(`${kind}: no hero_${kind} material`);
  const tex = async (map, name) => doc.createTexture(`${kind}_${name}`).setImage(await png(kind, map)).setMimeType('image/png');
  const base = await tex(process.env.HERO_BASE ?? 'base', 'base');
  const orm = await tex('orm', 'orm');
  const nrm = await tex('normal', 'normal');
  skin.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(base)
    .setMetallicFactor(1).setRoughnessFactor(1).setMetallicRoughnessTexture(orm)
    .setOcclusionTexture(orm).setOcclusionStrength(1)
    .setNormalTexture(nrm).setNormalScale(1.15)
    .setDoubleSided(false).setAlphaMode('OPAQUE');
  if (glass) {
    glass.setExtension('KHR_materials_clearcoat',doc.createExtension(KHRMaterialsClearcoat).createClearcoat().setClearcoatFactor(.35).setClearcoatRoughnessFactor(.08));
    glass.setExtension('KHR_materials_ior',doc.createExtension(KHRMaterialsIOR).createIOR().setIOR(1.46));
    glass.setBaseColorFactor([0.12, 0.145, 0.15, 0.085]).setAlphaMode('BLEND').setRoughnessFactor(0.045)
      .setMetallicFactor(0).setDoubleSided(true).setBaseColorTexture(null).setMetallicRoughnessTexture(null);
  }
  isolateNamedMeshes(doc);
  await doc.transform(
    prune({ keepLeaves: true, keepAttributes: false, keepExtras: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: Q, effort: 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizeTexcoord: 14 }),
  );
  const dst = join(OUT, `${kind}.glb`);
  await io.write(dst, doc);
  const ace = await sharp(await png(kind, 'ace')).webp({ quality: Q, effort: 6 }).toBuffer();
  writeFileSync(join(OUT, `${kind}_ace.webp`), ace);
  let k = '';
  if (BASISU) {
    let n = 0;
    for (const [map, name] of [[process.env.HERO_BASE ?? 'base', 'base'], ['normal', 'normal'], ['orm', 'orm']]) n += await ktx2(kind, map, name);
    k = `  + ktx2 ${(n / 1048576).toFixed(2)} MB`;
  }
  console.log(`${kind.padEnd(8)} ${(statSync(dst).size / 1048576).toFixed(2)} MB  + ace ${(ace.length / 1048576).toFixed(2)} MB${k}`);
}
