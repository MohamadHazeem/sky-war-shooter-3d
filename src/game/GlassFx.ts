import * as THREE from 'three';
import type { World } from '../world/World';
import type { Bomber, Fighter, HitZone } from '../world/Aircraft';
import type { HitEvent } from '../world/Ballistics';
import type { Engine } from '../core/Engine';
import type { StationId } from '../world/B17Layout';
import { Atmos } from '../render/Atmosphere';
import { weatherNow } from '../render/WeatherState';
import { access } from '../core/Accessibility';
import { frostTexture } from './InteriorFx';

// Canopy and turret glass, seen from inside: one procedural overlay shader drawn on a mesh that
// follows the real glass (the P-51's own canopy geometry; spheres, a disc and a pane matching the
// B-17 top turret dome, ball turret port and tail window). Everything is computed in the shader,
// no images except InteriorFx's frost texture:
//  - rain (storm heavy, overcast in passing showers): running drops in a flow-aligned frame, more
//    streaky and swept back with airspeed, with static beads blinking in; dark rims, lighter
//    refracted cores and a sky glint.
//  - scratches + dust that catch the sun: a fine field of short scratches lit only when the sun is
//    within ~30 deg of the view ray, and only those lying across the line to the sun (the
//    concentric halo real perspex shows); faint forward-scattering dust haze. Scaled down with
//    the "reduce flashes" setting.
//  - oil: a streaky film and spatter on the P-51 windscreen (slowly over a mission, faster with a
//    damaged engine, spatter on engine hits) and on the B-17 top turret from damaged engines.
//  - frost from the frame edges of the turret glass in cold missions (InteriorFx approach).
//  - bullet cracks: up to four procedural spider-web cracks per pane, kept for the mission.
// Every effect is pushed back around the gunsight centre (and almost gone there in ADS).
// Low keeps only battle damage on gunner glass; weather, frost and wear stay hidden.
// The material is one program for every pane (warmGlassFx).

const MAX_CRACKS = 4;
const GLASS_STATIONS = ['top', 'ball', 'tail'] as const;

/** Swept closest approach: catches a fast crossing between the 10 Hz spray ticks. */
export function sprayExposure(p: THREE.Vector3, velocity: THREE.Vector3, dt: number) {
  const speed2 = velocity.lengthSq();
  if (speed2 < 144) return 0;
  const ago = THREE.MathUtils.clamp(p.dot(velocity) / speed2, 0, dt);
  const x = p.x - velocity.x * ago, y = p.y - velocity.y * ago, z = p.z - velocity.z * ago;
  return Math.max(0, 1 - Math.hypot(x, y, z) / 32);
}
const SHAPE_CANOPY = 0, SHAPE_SPHERE = 1, SHAPE_PLANE = 2;

const VERT = /* glsl */ `
  uniform mat4 uFrame;
  varying vec3 vP; varying vec3 vW; varying vec4 vClip;
  void main() {
    vP = (uFrame * vec4(position, 1.0)).xyz;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    vClip = gl_Position;
  }`;

