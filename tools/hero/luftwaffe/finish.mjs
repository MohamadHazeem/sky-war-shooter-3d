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
// KTX2/Basis is not used: no Basis encoder is installed on this machine (see docs/phase10/reports/05.md).
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, textureCompress, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = process.env.HERO_SRC ?? join(REPO, 'tools/hero/luftwaffe/out');
const OUT = process.env.HERO_OUT ?? join(REPO, 'public/models');
// texture sizes: colour carries the markings and seams at full size; the normal map (grooves, rivets)
// and ORM (AO, roughness, metalness) are low-frequency enough for half (GPU memory: no KTX2 here)
const TEX = { base: Number(process.env.HERO_TEX ?? 2048), normal: 1024, orm: 1024, ace: Number(process.env.HERO_TEX ?? 2048) };
const Q = Number(process.env.WEBP_QUALITY ?? 86);

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
  return sharp(readFileSync(join(SRC, `${kind}_${map}.png`))).resize(size, size).png().toBuffer();
}

const want = process.argv.slice(2);
const kinds = want.length ? want : readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
mkdirSync(OUT, { recursive: true });
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
    .setNormalTexture(nrm).setNormalScale(1)
    .setDoubleSided(false).setAlphaMode('OPAQUE');
  if (glass) {
    glass.setBaseColorFactor([0.62, 0.68, 0.7, 0.2]).setAlphaMode('BLEND').setRoughnessFactor(0.04)
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
  console.log(`${kind.padEnd(8)} ${(statSync(dst).size / 1048576).toFixed(2)} MB  + ace ${(ace.length / 1048576).toFixed(2)} MB`);
}
