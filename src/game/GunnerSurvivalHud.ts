import { tx } from '../i18n';
import { keyLabel } from '../core/KeyMap';
import type { GunnerSurvival, SurvivalGun } from './GunnerSurvival';
let tunnel: CanvasGradient | null = null, oldW = 0, oldH = 0;
let nextText = 0, lastTime = -1, label = '', icons = '';
// Text refresh follows the DOM HUD cadence; only the blink and tunnel animate per frame.
export function drawSurvival(ctx: CanvasRenderingContext2D, w: number, h: number, life: GunnerSurvival, gun: SurvivalGun, time: number) {
  ctx.save();
  const severity = Math.max(life.hypoxia * .85, life.wound * .5);
  if (severity > .005) {
    if (!tunnel || oldW !== w || oldH !== h) {
      oldW = w; oldH = h;
      tunnel = ctx.createRadialGradient(w / 2, h / 2, h * .16, w / 2, h / 2, w * .6);
      tunnel.addColorStop(0, 'transparent'); tunnel.addColorStop(.5, '#101820'); tunnel.addColorStop(1, '#000');
    }
    ctx.globalAlpha = severity; ctx.fillStyle = tunnel; ctx.fillRect(0, 0, w, h);
  }
  if (time >= nextText || time < lastTime) {
    nextText = time + .08;
    label = life.oxygen ? tx('O₂ · {key} reconnect', { key: keyLabel('KeyO') })
      : gun.jam ? tx('JAM · hold {key} / tap twice', { key: keyLabel('KeyR') })
      : gun.reload > 0 ? tx('Loading ammo can')
      : gun.supply > 0 ? tx('Crew passing ammunition')
      : gun.frost > 0 ? tx('❄ Frozen receiver · fire to warm')
      : life.circuit > 0 ? tx('❄ Suit circuit · crew repairing')
      : life.wound > .05 ? tx('✚ Wounded · dressing pending') : '';
    icons = (life.oxygen ? 'O₂  ' : '') + (gun.jam ? '↻  ' : '') + (life.circuit > 0 || gun.frost > 0 ? '❄  ' : '') + (life.wound > .05 ? '✚' : '');
  }
  lastTime = time;
  ctx.globalAlpha = life.oxygen ? .65 + .35 * Math.sin(time * 4) ** 2 : .9;
  ctx.textAlign = 'center'; ctx.font = '12px sans-serif';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = life.oxygen || gun.jam ? '#ffd092' : '#c9e6ee';
  ctx.fillText(label, w / 2, h - 102);
  ctx.fillText(icons, w / 2, h - 86);
  ctx.restore();
}