const FRAG = /* glsl */ `
  uniform float uCondensation;
  uniform float uShape, uR, uTime, uRain, uSpeedK, uFlowV, uGlint, uDust, uOil, uSpat, uFrost, uCrackN, uAimK, uAspect;
  uniform vec3 uC, uAxis, uUp, uFlow, uFlowUp, uSun, uSunCol, uSky, uFlash;
  uniform vec4 uEdge, uAim;
  uniform vec2 uOilMask, uSunNdc;
  uniform vec4 uCrackP[${MAX_CRACKS}], uCrackA[${MAX_CRACKS}], uCrackB[${MAX_CRACKS}];
  uniform sampler2D uFrostTex;
  varying vec3 vP; varying vec3 vW; varying vec4 vClip;

  float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // cheap polynomial acos / atan2 (|error| < 1e-3 rad): these run over the whole canopy
  float facos(float x) {
    float ax = abs(x);
    float r = sqrt(1.0 - ax) * (1.5707288 + ax * (-0.2121144 + ax * (0.0742610 - 0.0187293 * ax)));
    return x < 0.0 ? 3.14159265 - r : r;
  }
  float fatan2(float y, float x) {
    float ax = abs(x), ay = abs(y);
    float a = min(ax, ay) / max(max(ax, ay), 1e-8);
    float s = a * a;
    float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
    if (ay > ax) r = 1.57079637 - r;
    if (x < 0.0) r = 3.14159265 - r;
    return y < 0.0 ? -r : r;
  }
  float azim(vec3 d, vec3 ax, vec3 up) { return fatan2(dot(d, cross(ax, up)), dot(d, up)); }

  // running drops in flow space q (x downstream, y across); m: metres per unit of q here, pxm:
  // pixel footprint (m). Cells live in q, drop shapes are metric. (body, rim, glint spot, trail)
  vec4 runDrops(vec2 q, float cw, float t, float dens, vec2 m, float pxm, float big) {
    float sk = uSpeedK;
    float cl = cw * (2.5 + 5.0 * sk);
    float col = floor(q.y / cw);
    float rc = h12(vec2(col, 3.7));
    float x = q.x - t * uFlowV * (0.5 + rc) + rc * 17.0;
    vec2 id = vec2(col, floor(x / cl));
    vec2 hh = h22(id + 0.5);
    if (hh.x > dens) return vec4(0.0);
    vec2 l = vec2(fract(x / cl) * cl, fract(q.y / cw) * cw);
    float e = 1.0 + sk * 3.5;                                  // swept into streaks at speed
    // radius (m), kept inside the cell where the frame squeezes it
    float s = min(cw * (0.07 + 0.07 * hh.y) * big, min(0.42 * cw * m.y, 0.38 * cl * m.x / e));
    vec2 c = vec2(cl * (0.6 + 0.2 * (hh.y - 0.5)), cw * 0.5);
    c.y += cw * 0.25 * (hh.x / max(dens, 1e-3) - 0.5) * (1.0 - 2.0 * s / (cw * m.y));
    c.y += (abs(fract(hh.y * 13.7 + x * 3.0) - 0.5) - 0.25) * s * 0.6 * (1.0 - sk);   // slow drops wander
    vec2 d = (l - c) * m / vec2(s * e, s);
    float r = length(d);
    float body = 1.0 - smoothstep(1.0 - clamp(pxm / s, 0.08, 1.0), 1.0, r);
    float rim = body * smoothstep(0.6, 1.0, r);
    float spot = body * (1.0 - smoothstep(0.0, 0.38, length(d - vec2(0.35, -0.3))));
    rim = max(rim, body * smoothstep(-0.3, 1.0, d.y) * 0.3);   // lens: the dark half shows the ground
    float behind = (c.x - l.x) * m.x;
    float tr = step(0.0, behind) * (1.0 - smoothstep(0.0, cl * m.x * 0.55, behind)) * (1.0 - smoothstep(0.2, 0.42, abs(d.y))) * (0.4 + 0.6 * sk);
    return vec4(body, rim, spot, tr);
  }

  // beads sitting on the glass (glass-fixed), blinking in as fresh rain lands and blown off again
  vec3 beads(vec2 p, float cs, float t, float dens, vec2 m, float pxm) {
    vec2 id = floor(p / cs);
    vec2 hh = h22(id);
    float life = fract(t * (0.07 + 0.1 * hh.x) * (1.0 + 3.0 * uSpeedK) + hh.y);
    float vis = step(hh.x, dens) * smoothstep(0.0, 0.03, life) * (1.0 - smoothstep(0.5, 0.65, life));
    if (vis <= 0.0) return vec3(0.0);
    float s = min(cs * (0.1 + 0.16 * hh.y) * (1.0 - 0.35 * uSpeedK), 0.3 * cs * min(m.x, m.y));
    vec2 c = cs * (0.35 + 0.3 * fract(hh.yx * 7.31 + 0.17));
    vec2 d = (fract(p / cs) * cs - c) * m / s;
    float r = length(d);
    float body = (1.0 - smoothstep(1.0 - clamp(pxm / s, 0.08, 1.0), 1.0, r)) * vis;
    float rim = max(body * smoothstep(0.55, 1.0, r), body * smoothstep(-0.3, 1.0, d.y) * 0.3);
    return vec3(body, rim, body * (1.0 - smoothstep(0.0, 0.4, length(d - vec2(0.3, -0.3)))));
  }

  // metres per unit of a surface parameter (u, v), from screen derivatives
  vec2 metric(vec2 dqx, vec2 dqy, vec3 dPx, vec3 dPy) {
    float det = dqx.x * dqy.y - dqy.x * dqx.y;
    if (abs(det) < 1e-12) return vec2(1.0);
    vec3 Pu = (dPx * dqy.y - dPy * dqx.y) / det;
    vec3 Pv = (dPy * dqx.x - dPx * dqy.x) / det;
    return vec2(length(Pu), length(Pv));
  }

  // short scratches (glass-fixed); only those lying across the radial line from the sun glint.
  // toScr maps a surface direction to the screen, rs: unit screen direction away from the sun
  float scratches(vec2 p, float cs, mat2 toScr, vec2 rs, float pxm) {
    vec2 b = floor(p / cs - 0.5);
    float acc = 0.0;
    float w = max(pxm * 0.9, cs * 0.02);        // at least a pixel wide (a glint is brighter than its width)
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec2 id = b + vec2(float(i), float(j));
      vec2 hh = h22(id * 1.37 + 11.0);
      float ang = hh.x * 6.2832;
      vec2 t = vec2(cos(ang), sin(ang));
      vec2 c = (id + 0.5 + (h22(id + 3.1) - 0.5) * 0.4) * cs;
      vec2 dp = p - c;
      float along = abs(dot(dp, t)), across = abs(dot(dp, vec2(-t.y, t.x)));
      float len = cs * (0.25 + 0.2 * hh.y);
      float line = (1.0 - smoothstep(0.0, w, across)) * (1.0 - smoothstep(len * 0.6, len, along));
      vec2 ts = toScr * t;
      float tl = length(ts);
      float facing = tl > 1e-20 ? pow(clamp(1.0 - abs(dot(ts / tl, rs)), 0.0, 1.0), 3.0) : 0.0;
      acc += line * facing * (0.35 + 0.65 * h12(id + 5.5));
    }
    return acc;
  }

  // glass-fixed surface coordinates (u0, v0), metres; only worked out where an effect needs them
  vec2 glassUV(vec3 rel, vec3 n) {
    if (uShape < 0.5) {            // canopy: about the fore-aft axis
      float ax = dot(rel, uAxis);
      vec3 rp = rel - uAxis * ax;
      return vec2(ax + length(rp) - uR, azim(rp, uAxis, uUp) * uR);   // u0 ~ arc length: also climbs the windscreen
    } else if (uShape < 1.5) {     // dome: arc from the front pole
      return vec2(uR * facos(clamp(-dot(n, uAxis), -1.0, 1.0)), azim(n, uAxis, uUp) * uR * 0.8);
    }
    return rel.xy;
  }

  void main() {
    vec3 rel = vP - uC;
    vec3 n = normalize(rel);
    vec3 dPx = dFdx(vP), dPy = dFdy(vP);
    float pxm = max(length(dPx), length(dPy));
    vec2 ndc = vClip.xy / vClip.w;

    vec3 col = vec3(0.0);
    float a = 0.0;

    // perspex haze and dust (forward scattering toward the sun)
    vec3 vd = normalize(vW - cameraPosition);
    float gk = smoothstep(0.866, 0.9986, dot(vd, uSun));      // sun within ~30 deg of the view ray
    a += uDust * 0.02;                                         // faint perspex haze
    col += uSky * uDust * 0.006;
    if (uGlint > 0.0) {            // uniform branch: derivatives are fine here
     vec2 uv0 = glassUV(rel, n);
     vec2 duvx = dFdx(uv0), duvy = dFdy(uv0);
     float px0 = max(abs(duvx.x) + abs(duvy.x), abs(duvx.y) + abs(duvy.y));
     if (gk > 0.0) {
      // dust specks only show against the sun (forward scattering): textured only here
      vec2 dp = vec2(dot(vP, vec3(0.8, 0.1, 0.6)), dot(vP, vec3(-0.3, 0.9, 0.3)));   // isotropic-ish
      float dust = vnoise(dp * 70.0) * (0.4 + 0.6 * vnoise(dp * 11.0 + 4.3));
      vec2 rs = (ndc - uSunNdc) * vec2(uAspect, 1.0);
      rs /= max(length(rs), 1e-4);
      // inverse of the pixel -> surface Jacobian: surface directions as seen on screen
      // (only the direction of a mapped vector is used, and |dot| ignores its sign, so the adjugate
      // is enough: dividing by a near-zero determinant overflowed to Inf -> NaN -> black dashes)
      mat2 toScr = mat2(duvy.y, -duvx.y, -duvy.x, duvx.x);
      float sc = scratches(uv0, 0.012, toScr, rs, px0) + 0.7 * scratches(uv0 + 0.37, 0.0055, toScr, rs, px0);
      float g2 = gk * gk;
      // scratches: a faint sparkle, bright only right beside the sun. At (2 + 10 g2) the field
      // read as snow across a quarter of the top-turret view (where fighters attack out of the sun)
      col += uSunCol * uGlint * (sc * (0.08 + 1.2 * g2 * g2) * gk + uDust * dust * 0.8 * g2 * gk + 0.06 * g2 * g2);
     }
    }

    // the guns' muzzle flashes light up the dust and scuffs on the perspex (strongest at night)
    float fz = uFlash.r + uFlash.g + uFlash.b;
    if (fz > 0.001) {
      vec2 fp = vec2(dot(vP, vec3(0.8, 0.1, 0.6)), dot(vP, vec3(-0.3, 0.9, 0.3)));
      float fd = vnoise(fp * 70.0) * (0.4 + 0.6 * vnoise(fp * 11.0 + 4.3));
      col += uFlash * (0.035 + uDust * fd * 0.55);
      a += min(fz, 1.0) * 0.015;
    }

    // rain (uniform branch: derivatives inside stay valid)
    if (uRain > 0.0) {
      // flow-aligned coordinates (u downstream, v across), metres
      float u, v, gs = 0.0, sinT = 1.0;
      vec2 mq = vec2(1.0);   // metres per unit of (u, v): analytic for the dome and panes
      if (uShape < 0.5) {          // the air runs along the canopy axis
        vec2 cuv = glassUV(rel, n);
        u = cuv.x; v = cuv.y;
        gs = sin(v / uR);
      } else if (uShape < 1.5) {   // dome: away from the stagnation point
        float ct = clamp(-dot(n, uFlow), -1.0, 1.0);
        sinT = sqrt(1.0 - ct * ct);
        u = uR * facos(ct);
        float sy = dot(n, cross(uFlow, uFlowUp)), sx = dot(n, uFlowUp);
        v = fatan2(sy, sx) * uR * 2.0;       // meridian columns: narrow enough for drops near the pole
        gs = sy / max(length(vec2(sx, sy)), 1e-4);   // sin(azimuth), no trig
        mq = vec2(1.0, max(0.5 * sinT, 0.02));
      } else {                     // flat pane: radial flow away from a stagnation point uFlow.xy
        vec2 d = rel.xy - uFlow.xy;
        float sl = length(uFlow.xy);
        vec2 ref = sl > 1e-3 ? -uFlow.xy / sl : vec2(0.0, -1.0);
        vec2 dn = d / max(length(d), 1e-4);
        u = length(d) - sl;
        v = fatan2(ref.x * dn.y - ref.y * dn.x, dot(ref, dn)) * max(sl, 0.12);
        mq = vec2(1.0, max(length(d) / max(sl, 0.12), 0.02));
      }
      float slope = (1.0 - uSpeedK) * 0.9 * gs;
      vec2 q = vec2(u, v - u * slope);
      if (uShape < 0.5) mq = metric(dFdx(q), dFdy(q), dPx, dPy);   // the canopy's frame is irregular
      // glass facing the airflow (the windscreen, the front of a dome) takes the rain head-on
      float frontal = uShape < 0.5 ? abs(dot(normalize(cross(dPx, dPy)), uFlow)) : uShape < 1.5 ? max(-dot(n, uFlow), 0.0) : 0.0;
      float dens = uRain * (0.35 + 0.65 * smoothstep(0.08, 0.5, sinT)) * (1.0 + 0.8 * frontal);
      float big = 1.0 + 0.9 * frontal;
      vec4 d1 = runDrops(q, 0.016, uTime, dens * 0.6, mq, pxm, big);
      // a streaming sheet of water over the front panels
      float sheet = frontal > 0.05 && uShape < 0.5 ? vnoise(vec2(q.x * 6.0 - uTime * uFlowV * 2.0, q.y * 55.0)) : 0.0;
      a += uRain * frontal * 0.12 * sheet;
      col += uSky * uRain * frontal * 0.05 * sheet;
      vec3 bd = beads(q + 0.37, 0.009, uTime, uRain * 0.55 * (1.0 - 0.6 * uSpeedK), mq, pxm);   // blown off at speed
      float body = max(d1.x, bd.x);
      float rim = max(d1.y, bd.y);
      float spot = max(d1.z, bd.z);
      float trail = d1.w * (1.0 - body);
      a += rim * 0.36 + body * 0.08 + trail * 0.08 + uRain * 0.03;
      col += uSky * (body * (1.0 - rim) * 0.12 + trail * 0.02) + (uSky * 0.9 + uSunCol * uGlint * 0.5) * spot * 0.6;
      col += uFlash * (spot * 0.9 + rim * 0.25 + body * 0.08);   // every drop catches the muzzle flash
    }

    // Cloud droplets first make a fine, patchy film, then coalesce into beads.
    // Surface coordinates keep it on the actual perspex during head movement.
    if (uCondensation > 0.001) {
      vec2 cuv = glassUV(rel, n);
      vec2 cm = metric(dFdx(cuv), dFdy(cuv), dPx, dPy);
      float film = smoothstep(0.25, 0.75, vnoise(cuv * 19.0 + vec2(uTime * 0.035, 0.0)));
      vec3 mist = beads(cuv, 0.0035, uTime * 0.35, uCondensation, cm, pxm);
      a += uCondensation * film * 0.09 + mist.y * 0.22;
      col += uSky * uCondensation * film * 0.035 + (uSky + uSunCol * gk) * mist.z * 0.24;
    }

    // oil film and spatter
    if (uOil + uSpat > 0.02) {
     vec2 ouv = glassUV(rel, n);
     float u0 = ouv.x, v0 = ouv.y;
     float m = 1.0 - smoothstep(uOilMask.x, uOilMask.y, u0);
     if (m > 0.0) {
      float n1 = vnoise(vec2(u0 * 4.0, v0 * 22.0));
      float n2 = vnoise(vec2(u0 * 1.5 + 3.1, v0 * 7.0));
      float film = smoothstep(0.25, 0.8, (n1 * 0.55 + n2 * 0.65) * m + uOil * 0.5 - 0.3) * min(1.0, uOil * 1.6) * m;
      // spatter: flecks thrown back from the engine, drawn out along the airflow
      vec2 sp = vec2(u0 / 0.03, v0 / 0.011);
      vec2 sid = floor(sp);
      vec2 sh = h22(sid + 31.0);
      vec2 sj = h22(sid + 7.7) - 0.5;
      vec2 sq = (fract(sp) - 0.5 - sj * 0.5) * vec2(0.45, 1.0);
      float sz = 0.06 + 0.2 * sh.y * sh.y;
      float sd = length(sq) / sz;
      float tail = step(0.0, sq.x) * (1.0 - smoothstep(0.0, sz * 1.5, sq.x)) * (1.0 - smoothstep(0.15, 0.35, abs(sq.y) / sz));
      float spat = step(sh.x, uSpat * m * 0.6) * max(1.0 - smoothstep(0.7, 1.0, sd), tail * 0.6);
      float oil = max(film * 0.8, spat);
      a += oil * 0.45;
      col += oil * (vec3(0.13, 0.08, 0.025) * (uSky * 1.6 + 0.08) + uSunCol * uGlint * gk * 0.2);
     }
    }

    // frost creeping in from the frame
    if (uFrost > 0.001) {
      float edge = 10.0;
      if (uShape > 0.5 && uShape < 1.5) { float e = clamp(dot(n, uEdge.xyz), 0.0, 1.0); edge = uR * e * (1.0 + 0.1667 * e * e); }   // ~asin
      else if (uShape > 1.5) edge = uEdge.y > 0.0 ? min(uEdge.x - abs(rel.x), uEdge.y - abs(rel.y)) : uEdge.x - length(rel.xy);
      if (uShape < 0.5) edge = max(0.0, vP.y - uEdge.x); // lower canopy frame
      float reach = mix(0.03, 0.3, uFrost);
      if (edge < reach + 0.05) {   // only near the frame (texture fetches skipped elsewhere)
        vec2 fuv = glassUV(rel, n);
        float lod = log2(max(pxm * 2.6 * 256.0, 1.0));   // texels per pixel (no derivatives in this branch)
        float f = textureLod(uFrostTex, fuv * 2.6, lod).r;
        float g = textureLod(uFrostTex, fuv * 7.0 + 0.37, lod + 1.43).r;
        float fr = (1.0 - smoothstep(reach * 0.3, reach, edge - (f - 0.5) * 0.08)) * (0.3 + 0.7 * f) * (0.6 + 0.4 * g) * uFrost;
        fr += uFrost * 0.06 * g * (1.0 - smoothstep(reach, reach + 0.05, edge));
        a += fr * 0.62;
        col += fr * 0.62 * vec3(0.82, 0.88, 0.94) * (uSky * 1.7 + uSunCol * uGlint * (0.1 + 0.5 * gk));
      }
    }

    // bullet cracks: radial cracks, broken rings between them, a crushed white core
    for (int i = 0; i < ${MAX_CRACKS}; i++) {
      if (float(i) >= uCrackN) break;
      vec3 dP = vP - uCrackP[i].xyz;
      vec2 c = vec2(dot(dP, uCrackA[i].xyz), dot(dP, uCrackB[i].xyz));
      float size = uCrackP[i].w, seed = uCrackA[i].w;
      float r = length(c);
      if (r > size) continue;
      float ang = atan(c.y, c.x) / 6.2832 + 0.5;
      float heavy = step(0.1, size);
      float N = mix(6.0, 11.0, heavy);
      float fa = ang * N;
      float sec = floor(fa);
      vec2 sh = h22(vec2(sec, seed));
      float wig = (vnoise(vec2(sec * 7.1 + seed, r / size * 4.0)) - 0.5) * 0.22;   // kinked, not wavy
      float co = 0.3 + 0.4 * sh.x + wig;
      float lw = max(pxm * 1.1, 0.0007);
      float dl = abs(fract(fa) - co) * (6.2832 / N) * r;
      float len = size * (0.45 + 0.55 * sh.y);
      float radial = (1.0 - smoothstep(0.0, lw, dl)) * (1.0 - smoothstep(len * 0.7, len, r));
      float ring = 0.0;
      for (int k = 0; k < 3; k++) {
        float rk = size * (0.14 + 0.17 * float(k)) * (1.0 + 0.12 * (vnoise(vec2(fa * 1.3, seed + float(k) * 5.0)) - 0.5));
        float on = step(0.3, h12(vec2(sec + float(k) * 13.0, seed)));
        ring += heavy * on * (1.0 - smoothstep(0.0, lw, abs(r - rk))) * step(rk, len);
      }
      float core = (1.0 - smoothstep(size * 0.06, size * 0.13, r)) * (0.6 + 0.4 * vnoise(c * 900.0));   // crushed, frosted
      float hole = 1.0 - smoothstep(size * 0.028, size * 0.036, r);
      float fade = 1.0 - smoothstep(size * 0.6, size, r);
      float lines = min(1.0, radial + ring) * (0.55 + 0.45 * fade);
      // fractured faces: greyer than the sky behind, lighter than the ground, glinting toward the sun
      a += lines * 0.62 + core * 0.6;
      col += lines * (uSky * 0.45 + uSunCol * uGlint * (0.03 + 0.8 * gk) + uFlash * 0.6) + core * (uSky * 0.9 + uSunCol * uGlint * 0.1 + uFlash * 0.4);
      col *= 1.0 - hole; a *= 1.0 - hole * 0.85;   // the hole itself is open
    }

    // keep the gunsight clear: everything thins out around the aim point (most in ADS)
    float ad = length((ndc - uAim.xy) * vec2(uAspect, 1.0));
    float keep = 1.0 - uAimK * (1.0 - smoothstep(uAim.z * 0.5, uAim.z * 1.4, ad));
    a = clamp(a, 0.0, 0.85) * keep;
    gl_FragColor = vec4(col * keep, a);
  }`;

