import { access } from '../core/Accessibility';
import { WEATHER_PRESETS, blendConditions, type WeatherPreset } from './WeatherPresets';
import * as THREE from 'three';
import { Atmos, atmosUniforms, syncAtmosUniforms, updateSunDir } from './Atmosphere';
import { syncAircraftLook } from './AircraftLook';
import { StormWall } from './StormWall';
import { cloudLights } from './CloudLights';
import { weatherNow, type Mood } from './WeatherState';
import type { Engine } from '../core/Engine';

export { weatherNow } from './WeatherState';
export type { Mood } from './WeatherState';

// A change of weather during a mission: `at` seconds of flying time after the weather was set,
// the sky starts turning into `to` and takes `duration` seconds to get there (cloud cover, sun,
// sky colours, haze, rain on the glass all ramp together). A storm is seen coming: its wall
// stands on the horizon ahead for the last WALL_LEAD seconds before it arrives, and the
// lightning starts once it is overhead. Cover / contrails of the new sky default to the mood's.
export interface WeatherFront {
  preset?: WeatherPreset;
  at: number;            // s of flying time
  to: Exclude<Mood, 'night'>;
  duration?: number;     // s (default 45)
  low?: number;
  high?: number;
  contrails?: boolean;
}

// Time of day + cloud cover for a mission. Low sun elevations warm the light and
// the horizon for golden-hour missions.
export interface Weather {
  preset?: WeatherPreset;
  wind?: { speed: number; direction: number }; // m/s, degrees clockwise from +Z; capped at 12 m/s
  sunEl: number;        // degrees
  sunAz: number;        // degrees
  low: number;          // low (cumulus sea) coverage 0..1
  high: number;         // upper layer coverage 0..1
  contrails?: boolean;
  mood?: Mood;          // grey overcast, dark storm with lightning, red dusk, moonlit night
  front?: WeatherFront; // the weather changes during the mission
}

export const DEFAULT_WEATHER: Weather = { sunEl: 52, sunAz: 205, low: 0.7, high: 0.55, contrails: true };

// Cloud cover a front brings for each mood (the Survival round sets, ROUND_WEATHER)
export const FRONT_SKY: Record<WeatherFront['to'], { low: number; high: number; contrails: boolean }> = {
  clear: { low: 0.55, high: 0.35, contrails: true },
  overcast: { low: 0.9, high: 0.95, contrails: false },
  storm: { low: 0.97, high: 0.98, contrails: false },
  dusk: { low: 0.62, high: 0.4, contrails: true },
};
const FRONT_DURATION = 45;
const WALL_LEAD = 95;              // s the storm wall is in sight before the front arrives
const WALL_FAR = 46000, WALL_NEAR = 4500, WALL_GONE = 1500;   // m
// The reflection map (PMREM, ~10 ms) is not rebuilt while the sky turns: the cloud-sea floor
// dominates it and changes little between moods, and environmentIntensity / the hemisphere light
// follow per frame. It is rebuilt at the next pause (hangar break, pause menu), where a hitch is unseen.

// ---------------- the sky for a weather: one flat state that can be blended ----------------
const SUN = 0, SUN_I = 3, ZEN = 4, HOR = 7, GND = 10, AMB = 13, ENV_FLOOR = 14, ENV_I = 15, LOW = 16, HIGH = 17, HAZE = 18, NIGHT = 19, DARK = 20, EXPO = 21, LIFT = 22;
const STRATUS = 23, TOWERS = 24;
const N = 25;
const BASE_EXPOSURE = 1.06;                                      // PostFX.baseExposure by day
const BASE_LIFT = new THREE.Vector3(0.003, 0.004, 0.006);        // PostFX.grade.lift by day
type Sky = Float64Array;

