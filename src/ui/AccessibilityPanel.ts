import { access, AccessPrefs } from '../core/Accessibility';
import { ACTIONS, ActionId, keyMap, keyLabel } from '../core/KeyMap';
import { PAD_ACTIONS, PadActionId, padMap } from '../core/PadMap';
import { tx } from '../i18n';

// Settings screen sections: Accessibility, Touch & gamepad (incl. gamepad buttons), Key bindings.
// Hook: UI.settings() calls mountAccessibilityPanel(box) after building its form; the
// sections go in above the Done button.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The gamepad summary line, built from the current button map and stick side. */
export function padHint(connected: boolean): string {
  const v = { fire: padMap.label('fire'), zoom: padMap.label('zoom'), prev: padMap.label('prevGun'), next: padMap.label('nextGun'), reload: padMap.label('reload'), map: padMap.label('map') };
  const left = access.prefs.padSwap;
  return connected
    ? tx('Gamepad ready: {stick} · {fire} fire · {zoom} zoom · {prev}/{next} gun position · {reload} reload · {map} map · Start pause', { ...v, stick: tx(left ? 'left stick aim' : 'right stick aim') })
    : tx('Gamepad: plug one in and press any button. {stick}, {fire} fires, {zoom} zooms, {prev}/{next} change gun position, Start pauses.', { ...v, stick: tx(left ? 'Left stick aims' : 'Right stick aims') });
}