// Uniforms shared by every pane (one frame's environment)
const env = {
  uTime: { value: 0 },
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uSunNdc: { value: new THREE.Vector2(9, 9) },
  uSunCol: { value: new THREE.Color() },
  uSky: { value: new THREE.Color() },
  uGlint: { value: 0 },
  uFlash: { value: new THREE.Color(0, 0, 0) },   // muzzle-flash light on the glass (weatherNow.muzzle)
  uAspect: { value: 1 },
  uAim: { value: new THREE.Vector4(0, 0, 0.2, 0) },
  uAimK: { value: 0.6 },
  uFrostTex: { value: null as THREE.Texture | null },
};

let baseMat: THREE.ShaderMaterial | null = null;
function glassMaterial(): THREE.ShaderMaterial {
  if (!baseMat) {
    const cracks = () => Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4());
    baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uFrame: { value: new THREE.Matrix4() },
        uCondensation: { value: 0 }, uShape: { value: 0 }, uR: { value: 0.4 }, uRain: { value: 0 }, uSpeedK: { value: 0 }, uFlowV: { value: 0 },
        uDust: { value: 0.6 }, uOil: { value: 0 }, uSpat: { value: 0 }, uFrost: { value: 0 }, uCrackN: { value: 0 },
        uC: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, 0, -1) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
        uFlow: { value: new THREE.Vector3(0, 0, -1) }, uFlowUp: { value: new THREE.Vector3(0, 1, 0) },
        uEdge: { value: new THREE.Vector4() }, uOilMask: { value: new THREE.Vector2(9, 10) },
        uCrackP: { value: cracks() }, uCrackA: { value: cracks() }, uCrackB: { value: cracks() },
        ...env,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.DoubleSide,   // one program for every pane (side is part of the program key)
    });
    env.uFrostTex.value = frostTexture();
  }
  return baseMat;
}