function skyFor(w: Weather, o: Sky): Sky {
  const L = THREE.MathUtils.lerp;
  const set3 = (i: number, r: number, g: number, b: number) => { o[i] = r; o[i + 1] = g; o[i + 2] = b; };
  // 0 = golden hour, 1 = high summer sun
  const k = THREE.MathUtils.smoothstep(w.sunEl, 8, 45);
  set3(SUN, 1.0, L(0.72, 0.95, k), L(0.46, 0.88, k));
  o[SUN_I] = L(3.1, 4.2, k);
  set3(ZEN, L(0.06, 0.045, k), L(0.13, 0.15, k), L(0.36, 0.5, k));
  set3(HOR, L(0.66, 0.5, k), L(0.58, 0.62, k), L(0.56, 0.8, k));
  set3(GND, 0.11, 0.14, 0.17);
  o[AMB] = L(0.5, 0.6, k);
  o[ENV_FLOOR] = 1; o[ENV_I] = 0.75;
  o[LOW] = w.low; o[HIGH] = w.high;
  o[HAZE] = 1; o[NIGHT] = 0; o[DARK] = 0; o[EXPO] = 1; o[LIFT] = 1;
  if (w.mood === 'night') {
    // moonlight (the "sun" is the moon): a faint cold key light, a near-black sky with a deep
    // blue glow on the horizon, dark ground and barely any fill. Exhaust flames, searchlights
    // and flares carry the scene (Searchlights.ts, NightExhaust.ts, Flares.ts).
    set3(SUN, 0.62, 0.72, 1.0);
    o[SUN_I] = 0.26;
    set3(ZEN, 0.0018, 0.0026, 0.0075);
    set3(HOR, 0.012, 0.016, 0.03);
    set3(GND, 0.005, 0.006, 0.009);
    o[AMB] = 0.045;
    // a night should read as night: the grade's print-film black lift and a little exposure come
    // off, so the flames, flares, beams and tracers carry the frame against a near-black sky
    o[EXPO] = 0.82; o[LIFT] = 0.25;
    o[ENV_FLOOR] = 0.02;   // no sunlit cloud sea to light the aircraft from below
    o[ENV_I] = 0.25;
    o[NIGHT] = 1; o[DARK] = 1;
  } else if (w.mood === 'dusk') {
    // sun on the horizon: deep orange light, dimming violet zenith, a glowing red rim
    set3(SUN, 1.0, 0.5, 0.26);
    o[SUN_I] = 2.4;
    set3(ZEN, 0.05, 0.07, 0.2);
    set3(HOR, 0.78, 0.46, 0.34);
    o[AMB] = 0.42;
    o[DARK] = 0.25;
  } else if (w.mood === 'overcast') {
    // flat grey light under a high deck: little direct sun, bright diffuse sky
    set3(SUN, 0.92, 0.93, 0.95);
    o[SUN_I] *= 0.55;
    set3(ZEN, 0.16, 0.19, 0.24);
    set3(HOR, 0.55, 0.58, 0.62);
    o[AMB] = 0.75;
    o[HAZE] = 0.85; o[DARK] = 0.12;
  } else if (w.mood === 'storm') {
    // towering dark cloud: dim, cold, heavy, the murk closing in
    set3(SUN, 0.75, 0.8, 0.9);
    o[SUN_I] *= 0.35;
    set3(ZEN, 0.07, 0.08, 0.11);
    set3(HOR, 0.3, 0.32, 0.36);
    o[AMB] = 0.5;
    o[HAZE] = 0.62; o[DARK] = 0.45;
  }
  const condition = WEATHER_PRESETS[presetFor(w)];
  const cloud = condition.cloud;
  o[STRATUS] = w.mood === 'overcast' ? .9 : w.mood === 'storm' ? .12 : cloud * .65;
  o[TOWERS] = w.mood === 'storm' || presetFor(w) === 'thunderstorm' ? 1 : .25 + cloud * .3;
  o[SUN_I] *= 1 - cloud * .55;
  o[DARK] = Math.max(o[DARK], cloud * .45);
  for (let i = ZEN; i < GND; i += 3) {
    const grey = (o[i] + o[i + 1] + o[i + 2]) / 3;
    for (let j = 0; j < 3; j++) o[i + j] = THREE.MathUtils.lerp(o[i + j], grey, cloud * .85) * (1 - cloud * .22);
  }
  o[LOW] = Math.max(o[LOW], cloud * .97);
  o[HIGH] = Math.max(o[HIGH], cloud * .98);
  return o;
}

