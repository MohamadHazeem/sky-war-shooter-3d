import { cloudCode, prettyCode, pullSave, pushSave } from '../net/CloudSave';

// "Cloud save" block appended to the Settings screen: shows this device's transfer code and
// lets the player pull a profile from another device by its code.
export function mountCloudSave(host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'lb-panel cloud';
  host.appendChild(box);
  const code = cloudCode();
  box.innerHTML = `<div class="hud-label">CLOUD SAVE</div>
    <div class="cs-row">Your transfer code: <b class="cs-code">${prettyCode(code)}</b> <button class="btn ghost" data-copy>Copy</button> <button class="btn ghost" data-push>Save now</button></div>
    <div class="cs-row"><input maxlength="26" placeholder="Code from another device"/> <button class="btn ghost" data-pull>Load profile</button></div>
    <div class="lb-status cs-status">Progress saves to the cloud after every mission. Keep the code private.</div>`;
  const status = box.querySelector<HTMLElement>('.cs-status')!;
  box.querySelector('[data-copy]')!.addEventListener('click', () => { navigator.clipboard?.writeText(code); status.textContent = 'Code copied.'; });
  box.querySelector('[data-push]')!.addEventListener('click', async () => { status.textContent = 'Saving…'; status.textContent = (await pushSave(true)) ? 'Saved to the cloud.' : 'Could not reach the cloud (offline?).'; });
  box.querySelector('[data-pull]')!.addEventListener('click', async () => {
    const v = box.querySelector('input')!.value;
    status.textContent = 'Loading…';
    const r = await pullSave(v);
    if (r === 'ok') { status.textContent = 'Profile loaded — restarting…'; setTimeout(() => location.reload(), 600); }
    else status.textContent = r === 'notfound' ? 'No profile with that code.' : 'Could not reach the cloud (offline?).';
  });
}