function paneMaterial(): THREE.ShaderMaterial {
  const m = glassMaterial().clone();
  // the clone copies uniform values: point the environment back at the shared objects
  for (const k of Object.keys(env) as (keyof typeof env)[]) m.uniforms[k] = env[k];
  return m;
}

// World.prewarm hook: render the glass program once before play
export function warmGlassFx(scene: THREE.Scene, at: THREE.Vector3): () => void {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), glassMaterial());
  m.position.copy(at);
  m.frustumCulled = false;
  scene.add(m);
  return () => { scene.remove(m); m.geometry.dispose(); };
}

export interface PaneOpts {
  shape: number;
  C?: THREE.Vector3;
  R?: number;
  axis?: THREE.Vector3;     // glass-fixed axis (canopy: aft; dome: aft of the turret)
  up?: THREE.Vector3;
  edge?: THREE.Vector4;     // frost edge: dome rim axis (xyz) / pane half extents (x, y) or circle radius (x, y = -1)
  oilMask?: THREE.Vector2;  // oil fades out between these glass-fixed u0 distances
  dust?: number;
  windowR?: number;         // flat panes: window size for the stagnation point
  renderOrder?: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _hp = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _hn = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _hits: THREE.Intersection[] = [];
const AFT = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);

// One sheet of glass with its own oil, frost and cracks
export class GlassPane {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  oil = 0;
  spat = 0;
  wet = 0;
  condensation = 0;
  frost = 0;
  private cracks = 0;
  private frame: THREE.Object3D | null = null;   // the glass frame vP is expressed in (null: mesh local)
  private shape: number;
  private windowR: number;

