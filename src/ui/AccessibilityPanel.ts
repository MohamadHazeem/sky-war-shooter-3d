import { access, AccessPrefs } from '../core/Accessibility';
import { ACTIONS, ActionId, keyMap, keyLabel } from '../core/KeyMap';

// Settings screen sections: Accessibility, Touch & gamepad, Key bindings.
// Hook: UI.settings() calls mountAccessibilityPanel(box) after building its form; the
// sections go in above the Done button.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function mountAccessibilityPanel(box: HTMLElement) {
  box.querySelector('.a11y-panel')?.remove();
  const p = access.prefs;
  const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${label}</option>`;
  const wrap = document.createElement('div');
  wrap.className = 'a11y-panel';
  wrap.innerHTML = `
    <div class="a11y-h">Accessibility</div>
    <label class="setting">Colour-blind friendly markers <select data-a="colorBlind">${opt('false', 'Off', String(p.colorBlind))}${opt('true', 'On (blue friends, orange foes)', String(p.colorBlind))}</select></label>
    <label class="setting">Subtitle size <select data-a="subSize">${opt('S', 'Small', p.subSize)}${opt('M', 'Medium', p.subSize)}${opt('L', 'Large', p.subSize)}</select></label>
    <label class="setting"><span>Subtitle background <b class="a11y-val" data-v="subBg">${Math.round(p.subBg * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" data-a="subBg" value="${p.subBg}"></label>
    <label class="setting">Reduce screen shake and flashes <select data-a="reduceMotion">${opt('false', 'Off', String(p.reduceMotion))}${opt('true', 'On', String(p.reduceMotion))}</select></label>
    <div class="a11y-sub" aria-hidden="true"><span class="a11y-sample"><span class="who">Pilot</span>Subtitle preview — bandits, twelve o'clock high!</span></div>
    <div class="a11y-h">Touch &amp; gamepad</div>
    <label class="setting">Touch controls <select data-a="touch">${opt('auto', 'Automatic', p.touch)}${opt('on', 'Always on', p.touch)}${opt('off', 'Off', p.touch)}</select></label>
    <label class="setting"><span>Touch aim sensitivity <b class="a11y-val" data-v="touchSens">${p.touchSens.toFixed(2)}×</b></span><input type="range" min="0.4" max="2.5" step="0.05" data-a="touchSens" value="${p.touchSens}"></label>
    <div class="a11y-note" data-pad></div>
    <div class="a11y-h">Key bindings</div>
    <div class="a11y-keys">${ACTIONS.map((a) => `<div class="a11y-row"><span>${esc(a.label)}</span><button class="a11y-key" data-k="${a.id}">${esc(keyLabel(keyMap.bindings[a.id]))}</button></div>`).join('')}</div>
    <div class="a11y-note" data-msg>Click a key, then press the new one. Esc cancels. F1 and Esc always work.</div>
    <div class="row"><button class="btn ghost" data-reset>Reset keys to defaults</button></div>`;
  const doneRow = box.querySelector('[data-back]')?.closest('.row');
  if (doneRow) box.insertBefore(wrap, doneRow); else box.appendChild(wrap);

  // preferences
  wrap.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-a]').forEach((i) => i.addEventListener('input', () => {
    const k = i.dataset.a as keyof AccessPrefs;
    let v: unknown = i.value;
    if (k === 'colorBlind' || k === 'reduceMotion') v = v === 'true';
    if (k === 'subBg' || k === 'touchSens') v = parseFloat(i.value);
    access.set(k, v as never);
    const out = wrap.querySelector(`[data-v="${k}"]`);
    if (out) out.textContent = k === 'subBg' ? `${Math.round((v as number) * 100)}%` : `${(v as number).toFixed(2)}×`;
  }));

  // gamepad status
  const pad = wrap.querySelector<HTMLElement>('[data-pad]')!;
  const pads = (() => { try { return Array.from(navigator.getGamepads?.() ?? []).filter((g) => g?.connected); } catch { return []; } })();
  pad.innerHTML = pads.length
    ? `Gamepad ready: right stick aim · RT fire · LT zoom · LB/RB gun position · X reload · D-pad up map · Start pause`
    : 'Gamepad: plug one in and press any button. Right stick aims, RT fires, LT zooms, LB/RB change gun position, Start pauses.';

  // key bindings
  const msg = wrap.querySelector<HTMLElement>('[data-msg]')!;
  const refresh = () => wrap.querySelectorAll<HTMLButtonElement>('.a11y-key').forEach((b) => { b.textContent = keyLabel(keyMap.bindings[b.dataset.k as ActionId]); b.classList.remove('wait'); });
  let stop: (() => void) | null = null;
  wrap.querySelectorAll<HTMLButtonElement>('.a11y-key').forEach((b) => b.addEventListener('click', () => {
    stop?.();
    const id = b.dataset.k as ActionId;
    b.textContent = 'Press a key…';
    b.classList.add('wait');
    b.blur();   // a Space/Enter key-up must not re-click the button
    keyMap.capturing = true;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') { finish(); msg.textContent = 'Cancelled.'; return; }
      const r = keyMap.bind(id, e.code);
      finish();
      const label = ACTIONS.find((a) => a.id === id)!.label;
      if (!r.ok) msg.textContent = `${r.reason}. Pick another key.`;
      else msg.textContent = `${label}: ${keyLabel(e.code)}` + (r.swapped ? ` (swapped with ${ACTIONS.find((a) => a.id === r.swapped)!.label}: now ${keyMap.label(r.swapped)})` : '');
    };
    const finish = () => { window.removeEventListener('keydown', onKey, true); keyMap.capturing = false; stop = null; refresh(); };
    stop = finish;
    window.addEventListener('keydown', onKey, true);
  }));
  wrap.querySelector('[data-reset]')!.addEventListener('click', () => { stop?.(); keyMap.reset(); refresh(); msg.textContent = 'Keys reset to defaults.'; });
  // leaving the screen mid-capture must not swallow the next key press
  box.querySelector('[data-back]')?.addEventListener('click', () => stop?.());
}
