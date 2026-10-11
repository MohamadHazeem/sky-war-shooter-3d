import assert from 'node:assert/strict';
/** Optional close-up and feedback fixtures for aa_browser_check.mjs. */
export async function verifyPolish(page, shots) {
  const result = {};
  const capture = async name => {
    await page.evaluate(() => { for (let i = 0; i < 12; i++) sws.engine.render(1 / 60); });
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 78 });
  };
  await page.evaluate(async () => {
    const g = sws.game; g.settings.quality = 'high'; g.applySettings(); g.startMission((await import('/src/game/AADefenceMode.ts')).aaMission('clear'));
    sws.step(420); g.ui.fade(false);
  });
  await page.waitForTimeout(4000);
  result.scene = await page.evaluate(() => {
    const aa = sws.game.aa, bags = aa.field.pits[0].object.getObjectByName('hessian sandbag courses');
    return { cirrus: sws.engine.sky.cirrus.value, instancedBags: bags.count, assets: document.querySelectorAll('.aa-asset').length, shaderPrograms: sws.engine.renderer.info.programs.length, crew: aa.field.detail.crew.length };
  });
  assert.equal(result.scene.cirrus, 0); assert.equal(result.scene.instancedBags, 136); assert.equal(result.scene.assets, 11); assert.ok(result.scene.crew > 0);
  // Inspect the actual game models with an orbit camera; gameplay views are captured by the parent harness.
  for (const [name, pit, offset, aim] of [
    ['quad-closeup', 0, [-2.1, 2.25, -2.7], [0, 1.35, 0.3]],
    ['bofors-closeup', 1, [-2.7, 2.7, -3.2], [0, 1.45, 0.7]],
    ['sandbag-pit', 0, [-6, 3.1, -5], [0, 0.9, 0]],
  ]) {
    await page.evaluate(({ pit, offset, aim }) => {
      const g = sws.game, aa = g.aa, cam = g.engine.camera, rig = aa.field.rigs[pit];
      rig.yaw.rotation.y = 0; rig.pitch.rotation.x = -0.12;
      const p = aa.field.pits[pit].pos;
      cam.position.copy(p); cam.position.x += offset[0]; cam.position.y += offset[1]; cam.position.z += offset[2];
      cam.lookAt(p.x + aim[0], p.y + aim[1], p.z + aim[2]); cam.fov = 52; cam.updateProjectionMatrix();
      document.querySelector('#banner').style.visibility = 'hidden'; document.querySelector('#aaHud').hidden = true; document.querySelector('#subs').style.display = 'none'; g.ui.ctx.clearRect(0, 0, innerWidth, innerHeight);
      aa.field.detail.update(cam, g.world.time, false); sws.engine.render(1 / 60);
    }, { pit, offset, aim });
    await capture(name);
  }
  for (const [name, kind, offset, aimY] of [
    ['airfield-ground', 'hangar', [50, 2.1, 70], 7],
    ['watch-office', 'tower', [18, 2, 30], 4],
    ['parked-fortress', 'bomber', [36, 2.1, 32], 2],
  ]) {
    await page.evaluate(({ kind, offset, aimY }) => {
      const g = sws.game, aa = g.aa, obj = aa.field.assets.find(a => a.kind === kind).object, cam = g.engine.camera;
      cam.position.set(...offset); obj.localToWorld(cam.position); cam.position.y = offset[1];
      cam.lookAt(obj.position.x, aimY, obj.position.z); cam.fov = 64; cam.updateProjectionMatrix();
      aa.field.detail.update(cam, g.world.time, false); sws.engine.render(1 / 60);
    }, { kind, offset, aimY });
    await capture(name);
  }
  // Real firing checks: four cases per quad discharge, glow/smoke at heat, four-round clip pause.
  result.feedback = await page.evaluate(() => {
    const g = sws.game, aa = g.aa;
    document.querySelector('#banner').style.visibility = ''; document.querySelector('#aaHud').hidden = false; document.querySelector('#subs').style.display = '';
    aa.selected = 0; aa.mounts[0].yaw = aa.mounts[0].wantYaw = 0; aa.mounts[0].pitch = aa.mounts[0].wantPitch = 0.25;
    g.input.setVirtualButtons('aa-test', 1); sws.step(160, 1 / 60, true); g.input.setVirtualButtons('aa-test', 0);
    const hot = aa.field.rigs[0].heat.emissiveIntensity > 0, cases = aa.field.cases.filter(c => c.ttl > 0).length, smoke = g.world.effects.smoke.count;
    const p = aa.field.pits[0].pos.clone(); p.z += 18; aa.blast(p, 20, 0);
    const shake = aa.blastShake; sws.step(4, 1 / 60, true);
    return { hot, cases, smoke, shake, dust: g.world.effects.smoke.count > smoke };
  });
  assert.ok(result.feedback.hot && result.feedback.cases > 4 && result.feedback.smoke > 0 && result.feedback.shake > 0 && result.feedback.dust);
  await capture('near-impact');
  result.clip = await page.evaluate(() => {
    const g = sws.game, aa = g.aa; aa.switchPit(1); sws.step(45);
    const m = aa.mounts[1]; m.yaw = m.wantYaw = 0.7; m.pitch = m.wantPitch = 0.3;
    g.input.setVirtualButtons('aa-test', 1);
    for (let frame = 0; frame < 180 && m.ammo > 20; frame++) sws.step(1);
    g.input.setVirtualButtons('aa-test', 0);
    return { ammo: m.ammo, clip: m.clip, loading: m.clipReload > 0, hiddenClip: !aa.field.rigs[1].clip.visible };
  });
  assert.deepEqual(result.clip, { ammo: 20, clip: 0, loading: true, hiddenClip: true });
  result.boforsClearance = await page.evaluate(async () => {
    const { Raycaster, Vector3 } = await import('/node_modules/three/build/three.module.js');
    const e = sws.engine, ray = new Raycaster(e.camera.position, e.camera.getWorldDirection(new Vector3()), 0, 8);
    return ray.intersectObject(sws.game.aa.field.detail.group, true).length === 0;
  });
  assert.ok(result.boforsClearance);
  // The existing timed fuze creates black flak at the aim range, with a short orange core.
  await page.evaluate(() => { sws.step(20, 1 / 60, true); });
  await capture('bofors-flak');
  result.restoredClip = await page.evaluate(() => { sws.step(50); return sws.game.aa.mounts[1].clip === 4 && sws.game.aa.field.rigs[1].clip.visible; });
  assert.ok(result.restoredClip);
  // Force all LODs in view at both qualities: already-warmed variants must not compile mid-raid.
  result.programs = [];
  for (const quality of ['low', 'high']) {
    result.programs.push(await page.evaluate(quality => {
      const g = sws.game, e = sws.engine;
      g.settings.quality = quality; g.applySettings(); sws.step(60, 1 / 60, true);
      const before = e.renderer.info.programs.length, keys = new Set(e.renderer.info.programs.map(p => p.cacheKey));
      for (const a of g.aa.field.assets) {
        e.camera.position.copy(a.pos); e.camera.position.y += 2; e.camera.lookAt(a.pos.x + 30, 4, a.pos.z + 30);
        g.aa.field.detail.update(e.camera, g.world.time, true); e.render(1 / 60);
      }
      return { quality, before, after: e.renderer.info.programs.length, added: e.renderer.info.programs.filter(p => !keys.has(p.cacheKey)).map(p => p.cacheKey) };
    }, quality));
  }
  for (const p of result.programs) assert.equal(p.before, p.after);
  await page.evaluate(() => { sws.game.settings.quality = 'low'; sws.game.applySettings(); });
  return result;
}
