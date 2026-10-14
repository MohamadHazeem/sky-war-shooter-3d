import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { Engine } from '../core/Engine';
import { CAMPAIGN, survivalMission, type Mission } from '../game/Missions';
import { raidMission, nightMission } from '../game/RaidDefence';
import { seaMission } from '../game/SeaMission';
import { aaMission } from '../game/AADefenceMode';
import { Atmos } from '../render/Atmosphere';
import { markerCapture, captureMarkerAudit } from '../ui/MarkerAudit';
import { weatherNow } from '../render/WeatherState';

interface Hooks { game: Game; engine: Engine; step(n: number, dt?: number, render?: boolean): void }
/** Deliberately exercises real mission controllers, draw calls, deaths, removals, zoom,
 * camera turns and floating origin. No WebGL readbacks or render-derived oracle. */
export async function runMarkerScenarios(sws: Hooks, progress: (s: string) => void = () => {}) {
  const g = sws.game, e = sws.engine, w = g.world;
  const results: { scenario: string; frames: number; markers: number; worldMarkers: number; falseMarkers: number; kills: number; despawns: number; rebases: number; zoomFrames: number; kinds: Record<string, number>; errors: unknown[] }[] = [];
  const scenarios: { name: string; mission: () => Mission; weather?: 'fog' | 'heavyRain'; low?: boolean; boss?: boolean; special?: boolean }[] = [
    {name:'gunner-campaign', mission:()=>CAMPAIGN[0]},
    {name:'gunner-heavy-survival', mission:()=>survivalMission('gunner')},
    {name:'pilot-survival', mission:()=>survivalMission('pilot')},
    {name:'defend-the-field', mission:raidMission},
    {name:'sea-strike', mission:seaMission},
    {name:'hold-the-field', mission:()=>aaMission('clear')},
    {name:'night-fighter', mission:nightMission},
    {name:'gunner-fog', mission:()=>survivalMission('gunner'),weather:'fog'},
    {name:'gunner-heavy-rain-low', mission:()=>survivalMission('gunner'),weather:'heavyRain',low:true},
    {name:'special-ace', mission:()=>survivalMission('gunner'),special:true},
    {name:'boss-battle', mission:()=>survivalMission('gunner'),boss:true},
  ];
  const onFrame = e.onFrame, loop = e.loopOverride, quality = e.quality;
  let failure: string | null = null;
  const auto = g.bookends.auto, settings = {markers:g.settings.markers, detail:g.settings.hudDetail, lead:g.settings.leadPip};
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(), oldOrigin = new THREE.Vector3();
  try {
    e.loopOverride = () => {}; g.bookends.auto = true; markerCapture.enabled = true;
    g.settings.markers = true; g.settings.hudDetail = 'full'; g.settings.leadPip = 'always';
    for (const scenario of scenarios) {
      progress(`Starting ${scenario.name}`);
      e.setQuality(scenario.low ? 'low' : 'medium');
      const mission = {...scenario.mission()};
      const injected: import('../world/Aircraft').Fighter[] = [];
      // Keep the audit in combat for a full minute, without a hangar/bookend obscuring the HUD.
      mission.maxBombersLost = 99;
      if (!scenario.name.includes('night') && !scenario.weather) mission.weather = {sunEl:42,sunAz:205,low:.5,high:.4};
      g.startMission(mission); g.input.unlock();
      w.playerDamageScale = 0;
      sws.step(2);
      if (scenario.weather) g.setWeather(scenario.weather);
      if (scenario.boss) g.boss.force();
      if (scenario.special) g.specials.dev('ace');
      oldOrigin.copy(Atmos.originOffset);
      const row = {scenario:scenario.name,frames:0,markers:0,worldMarkers:0,falseMarkers:0,kills:0,despawns:0,rebases:0,zoomFrames:0,kinds:{} as Record<string,number>,errors:[] as unknown[]};
      results.push(row);
      e.onFrame = (dt, time) => {
        onFrame?.(dt, time);
        const audit = captureMarkerAudit(e.camera, innerWidth, innerHeight, w.aircraft, w.spotted);
        row.frames++; row.markers += audit.checked; row.falseMarkers += audit.falseMarkers;
        if (!g.aa.active && g.mission?.role === 'gunner' && g.gunner.ads > .5) row.zoomFrames++;
        for (const marker of audit.markers) { row.kinds[marker.kind] = (row.kinds[marker.kind] ?? 0) + 1; if (marker.mode === 'world') row.worldMarkers++; }
        if (audit.errors.length && row.errors.length < 10) row.errors.push({frame:row.frames,errors:audit.errors});
        if (!oldOrigin.equals(Atmos.originOffset)) {row.rebases++;oldOrigin.copy(Atmos.originOffset);}
      };
      for (let batch = 0; batch < 60; batch++) {
        document.querySelector<HTMLElement>('#hangar.show [data-go]')?.click();
        if (g.aa.active) g.aa.choose(0);
        if (g.state !== 'playing') throw new Error(`${scenario.name} stopped at ${row.frames}: ${g.state}`);
        // Seed additional close fighters in front and behind every two seconds; real AI
        // flies them between audits. Kill/despawn old contacts to stress stale references.
        if (batch % 2 === 0 && !g.aa.active) {
          e.camera.getWorldDirection(dir);
          const add = scenario.name === 'gunner-heavy-survival' ? Math.max(0, Math.min(12, 48 - w.activeEnemies().length)) : 4;
          for (let i = 0; i < add; i++) {
            pos.copy(e.camera.position).addScaledVector(dir, i === 3 ? -550 : 350 + i * 180);
            pos.y = Math.max(w.floorY + 200, pos.y);
            const f = w.spawnEnemy(pos, 'beam', .5, false);
            f.lastPlayerHit = w.time; injected.push(f);
          }
          if (batch > 0) {
            const enemies = injected.filter(f => f.alive && !f.remove);
            for (let i = 0; i < Math.min(3, enemies.length); i++) { w.killAircraft(enemies[i], false, ''); row.kills++; }
            const stale = injected.find(f => f.alive && !f.remove); if (stale) {stale.remove = true;row.despawns++;}
          }
        }
        if (!g.aa.active && mission.role === 'gunner') {
          g.input.setVirtualButtons('marker-audit', batch % 4 >= 2 ? 4 : 0);
          // Alternate hip/sight view and pan while simulation moves and shakes the camera.
          g.gunner.state.yaw = Math.sin(batch * .4) * .35;
          g.trauma = .25;
        }
        if (!g.aa.active && batch > 0 && batch % 15 === 0) {
          // Force the real floatingOrigin path: relocate world+camera together first.
          const shift = new THREE.Vector3(-6000, 0, -6000);
          e.rebase(shift); w.rebase(shift); g.hud.rebase(shift); e.camera.position.sub(shift);
          oldOrigin.copy(Atmos.originOffset);
        }
        // Keep a pilot flying level above terrain while retaining the actual controller.
        if (w.playerFighter) { w.playerFighter.pos.y = mission.naval ? 500 : mission.id.includes('raid') || mission.id.includes('night') ? 1200 : 7600; w.playerFighter.fm.vel.y = 0; }
        // Look at real mission raiders as well as injected stress contacts.
        const raider = g.pilotOps.raid.inbound()[0];
        if (raider && w.playerFighter) {
          w.playerFighter.pos.copy(raider.pos).add(pos.set(0, 30, -450));
          w.playerFighter.fm.vel.copy(raider.vel); g.pilot.padlock = raider;
        }
        if (scenario.special && batch % 10 === 0) {
          const ace = g.specials.active?.fighters[0];
          if (ace?.alive) { e.camera.getWorldDirection(dir); ace.pos.copy(e.camera.position).addScaledVector(dir, 600); }
        }
        sws.step(60, 1 / 60, false);
        // Recheck after the actual WebGL render, to catch any render-time camera mutation.
        const rendered = captureMarkerAudit(e.camera, innerWidth, innerHeight, w.aircraft, w.spotted);
        if (rendered.falseMarkers) {row.falseMarkers+=rendered.falseMarkers;if(row.errors.length<10)row.errors.push({rendered:rendered.errors});}
        progress(`${scenario.name}: ${row.frames}/3600 frames, ${row.markers} markers, ${row.falseMarkers} false`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      e.onFrame = onFrame; g.input.setVirtualButtons('marker-audit', 0);
    }
  } catch (error) { failure = String(error);
  } finally {
    e.onFrame = onFrame; e.loopOverride = loop; e.setQuality(quality); e.render(1 / 60); g.bookends.auto = auto;
    g.settings.markers = settings.markers; g.settings.hudDetail = settings.detail; g.settings.leadPip = settings.lead; g.input.setVirtualButtons('marker-audit', 0);
  }
  return { failure, frames:results.reduce((n,r)=>n+r.frames,0), markers:results.reduce((n,r)=>n+r.markers,0), falseMarkers:results.reduce((n,r)=>n+r.falseMarkers,0), results, weather:weatherNow.preset };
}