// Push a sky state into the shared atmosphere, the lights and the uniforms (no env-map rebuild)
function pushSky(engine: Engine, s: Sky) {
  Atmos.sunColor.setRGB(s[SUN], s[SUN + 1], s[SUN + 2]);
  Atmos.sunIntensity = s[SUN_I];
  Atmos.zenith.setRGB(s[ZEN], s[ZEN + 1], s[ZEN + 2]);
  Atmos.horizon.setRGB(s[HOR], s[HOR + 1], s[HOR + 2]);
  Atmos.ground.setRGB(s[GND], s[GND + 1], s[GND + 2]);
  Atmos.cloudAmbient = s[AMB];
  Atmos.stratus = s[STRATUS];
  Atmos.towers = s[TOWERS];
  Atmos.envFloor = s[ENV_FLOOR];
  Atmos.lowCoverage = s[LOW];
  Atmos.highCoverage = s[HIGH];
  Atmos.haze = s[HAZE];
  weatherNow.night = s[NIGHT];
  weatherNow.dark = s[DARK];
  engine.scene.environmentIntensity = s[ENV_I];
  engine.post.baseExposure = BASE_EXPOSURE * s[EXPO];
  engine.post.grade.lift.copy(BASE_LIFT).multiplyScalar(s[LIFT]);
  engine.sun.color.copy(Atmos.sunColor);
  syncAtmosUniforms();
  syncAircraftLook(engine.hemi);
}

export function presetFor(w: Weather): WeatherPreset { return w.preset ?? (w.mood === 'storm' ? 'thunderstorm' : 'clear'); }
/** A mode can pass this to Game.setWeather, retaining any time-of-day fields it needs. */
export function presetWeather(preset: WeatherPreset, base: Weather = DEFAULT_WEATHER): Weather {
  return { ...base, preset, front: undefined, contrails: preset === 'clear', mood: base.mood === 'night' || base.mood === 'dusk' ? base.mood : 'clear' };
}
function conditionFor(w: Weather) {
  const c = { ...WEATHER_PRESETS[presetFor(w)] };
  if (w.wind) {
    const speed = THREE.MathUtils.clamp(Number.isFinite(w.wind.speed) ? w.wind.speed : 0, 0, 12);
    const angle = (Number.isFinite(w.wind.direction) ? w.wind.direction : 0) * Math.PI / 180;
    c.windX = Math.sin(angle) * speed; c.windZ = Math.cos(angle) * speed;
  }
  return c;
}
function pushCondition(k: number) {
  blendConditions(weatherNow, conditionA, conditionB, k);
  Atmos.wind.set(weatherNow.windX, 0, weatherNow.windZ);
  atmosUniforms.uWeatherFog.value = weatherNow.fog;
}
const conditionA = { ...WEATHER_PRESETS.clear }, conditionB = { ...WEATHER_PRESETS.clear };

// ---------------- the front in progress ----------------
const skyA = new Float64Array(N), skyB = new Float64Array(N), skyNow = new Float64Array(N);
const front = {
  def: null as WeatherFront | null,
  base: null as Weather | null,   // the weather it started from (re-armed on a mission restart)
  t: 0,
  k: -1,                          // last blend applied (-1: not started)
  envDirty: false,
  envAge: 0,
  rearm: false,
  told: 0,                        // events reported (bit 1: wall sighted, 2: arriving, 4: done)
  wallDir: new THREE.Vector2(),
  wallSet: false,
  lightningT: 6,
  flashT: 0,
};
let wall: StormWall | null = null;

export function applyWeather(engine: Engine, w: Weather) {
  if (!wall) {
    wall = new StormWall();
    engine.scene.add(wall.mesh);
    // Persistent PMREM shaders permit sky IBL updates during a front, not only on pause.
    // Amortise the capture over three seconds of changing weather, retaining temporal history.
    engine.add({ update: (dt) => {
      front.envAge += dt;
      if (front.envDirty && (engine.paused || front.envAge >= 3)) {
        front.envDirty = false; front.envAge = 0; engine.refreshLighting(false);
      }
    } });
  }
  Object.assign(conditionA, conditionFor(w));
  Object.assign(conditionB, conditionA);
  pushCondition(0);
  weatherNow.preset = presetFor(w);
  const mood = w.mood ?? 'clear';
  weatherNow.mood = weatherNow.from = weatherNow.to = mood;
  weatherNow.k = 0;
  Atmos.sunElevationDeg = w.sunEl;
  Atmos.sunAzimuthDeg = w.sunAz;
  updateSunDir();
  pushSky(engine, skyFor(w, skyA));
  engine.refreshLighting();
  // the front this weather brings (Survival's round sets roll for one: an occasional random event)
  const f = w.front ?? (ROUND_WEATHER.includes(w) ? survivalFront(w, Math.random) : null);
  front.def = f;
  front.base = w;
  front.t = 0; front.k = -1; front.envDirty = false; front.envAge = 0; front.rearm = false; front.told = 0;
  front.wallSet = false; front.flashT = 0; front.lightningT = 4;
  wall.uniforms.uFade.value = 0;
  if (f) { const target = frontTarget(w, f); skyFor(target, skyB); Object.assign(conditionB, conditionFor(target)); }
}