  constructor(geo: THREE.BufferGeometry, o: PaneOpts) {
    this.mat = paneMaterial();
    const U = this.mat.uniforms;
    this.shape = o.shape;
    this.windowR = o.windowR ?? 0.4;
    U.uShape.value = o.shape;
    if (o.C) U.uC.value.copy(o.C);
    U.uR.value = o.R ?? 0.4;
    if (o.axis) U.uAxis.value.copy(o.axis);
    if (o.up) U.uUp.value.copy(o.up);
    if (o.edge) U.uEdge.value.copy(o.edge);
    if (o.oilMask) U.uOilMask.value.copy(o.oilMask);
    U.uDust.value = o.dust ?? 0.6;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'glassFx';
    this.mesh.renderOrder = o.renderOrder ?? 5;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;   // wraps the eye
  }

  // vP is expressed in this object's frame (static relative to the mesh)
  setFrame(frame: THREE.Object3D) {
    this.frame = frame;
    frame.updateWorldMatrix(true, false);
    this.mesh.updateWorldMatrix(true, false);
    this.mat.uniforms.uFrame.value.copy(frame.matrixWorld).invert().multiply(this.mesh.matrixWorld);
  }

  reset() {
    this.oil = this.spat = this.wet = this.frost = this.condensation = 0;
    this.cracks = 0;
    this.mat.uniforms.uCrackN.value = 0;
  }

  private toFrame(world: THREE.Vector3) { return (this.frame ?? this.mesh).worldToLocal(world); }
  private frameQuatInv(out: THREE.Quaternion) { return (this.frame ?? this.mesh).getWorldQuaternion(out).invert(); }

  // Air direction (world) and airspeed -> flow uniforms in the glass frame
  setFlow(airWorld: THREE.Vector3, upWorld: THREE.Vector3, speed: number, exposure = 1) {
    const U = this.mat.uniforms;
    this.frameQuatInv(_q);
    const f = _v.copy(airWorld).applyQuaternion(_q).normalize();
    let speedEff = speed;
    if (this.shape === SHAPE_PLANE) {
      // the window lies in the frame's xy plane, looking out along +z
      const tk = Math.hypot(f.x, f.y);
      const far = this.windowR * THREE.MathUtils.clamp((tk / Math.max(0.05, 1 - tk)) * 1.5, 0.02, 25);
      U.uFlow.value.set(tk > 1e-3 ? (-f.x / tk) * far : 0, tk > 1e-3 ? (-f.y / tk) * far : 0, 0);
      speedEff = speed * (0.15 + 0.85 * tk);
      exposure *= 0.35 + 0.65 * (1 - Math.max(0, f.z));   // sheltered when the air leaves the window
    } else {
      U.uFlow.value.copy(f);
      const up = _v2.copy(upWorld).applyQuaternion(_q);
      up.addScaledVector(f, -up.dot(f));
      if (up.lengthSq() < 1e-4) up.set(1, 0, 0).addScaledVector(f, -f.x);
      U.uFlowUp.value.copy(up.normalize());
    }
    const sk = THREE.MathUtils.smoothstep(speedEff, 15, 150);
    U.uSpeedK.value = sk;
    U.uFlowV.value = 0.06 + 1.5 * sk;
    return exposure;
  }

  // Ray from the eye toward a hit point: crack the glass where it crosses
  crackFromRay(eye: THREE.Vector3, toward: THREE.Vector3, size: number): boolean {
    if (this.cracks >= MAX_CRACKS || !this.mesh.parent) return false;
    _ray.set(eye, _v.copy(toward).sub(eye).normalize());
    _ray.far = 3;
    return this.crackOnRay(size);
  }

  crackFromSegment(start: THREE.Vector3, end: THREE.Vector3, size: number): boolean {
    if (this.cracks >= MAX_CRACKS || !this.mesh.parent) return false;
    _v.copy(end).sub(start);
    _ray.far = _v.length();
    if (_ray.far < 1e-6) return false;
    _ray.set(start, _v.normalize());
    return this.crackOnRay(size);
  }

  private crackOnRay(size: number): boolean {
    _hits.length = 0;
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.raycast(_ray, _hits);
    if (!_hits.length) return false;
    let best = _hits[0];
    for (const h of _hits) if (h.distance < best.distance) best = h;
    // the face normal, mesh local -> glass frame
    const fn = best.face ? _hn.copy(best.face.normal).transformDirection(this.mat.uniforms.uFrame.value) : null;
    this.addCrack(this.toFrame(_hp.copy(best.point)), size, fn);
    return true;
  }

