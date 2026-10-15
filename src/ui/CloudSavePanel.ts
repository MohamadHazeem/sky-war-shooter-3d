import { cloudCode, onCloudMerge, prettyCode, pullSave, syncSave } from '../net/CloudSave';
import { tx } from '../i18n';
import { exportToFile, importFromFile, openSaveRecovery } from './SaveRecoveryScreen';
import { hudToast } from './HudToast';

// A background push (mission end) that merged progress from another device tells the player
onCloudMerge(() => hudToast('CLOUD SAVE', 'Progress merged', 'Progress from another device was merged. Restart the game to see it.'));
import { revealable, wireReveal } from './Streamer';

// "Cloud save" block appended to the Settings screen: shows this device's transfer code and
// lets the player pull a profile from another device by its code. Save 2.0 adds one row for the
// whole profile: export to a file, import a file, and the backups / recovery screen.
export function mountCloudSave(host: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'lb-panel cloud';
  (host.querySelector('[data-settings-extras]') ?? host).appendChild(box);
  const code = cloudCode();
  box.innerHTML = `<div class="hud-label">${tx('CLOUD SAVE')}</div>
    <div class="cs-row">${tx('Your transfer code:')} <b>${revealable(prettyCode(code), 'cs-code')}</b> <button class="btn ghost" data-copy>${tx('Copy')}</button> <button class="btn ghost" data-push>${tx('Save now')}</button></div>
    <div class="cs-row"><input maxlength="26" placeholder="${tx('Code from another device')}"/> <button class="btn ghost" data-pull>${tx('Load profile')}</button></div>
    <div class="cs-row">${tx('Profile:')} <button class="btn ghost" data-export>${tx('Export file')}</button> <button class="btn ghost" data-import>${tx('Import file')}</button> <button class="btn ghost" data-recover>${tx('Backups and recovery')}</button></div>
    <div class="lb-status cs-status">${tx('Progress saves to the cloud after every mission. Keep the code private.')}</div>`;
  wireReveal(box);
  const status = box.querySelector<HTMLElement>('.cs-status')!;
  box.querySelector('[data-copy]')!.addEventListener('click', () => { navigator.clipboard?.writeText(code); status.textContent = tx('Code copied.'); });
  box.querySelector('[data-push]')!.addEventListener('click', async () => {
    status.textContent = tx('Saving…');
    const r = await syncSave(true, 'manual');
    status.textContent = tx(r === 'merged' ? 'Progress from another device was merged. Restart the game to see it.' : r === 'error' ? 'Could not reach the cloud (offline?).' : 'Saved to the cloud.');
  });
  box.querySelector('[data-pull]')!.addEventListener('click', async () => {
    const v = box.querySelector('input')!.value;
    status.textContent = tx('Loading…');
    const r = await pullSave(v);
    if (r === 'ok') { status.textContent = tx('Profile loaded — restarting…'); setTimeout(() => location.reload(), 600); }
    else status.textContent = tx(r === 'notfound' ? 'No profile with that code.' : 'Could not reach the cloud (offline?).');
  });
  box.querySelector('[data-export]')!.addEventListener('click', () => { status.textContent = tx(exportToFile() ? 'Profile file saved to your downloads.' : 'Could not save the file.'); });
  box.querySelector('[data-import]')!.addEventListener('click', async () => {
    const r = await importFromFile();
    if (r === 'ok') { status.textContent = `${tx('Profile imported.')} ${tx('Restarting…')}`; setTimeout(() => location.reload(), 600); }
    else if (r) status.textContent = r;
  });
  box.querySelector('[data-recover]')!.addEventListener('click', () => { void openSaveRecovery({ reason: 'manual', live: true }); });
}