// The sky a front turns into: the base weather with the front's mood and cover (same sun)
export function frontTarget(w: Weather, f: WeatherFront): Weather {
  const sky = FRONT_SKY[f.to];
  return { sunEl: w.sunEl, sunAz: w.sunAz, low: f.low ?? sky.low, high: f.high ?? sky.high, contrails: f.contrails ?? sky.contrails, mood: f.to, preset: f.preset, wind: w.wind };
}

// Survival: now and then the weather of a round turns part-way through it
export function survivalFront(w: Weather, rnd: () => number): WeatherFront | null {
  if (w.mood === 'night' || rnd() > 0.35) return null;
  const from = w.mood ?? 'clear';
  const options: WeatherFront['to'][] = from === 'storm' ? ['clear', 'overcast'] : from === 'overcast' ? ['storm', 'clear'] : ['storm', 'overcast'];
  const at = 40 + Math.floor(rnd() * 50);
  const to = options[Math.floor(rnd() * options.length)];
  const presets: WeatherPreset[] = ['lightRain', 'heavyRain', 'snow', 'fog'];
  return { at, to, preset: to === 'overcast' ? presets[Math.min(3, Math.floor(rnd() * 4))] : undefined, duration: FRONT_DURATION };
}

// World.reset: a restart of the same mission (Game skips an unchanged weather) starts the front over
export function weatherRestart() { if (front.def) front.rearm = true; }

export const FRONT_EVENT = { none: 0, sighted: 1, arriving: 2, clearing: 3, done: 4 } as const;

const _cam = new THREE.Vector3();

// Every frame of flying (World.update): runs the front, the storm wall and the front's own
// lightning. `forward`: the formation's heading (the wall stands across it). Returns a
// FRONT_EVENT the first frame something happens (World turns it into a radio call / contrails).
export function updateWeather(engine: Engine, dt: number, forward: THREE.Vector3): number {
  const f = front.def;
  if (!f || !wall || !front.base) return 0;
  if (front.rearm) {
    // mission restarted under unchanged weather: back to the start of the front
    const base = front.base;
    applyWeather(engine, base);
    front.def = f;   // keep the same front (a random Survival one included)
    const target = frontTarget(base, f);
    skyFor(target, skyB); Object.assign(conditionB, conditionFor(target));
  }
  front.t += dt;
  const dur = Math.max(5, f.duration ?? FRONT_DURATION);
  const storm = f.to === 'storm' || f.preset === 'thunderstorm';
  let ev = 0;
  // ---- the wall on the horizon (storms only) ----
  const u = wall.uniforms;
  const lead = front.t - (f.at - WALL_LEAD);
  if (storm && lead > 0 && front.t < f.at + dur * 0.7) {
    if (!front.wallSet) {
      front.wallSet = true;
      front.wallDir.set(forward.x, forward.z);
      if (front.wallDir.lengthSq() < 1e-6) front.wallDir.set(0, 1);
      front.wallDir.normalize();
    }
    const a = Math.min(1, lead / WALL_LEAD);
    // closing at a steady rate, so it looms faster and faster as it nears
    const D = front.t < f.at ? THREE.MathUtils.lerp(WALL_FAR, WALL_NEAR, a)
      : THREE.MathUtils.lerp(WALL_NEAR, WALL_GONE, Math.min(1, (front.t - f.at) / (dur * 0.7)));
    engine.camera.getWorldPosition(_cam);
    u.uCam.value.copy(_cam);
    u.uDir.value.copy(front.wallDir);
    u.uD.value = D;
    u.uBase.value = Atmos.lowTop - 900;
    u.uDeck.value = Atmos.lowTop;
    u.uTop.value = 13200;
    u.uTime.value += dt;
    const fadeIn = THREE.MathUtils.smoothstep(lead, 0, 12);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(front.t, f.at + dur * 0.1, f.at + dur * 0.7);
    u.uFade.value = fadeIn * fadeOut;
    if (lead > 4 && !(front.told & 1)) { front.told |= 1; ev = FRONT_EVENT.sighted; }
  } else u.uFade.value = 0;
  // ---- the sky turning ----
  const raw = (front.t - f.at) / dur;
  if (raw >= 0 && front.k < 1) {
    const k = THREE.MathUtils.smoothstep(raw, 0, 1);
    for (let i = 0; i < N; i++) skyNow[i] = skyA[i] + (skyB[i] - skyA[i]) * k;
    pushSky(engine, skyNow);
    pushCondition(k);
    weatherNow.preset = k < .5 ? presetFor(front.base) : (f.preset ?? (f.to === 'storm' ? 'thunderstorm' : 'clear'));
    weatherNow.from = front.base.mood ?? 'clear';
    weatherNow.to = f.to;
    weatherNow.k = k;
    weatherNow.mood = k < 0.5 ? weatherNow.from : f.to;
    front.envDirty = true;
    if (front.k < 0) ev = storm ? FRONT_EVENT.arriving : f.to === 'clear' ? FRONT_EVENT.clearing : ev || FRONT_EVENT.arriving;
    front.k = k;
    if (k >= 1) {
      weatherNow.from = weatherNow.to = weatherNow.mood = f.to;
      weatherNow.k = 0;
      ev = ev || FRONT_EVENT.done;
    }
  }
  // Distant lightning inside the approaching wall. Game.storm owns overhead strikes.
  if (u.uFade.value > .05 && weatherNow.effects) {
    front.lightningT -= dt;
    if (front.lightningT <= 0) {
      front.lightningT = 3 + Math.random() * 5;
      front.flashT = .22;
      u.uFlashAt.value = (Math.random() * 2 - 1) * .6;
    }
  }
  front.flashT = Math.max(0, front.flashT - dt);
  const flash = front.flashT / .22;
  u.uFlash.value = weatherNow.effects ? (flash > .6 || (flash > .2 && flash < .4) ? .55 : .08) * flash * 1.8 * access.flash : 0;
  return ev;
}