  // p: glass frame point on the surface; normal: surface normal there (glass frame), if known
  addCrack(p: THREE.Vector3, size: number, normal: THREE.Vector3 | null = null) {
    if (this.cracks >= MAX_CRACKS) return;
    const U = this.mat.uniforms;
    const rel = _v2.copy(p).sub(U.uC.value);
    if (normal) _n.copy(normal).normalize();
    else if (this.shape === SHAPE_CANOPY) _n.copy(rel).addScaledVector(U.uAxis.value, -rel.dot(U.uAxis.value)).normalize();
    else if (this.shape === SHAPE_SPHERE) _n.copy(rel).normalize();
    else _n.set(0, 0, 1);
    const ref = Math.abs(_n.dot(UP)) < 0.9 ? UP : AFT;
    const A = _v.crossVectors(ref, _n).normalize();
    const i = this.cracks++;
    U.uCrackP.value[i].set(p.x, p.y, p.z, size);
    U.uCrackA.value[i].set(A.x, A.y, A.z, Math.random() * 100);
    const B = A.cross(_n);   // in place: B = A x n (A no longer needed)
    U.uCrackB.value[i].set(B.x, B.y, B.z, 0);
    U.uCrackN.value = this.cracks;
  }

  get crackCount() { return this.cracks; }

  // per-frame pane state
  apply(rain: number) {
    const U = this.mat.uniforms;
    U.uRain.value = weatherNow.effects ? rain : 0;
    U.uCondensation.value = weatherNow.effects && rain > 0 ? this.condensation : 0;
    U.uOil.value = this.oil;
    U.uSpat.value = this.spat;
    U.uFrost.value = weatherNow.effects ? this.frost : 0;
  }
}

// ---------------- shared weather / environment ----------------

/** Fine cloud water builds quickly and evaporates after exit; frame-rate independent. */
export function cloudCondensation(current: number, inside: number, dt: number): number {
  const target = Math.max(0, Math.min(1, inside));
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / (target > current ? 1.2 : 12)));
}

// All panes share the blended condition; the quality toggle affects cosmetics only.
export function rainTarget(time: number): number {
  void time;
  return weatherNow.effects ? Math.max(weatherNow.rain, weatherNow.cloudInside * .65) : 0;
}
const SUN_VIS: Record<string, number> = { clear: 1, dusk: 0.9, overcast: 0.3, storm: 0.08, night: 0.35 };
const sunVis = () => {
  const w = weatherNow;
  return w.k <= 0 ? (SUN_VIS[w.mood] ?? 1) : (SUN_VIS[w.from] ?? 1) * (1 - w.k) + (SUN_VIS[w.to] ?? 1) * w.k;
};

const _sp = new THREE.Vector3();
const _cd = new THREE.Vector3();
// aimNdc: gunsight centre; aimR: its radius (NDC y units); aimK: how much is cleared there
function updateEnv(engine: Engine, time: number, aimX: number, aimY: number, aimR: number, aimK: number) {
  const cam = engine.camera;
  env.uTime.value = time % 1000;
  env.uSun.value.copy(Atmos.sunDir);
  env.uSunCol.value.copy(Atmos.sunColor).multiplyScalar(Atmos.sunIntensity * 0.5);
  env.uSky.value.copy(Atmos.horizon).lerp(Atmos.zenith, 0.3).multiplyScalar(0.55 + 0.25 * Atmos.cloudAmbient);
  const sunUp = THREE.MathUtils.smoothstep(Atmos.sunElevationDeg, -3, 3);
  cam.getWorldDirection(_cd);
  const front = _cd.dot(Atmos.sunDir) > 0.3;
  if (front) {
    _sp.copy(cam.position).addScaledVector(Atmos.sunDir, 1000).project(cam);
    env.uSunNdc.value.set(_sp.x, _sp.y);
  }
  env.uGlint.value = front ? sunVis() * sunUp * access.flash : 0;
  // muzzle flash on the glass: warm, mostly a night thing (by day the sun swamps it)
  const fl = weatherNow.muzzle * (0.12 + 0.88 * weatherNow.dark) * access.flash;
  env.uFlash.value.setRGB(1.0 * fl, 0.62 * fl, 0.3 * fl);
  env.uAspect.value = cam.aspect;
  env.uAim.value.set(aimX, aimY, aimR, 0);
  env.uAimK.value = aimK;
}

// Hits on the player's aircraft: chained once into the ballistics hook (never unhooked, gated by
// the owner), so PilotFX's attach/detach chaining keeps working around it
function hookHits(world: World, fn: (e: HitEvent) => void) {
  const prev = world.ballistics.onHit;
  world.ballistics.onHit = (e) => { prev?.(e); fn(e); };
}

// ---------------- P-51 canopy ----------------

const EYE = new THREE.Vector3(0, 0.775, -1.174);   // pilot's eye, model frame
const shells = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
// The canopy is modelled with an outer and an inner shell a few mm apart: keep only the triangles
// facing the eye (one layer to shade, half the overdraw). Shares the source attributes; cached.
function innerShell(src: THREE.BufferGeometry, toModel: THREE.Matrix4, eye: THREE.Vector3): THREE.BufferGeometry {
  let geo = shells.get(src);
  if (geo) return geo;
  const pos = src.getAttribute('position');
  const idx = src.index;
  const n = idx ? idx.count : pos.count;
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(toModel);
    b.fromBufferAttribute(pos, ib).applyMatrix4(toModel).sub(a);
    c.fromBufferAttribute(pos, ic).applyMatrix4(toModel).sub(a);
    if (b.cross(c).dot(e.copy(eye).sub(a)) > 0) keep.push(ia, ib, ic);
  }
  geo = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
  geo.setIndex(keep);
  geo.boundingSphere = src.boundingSphere?.clone() ?? null;
  shells.set(src, geo);
  return geo;
}

export class PilotGlass {
  enabled = true;
  private pane: GlassPane | null = null;
  private plane: Fighter | null = null;
  private engineZone: HitZone | null = null;
  private ads = 0;
  private lastCrack = -99;

  constructor(private engine: Engine, private world: World) {
    hookHits(world, (e) => this.onHit(e));
  }