export function mountAccessibilityPanel(box: HTMLElement) {
  box.querySelector('.a11y-panel')?.remove();
  const p = access.prefs;
  const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${tx(label)}</option>`;
  const wrap = document.createElement('div');
  wrap.className = 'a11y-panel';
  wrap.innerHTML = `
    <div class="a11y-h">${tx('Accessibility')}</div>
    <label class="setting">${tx('Colour-blind friendly markers')} <select data-a="cbMode">${opt('off', 'Off', p.cbMode)}${opt('redGreen', 'On (blue friends, orange foes)', p.cbMode)}${opt('blueYellow', 'Blue-yellow safe (teal friends, pink foes)', p.cbMode)}${opt('contrast', 'High contrast (white friends, yellow foes)', p.cbMode)}</select></label>
    <label class="setting">${tx('Subtitle size')} <select data-a="subSize">${opt('S', 'Small', p.subSize)}${opt('M', 'Medium', p.subSize)}${opt('L', 'Large', p.subSize)}${opt('XL', 'Extra large', p.subSize)}</select></label>
    <label class="setting"><span>${tx('Subtitle background')} <b class="a11y-val" data-v="subBg">${Math.round(p.subBg * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" data-a="subBg" value="${p.subBg}"></label>
    <label class="setting">${tx('Reduce motion (shake, slow motion)')} <select data-a="reduceMotion">${opt('false', 'Off', String(p.reduceMotion))}${opt('true', 'On', String(p.reduceMotion))}</select></label>
    <label class="setting">${tx('Reduce flashes')} <select data-a="reduceFlash">${opt('false', 'Off', String(p.reduceFlash))}${opt('true', 'On', String(p.reduceFlash))}</select></label>
    <label class="setting">${tx('One-handed mouse')} <select data-a="oneHand">${opt('false', 'Off', String(p.oneHand))}${opt('true', 'On', String(p.oneHand))}</select></label>
    <div class="a11y-note" data-onehand ${p.oneHand ? '' : 'hidden'}>${tx('Gunner on a mouse alone: wheel = gun position · middle click = reload (hold = bombsight) · side buttons = abilities.')}</div>
    <div class="a11y-sub" aria-hidden="true"><span class="a11y-sample"><span class="who">${tx('Pilot')}</span>${tx('Subtitle preview — bandits, twelve o\'clock high!')}</span></div>
    <div class="a11y-h">${tx('Touch &amp; gamepad')}</div>
    <label class="setting">${tx('Touch controls')} <select data-a="touch">${opt('auto', 'Automatic', p.touch)}${opt('on', 'Always on', p.touch)}${opt('off', 'Off', p.touch)}</select></label>
    <label class="setting"><span>${tx('Touch aim sensitivity')} <b class="a11y-val" data-v="touchSens">${p.touchSens.toFixed(2)}×</b></span><input type="range" min="0.4" max="2.5" step="0.05" data-a="touchSens" value="${p.touchSens}"></label>
    <div class="a11y-note" data-pad></div>
    <label class="setting"><span>${tx('Gamepad aim speed')} <b class="a11y-val" data-v="padSens">${p.padSens.toFixed(2)}×</b></span><input type="range" min="0.4" max="2.5" step="0.05" data-a="padSens" value="${p.padSens}"></label>
    <label class="setting">${tx('Left-handed sticks')} <select data-a="padSwap">${opt('false', 'Off', String(p.padSwap))}${opt('true', 'On (aim with the left stick)', String(p.padSwap))}</select></label>
    <label class="setting">${tx('Stronger aim assist on a gamepad')} <select data-a="padAssist">${opt('true', 'On', String(p.padAssist))}${opt('false', 'Off', String(p.padAssist))}</select></label>
    <div class="a11y-h a11y-h2">${tx('Gamepad buttons')}</div>
    <div class="a11y-keys">${PAD_ACTIONS.map((a) => `<div class="a11y-row"><span>${esc(tx(a.label))}</span><button class="a11y-key" data-p="${a.id}">${esc(padMap.label(a.id))}</button></div>`).join('')}</div>
    <div class="a11y-note" data-pmsg>${tx('Press A on an action, then the new button. Start or View cancels; they stay fixed.')}</div>
    <div class="row"><button class="btn ghost" data-preset>${tx('Reset gamepad to defaults')}</button></div>
    <div class="a11y-h">${tx('Key bindings')}</div>
    <div class="a11y-keys">${ACTIONS.map((a) => `<div class="a11y-row"><span>${esc(tx(a.label))}</span><button class="a11y-key" data-k="${a.id}">${esc(keyLabel(keyMap.bindings[a.id]))}</button></div>`).join('')}</div>
    <div class="a11y-note" data-msg>${tx('Click a key, then press the new one. Esc cancels. F1 and Esc always work.')}</div>
    <div class="row"><button class="btn ghost" data-reset>${tx('Reset keys to defaults')}</button></div>`;
  const doneRow = box.querySelector('[data-back]')?.closest('.row');
  if (doneRow) box.insertBefore(wrap, doneRow); else box.appendChild(wrap);

  // preferences
  wrap.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-a]').forEach((i) => i.addEventListener('input', () => {
    const k = i.dataset.a as keyof AccessPrefs;
    let v: unknown = i.value;
    if (k === 'colorBlind' || k === 'reduceMotion' || k === 'reduceFlash' || k === 'padSwap' || k === 'padAssist' || k === 'oneHand') v = v === 'true';
    if (k === 'subBg' || k === 'touchSens' || k === 'padSens') v = parseFloat(i.value);
    access.set(k, v as never);
    if (k === 'padSwap') showPad();
    if (k === 'oneHand') wrap.querySelector<HTMLElement>('[data-onehand]')!.hidden = !v;
    const out = wrap.querySelector(`[data-v="${k}"]`);
    if (out) out.textContent = k === 'subBg' ? `${Math.round((v as number) * 100)}%` : `${(v as number).toFixed(2)}×`;
  }));

  // gamepad status
  const pad = wrap.querySelector<HTMLElement>('[data-pad]')!;
  const pads = (() => { try { return Array.from(navigator.getGamepads?.() ?? []).filter((g) => g?.connected); } catch { return []; } })();
  const showPad = () => { pad.textContent = padHint(pads.length > 0); };
  showPad();

  // key bindings
  const msg = wrap.querySelector<HTMLElement>('[data-msg]')!;
  const refresh = () => wrap.querySelectorAll<HTMLButtonElement>('.a11y-key').forEach((b) => { b.textContent = keyLabel(keyMap.bindings[b.dataset.k as ActionId]); b.classList.remove('wait'); });
  let stop: (() => void) | null = null;
  wrap.querySelectorAll<HTMLButtonElement>('.a11y-key').forEach((b) => b.addEventListener('click', () => {
    stop?.();
    const id = b.dataset.k as ActionId;
    b.textContent = tx('Press a key…');
    b.classList.add('wait');
    b.blur();   // a Space/Enter key-up must not re-click the button
    keyMap.capturing = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { finish(); msg.textContent = tx('Cancelled.'); return; }
      const r = keyMap.bind(id, e.code);
      finish();
      const label = tx(ACTIONS.find((a) => a.id === id)!.label);
      if (!r.ok) msg.textContent = tx('{reason}. Pick another key.', { reason: r.reason });
      else msg.textContent = `${label}: ${keyLabel(e.code)}` + (r.swapped ? tx(' (swapped with {action}: now {key})', { action: tx(ACTIONS.find((a) => a.id === r.swapped)!.label), key: keyMap.label(r.swapped) }) : '');
    };
    const finish = () => { window.removeEventListener('keydown', onKey, true); keyMap.capturing = false; stop = null; refresh(); };
    stop = finish;
    window.addEventListener('keydown', onKey, true);
  }));
  wrap.querySelector('[data-reset]')!.addEventListener('click', () => { stop?.(); keyMap.reset(); refresh(); msg.textContent = tx('Keys reset to defaults.'); });

  // gamepad buttons: GamepadInput hands the next pressed button to padMap.finishCapture
  const pmsg = wrap.querySelector<HTMLElement>('[data-pmsg]')!;
  const padLabel = (id: PadActionId) => tx(PAD_ACTIONS.find((a) => a.id === id)!.label);
  const prefresh = () => { wrap.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) => { b.textContent = padMap.label(b.dataset.p as PadActionId); b.classList.remove('wait'); }); showPad(); };
  const pstop = () => { if (padMap.capturing) padMap.finishCapture(-1); };
  wrap.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) => b.addEventListener('click', () => {
    pstop();
    stop?.();
    const id = b.dataset.p as PadActionId;
    b.textContent = tx('Press a button…');
    b.classList.add('wait');
    const onEsc = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); pstop(); } };
    window.addEventListener('keydown', onEsc, true);
    padMap.startCapture(id, (button) => {
      window.removeEventListener('keydown', onEsc, true);
      if (button < 0) pmsg.textContent = tx('Cancelled.');
      else {
        const r = padMap.bind(id, button);
        if (r.ok) pmsg.textContent = `${padLabel(id)}: ${padMap.label(id)}` + (r.swapped ? tx(' (swapped with {action}: now {key})', { action: padLabel(r.swapped), key: padMap.label(r.swapped) }) : '');
      }
      prefresh();
      b.focus({ preventScroll: true });
    });
  }));
  wrap.querySelector('[data-preset]')!.addEventListener('click', () => { pstop(); padMap.reset(); prefresh(); pmsg.textContent = tx('Gamepad reset to defaults.'); });
  // leaving the screen mid-capture must not swallow the next key or button press
  box.querySelector('[data-back]')?.addEventListener('click', () => { stop?.(); pstop(); });
}