// Hook for the game layer (World sets it: the sound module lives there)
export const weatherEvents: { thunder?: (distM: number) => void } = {};

// A lightning stroke lighting the storm cloud from inside, somewhere around the camera
// (the weather front's own strikes, and Game.storm's via GameFeel)
const _p = new THREE.Vector3();
export function stormStrike(engine: Engine) {
  engine.camera.getWorldPosition(_p);
  const a = Math.random() * Math.PI * 2, r = 1500 + Math.random() * 4500;
  _p.x += Math.cos(a) * r; _p.z += Math.sin(a) * r;
  _p.y = Math.random() < 0.6 ? THREE.MathUtils.lerp(Atmos.lowBase, Atmos.lowTop, 0.3 + Math.random() * 0.5) : THREE.MathUtils.lerp(Atmos.highBase, Atmos.highTop, 0.4);
  cloudLights.flash(_p, 0.75, 0.82, 1.0, 3 * access.flash, 1300, 0.3, false);
}

// The front in force right now (dev / tests): progress 0..1 of the change, or -1 before it, null if none
export function frontState(): { to: Mood; preset?: WeatherPreset; at: number; t: number; k: number; wall: number } | null {
  const f = front.def;
  return f ? { to: f.to, preset: f.preset, at: f.at, t: front.t, k: front.k, wall: wall?.uniforms.uFade.value ?? 0 } : null;
}

// Weather sets that survival rounds cycle through (campaign missions set their own)
export const ROUND_WEATHER: Weather[] = [
  { sunEl: 52, sunAz: 205, low: 0.7, high: 0.55, contrails: true, mood: 'clear' },
  { sunEl: 14, sunAz: 250, low: 0.68, high: 0.45, contrails: true, mood: 'clear' },
  { sunEl: 40, sunAz: 180, low: 0.9, high: 0.95, contrails: false, mood: 'overcast' },
  { sunEl: 5, sunAz: 265, low: 0.62, high: 0.4, contrails: true, mood: 'dusk' },
  { sunEl: 30, sunAz: 170, low: 0.97, high: 0.98, contrails: false, mood: 'storm' },
  ...(['lightRain', 'heavyRain', 'snow', 'fog'] as WeatherPreset[]).map(preset => presetWeather(preset)),
];