  attach(plane: Fighter) {
    this.detach();
    this.plane = plane;
    this.engineZone = plane.zone('engine') ?? null;
    this.lastCrack = -99;   // world.time restarts every mission
    let glass: THREE.Mesh | null = null;
    plane.model.traverse((o) => { if (!glass && (o as THREE.Mesh).isMesh && /glass/i.test(o.name + (o.parent?.name ?? ''))) glass = o as THREE.Mesh; });
    const g = glass as THREE.Mesh | null;
    if (!g || !g.parent) return;
    plane.root.updateWorldMatrix(true, true);
    // the overlay uses the canopy's own geometry (its inner shell), so rain and cracks sit exactly on the glass
    const toModel = new THREE.Matrix4().copy(plane.model.matrixWorld).invert().multiply(g.matrixWorld);
    const pane = new GlassPane(innerShell(g.geometry, toModel, EYE), {
      shape: SHAPE_CANOPY, C: new THREE.Vector3(0, 0.0, 0), R: 0.85, axis: AFT, up: UP,
      oilMask: new THREE.Vector2(0.45, 0.95), dust: 0.55, renderOrder: 5,
    });
    g.geometry.computeBoundingBox();
    const glassBounds = g.geometry.boundingBox!.clone().applyMatrix4(toModel);
    pane.mat.uniforms.uEdge.value.x = glassBounds.min.y;
    // parented to the root, not the model: wreck pieces clone the model and must not take it along
    _m.copy(plane.root.matrixWorld).invert().multiply(g.matrixWorld);
    _m.decompose(pane.mesh.position, pane.mesh.quaternion, pane.mesh.scale);
    plane.root.add(pane.mesh);
    pane.setFrame(plane.model);
    pane.reset();
    this.pane = pane;
  }

  detach() {
    if (this.pane) { this.pane.mesh.removeFromParent(); this.pane.mat.dispose(); }
    this.pane = null;
    this.plane = null;
    this.engineZone = null;
  }

  private onHit(e: HitEvent) {
    const p = this.plane, pane = this.pane;
    if (!p || !pane || e.target !== p) return;
    if (e.zone.name === 'engine') {
      // oil thrown back over the windscreen
      pane.spat = Math.min(0.7, pane.spat + (e.cannon ? 0.14 : 0.04));
      pane.oil = Math.min(0.85, pane.oil + 0.015);
    } else if (e.zone.name === 'cockpit') {
      const t = this.world.time;
      if (t - this.lastCrack < 1.2 || Math.random() > (e.cannon ? 0.9 : 0.35)) return;
      // where the round crossed the canopy on its way in toward the pilot (his eye, not the camera:
      // the chase view may be on)
      const eye = p.localToWorld(_eye.copy(EYE));
      const from = _v2.copy(e.point).addScaledVector(_v.copy(e.bulletVel).sub(p.vel).normalize(), -2.5);
      const size = e.cannon ? 0.13 : 0.06 + Math.random() * 0.03;
      let ok = pane.crackFromRay(eye, from, size);
      if (!ok) {
        // came in low (through the fuselage side): put the crack where that line meets the glass
        // further up, as the round or its splinters would have
        p.worldToLocal(from, from).sub(EYE);
        from.y = Math.max(from.y, 0.35 * Math.hypot(from.x, from.z));
        ok = pane.crackFromRay(eye, p.localToWorld(from.add(EYE), from), size);
      }
      if (ok) this.lastCrack = t;
    }
  }

  // aimX/Y: K-14 reticle (NDC); zoom: RMB held
  update(dt: number, cockpit: boolean, aimX: number, aimY: number, zoom: boolean) {
    const pane = this.pane, p = this.plane;
    if (!pane || !p) return;
    const on = this.enabled && cockpit && this.engine.quality !== 'low';
    pane.mesh.visible = on;
    // state keeps evolving while hidden (oil, wetness)
    const eng = this.engineZone;
    const dmg = eng ? 1 - Math.max(0, eng.hp) / eng.maxHp : 0;
    if (p.alive) pane.oil = Math.min(dmg > 0.3 ? 0.85 : 0.18, pane.oil + dt * (0.0003 + 0.004 * Math.max(0, dmg - 0.3)));
    if (pane.oil > 0.85) pane.oil = 0.85;
    pane.frost += (weatherNow.snow * .7 - pane.frost) * Math.min(1, dt / 8);
    const target = rainTarget(this.world.time);
    pane.wet += (target - pane.wet) * Math.min(1, dt / (target > pane.wet ? 5 : 20));
    pane.condensation = cloudCondensation(pane.condensation, weatherNow.cloudInside, dt);
    if (!on) return;
    this.ads += ((zoom ? 1 : 0) - this.ads) * Math.min(1, dt * 9);
    updateEnv(this.engine, this.world.time, aimX, aimY, 0.16 + 0.04 * this.ads, 0.6 + 0.35 * this.ads);
    pane.setFlow(_v.copy(p.vel).negate().normalize(), p.up(_n), p.fm.speed);
    pane.apply(pane.wet);
  }

  get crackCount() { return this.pane?.crackCount ?? 0; }
  /** dev: crack the windscreen along a view ray (NDC) */
  devCrack(x = 0.3, y = 0.1) {
    if (!this.pane) return false;
    const cam = this.engine.camera;
    const t = _v.set(x, y, 0.5).unproject(cam);
    return this.pane.crackFromRay(cam.position, t, 0.08);
  }
  get paneForDev() { return this.pane; }
}

// ---------------- B-17 turret / tail glass ----------------

type GlassStation = 'top' | 'ball' | 'tail';
const OIL_W = [0.4, 1, 1, 0.4];   // engines 1-4: the inboard pair sit right ahead of the top turret

let domeGeo: THREE.SphereGeometry | null = null;
let portGeo: THREE.CircleGeometry | null = null;
let tailGeo: THREE.PlaneGeometry | null = null;

export class GunnerGlass {
  enabled = true;
  private panes: Partial<Record<GlassStation, GlassPane>> = {};
  private bomber: Bomber | null = null;
  private engines: (HitZone | null)[] = [];
  private t = 0;
  private lastCrack = -99;
  private station: StationId | null = null;
  private sprayTick = 0;
  private sprayCooldown = 0;

  constructor(private engine: Engine, private world: World) {
    hookHits(world, (e) => this.onHit(e));
  }

  private pane(id: GlassStation): GlassPane {
    let p = this.panes[id];
    if (p) return p;
    if (id === 'top') {
      // just inside TurretGlass's dome (R 0.68, centre 0.15 below the ring)
      domeGeo ??= new THREE.SphereGeometry(0.672, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      p = new GlassPane(domeGeo, { shape: SHAPE_SPHERE, R: 0.672, axis: AFT, up: UP, edge: new THREE.Vector4(0, 1, 0, 0), oilMask: new THREE.Vector2(0.35, 0.8), dust: 0.8, renderOrder: 39 });
      p.mesh.position.y = -0.15;
    } else if (id === 'ball') {
      // the armoured port ahead of the gunner's face (ring at z 0.55, r 0.42)
      portGeo ??= new THREE.CircleGeometry(0.415, 40);
      p = new GlassPane(portGeo, { shape: SHAPE_PLANE, edge: new THREE.Vector4(0.415, -1, 0, 0), dust: 0.8, windowR: 0.42, renderOrder: 39 });
      p.mesh.position.set(0, 0, 0.545);
    } else {
      // tail window pane (0.64 x 0.5875 at z 0.5), just inside it
      tailGeo ??= new THREE.PlaneGeometry(0.64, 0.5875);
      p = new GlassPane(tailGeo, { shape: SHAPE_PLANE, edge: new THREE.Vector4(0.32, 0.294, 0, 0), dust: 0.8, windowR: 0.3, renderOrder: 3 });
      p.mesh.position.set(0, 0.14875, 0.494);
    }
    this.panes[id] = p;
    return p;
  }

  // groups: the turret / tail interiors (gun frame) the glass belongs to
  attach(bomber: Bomber, groups: Record<GlassStation, THREE.Object3D>) {
    this.bomber = bomber;
    this.engines = [0, 1, 2, 3].map((i) => bomber.zone(`engine${i + 1}`) ?? null);
    this.t = 0;
    this.lastCrack = -99;
    this.sprayTick = this.sprayCooldown = 0;
    for (const id of GLASS_STATIONS) {
      const p = this.pane(id);
      groups[id].add(p.mesh);
      p.setFrame(p.mesh);
      p.reset();
    }
  }

  detach() {
    for (const p of Object.values(this.panes)) p?.mesh.removeFromParent();
    this.bomber = null;
    this.station = null;
  }

  private onHit(e: HitEvent) {
    const b = this.bomber;
    if (!b || e.target !== b) return;
    const name = e.zone.name;
    // a hit that opens an inboard engine's oil lines throws a spatter back over the top turret
    if ((name === 'engine2' || name === 'engine3') && Math.random() < (e.cannon ? 0.6 : 0.15)) {
      const top = this.panes.top;
      if (top) top.spat = Math.min(0.4, top.spat + (e.cannon ? 0.06 : 0.02));
    }
    const st = this.station;
    if (st !== 'top' && st !== 'ball' && st !== 'tail') return;
    const pane = this.panes[st];
    if (!pane) return;
    const local = b.worldToLocal(_v2.copy(e.point), _v2);
    const pivot = st === 'top' ? _v.set(0, 1.5, 1.15) : st === 'ball' ? _v.set(0, -1.45, -4.65) : _v.set(0, 0.3, -15.6);
    if (local.distanceTo(pivot) > 2.2) return;   // a round through this part of the ship
    const t = this.world.time;
    if (t - this.lastCrack < 0.12) return;
    // Use the projectile trajectory, not a ray from the eye to the attacker.
    _n.copy(e.bulletVel).sub(b.vel).normalize();
    if (_n.lengthSq() < 0.1) _n.copy(this.engine.camera.position).sub(e.point).normalize();
    _hp.copy(e.point).addScaledVector(_n, -4);
    _hn.copy(e.point).addScaledVector(_n, 4);
    if (pane.crackFromSegment(_hp, _hn, e.cannon ? 0.14 : 0.065)) this.lastCrack = t;
  }

  // ads: 0..1 eye on the sight; cold: mission cold 0..1
  update(dt: number, station: StationId, ads: number, cold: number) {
    const b = this.bomber;
    if (!b) return;
    this.station = station;
    this.t += dt;
    this.sprayTick += dt;
    this.sprayCooldown = Math.max(0, this.sprayCooldown - dt);
    if (this.sprayTick >= 0.1) {
      const step = this.sprayTick; this.sprayTick = 0;
      const pane = station === 'top' || station === 'ball' || station === 'tail' ? this.panes[station] : null;
      if (pane && this.sprayCooldown === 0) for (const f of this.world.aircraft) {
        if (f.team !== 'axis' || f.remove || f.structureFrac > 0.65) continue;
        _hp.copy(f.pos).sub(this.engine.camera.position);
        _hn.copy(f.vel).sub(b.vel);
        const k = sprayExposure(_hp, _hn, step);
        if (k <= 0) continue;
        pane.spat = Math.min(0.65, pane.spat + 0.35 * k);
        pane.oil = Math.min(0.6, pane.oil + 0.16 * k);
        this.sprayCooldown = 1.5;
        break;
      }
    }
    const target = rainTarget(this.world.time);
    const frost = Math.max(cold * (0.3 + 0.7 * THREE.MathUtils.smoothstep(this.t, 0, 240)), weatherNow.snow * .65);
    // oil from damaged engines streams back over the top turret
    let rate = 0;
    for (let i = 0; i < 4; i++) {
      const z = this.engines[i];
      if (!z) continue;
      const dmg = b.engineDead[i] ? 1 : 1 - Math.max(0, z.hp) / z.maxHp;
      rate += OIL_W[i] * Math.max(0, dmg - 0.3);
    }
    const top = this.panes.top;
    if (top) top.oil = Math.min(0.6, top.oil + dt * rate * 0.004);
    for (const id of GLASS_STATIONS) {
      const p = this.panes[id];
      if (!p) continue;
      p.wet += (target - p.wet) * Math.min(1, dt / (target > p.wet ? 5 : 20));
      p.condensation = cloudCondensation(p.condensation, weatherNow.cloudInside, dt);
      p.frost = frost;
      p.mesh.visible = false;
    }
    if (station !== 'top' && station !== 'ball' && station !== 'tail') return;
    const pane = this.panes[station];
    if (!pane || !this.enabled) return;
    const low = this.engine.quality === 'low';
    if (low && !pane.crackCount && pane.spat < 0.01) return;
    pane.mesh.visible = true;
    updateEnv(this.engine, this.world.time, 0, 0, 0.17 + 0.08 * ads, 0.6 + 0.35 * ads);
    const air = _v.set(0, 0, -1).applyQuaternion(b.quat);
    const exposure = pane.setFlow(air, b.up(_n), b.vel.length());
    pane.apply(low ? 0 : pane.wet * exposure);
    if (low) {
      pane.mat.uniforms.uGlint.value = 0;
      pane.mat.uniforms.uDust.value = 0;
      pane.mat.uniforms.uFrost.value = 0;
    } else pane.mat.uniforms.uDust.value = 0.8;
  }

  paneForDev(id: GlassStation) { return this.panes[id] ?? null; }
  /** dev: crack the current station's glass along a view ray (NDC) */
  devCrack(x = 0.3, y = 0.1) {
    const st = this.station, pane = st === 'top' || st === 'ball' || st === 'tail' ? this.panes[st] : null;
    if (!pane) return false;
    const cam = this.engine.camera;
    return pane.crackFromRay(cam.position, _v.set(x, y, 0.5).unproject(cam), 0.08);
  }
}
