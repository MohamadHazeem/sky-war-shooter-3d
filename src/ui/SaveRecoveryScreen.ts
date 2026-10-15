// Save recovery screen (Phase 11 goal 36, rules in game/SaveSystem.ts). Opens by itself before the
// menu when part of the profile cannot be read (or the game failed to start with it), and from
// Settings → Advanced → Cloud save → "Backups and recovery". One simple sheet: what is wrong,
// the backups with their date and progress (tap Restore twice), Repair / Export / Import, and a
// way out. It sits above every layer and removes itself, so the screen under it is untouched.
import { getLang, isAr, num, tx } from '../i18n';
import {
  bootSaves, browserKV, exportProfile, findDamage, importProfile, listBackups, readProfile, repairDamage, restoreBackup,
  UNDO_ID, type BackupEntry, type KV,
} from '../game/SaveSystem';
import { esc } from './serviceCommon';

const CSS = `
#saveRecovery { position: fixed; inset: 0; z-index: 60; background: rgba(8,9,6,.86); overflow: auto; }
#saveRecovery .box { width: min(600px, 100%); padding: 28px 32px; max-height: 94vh; overflow: auto; }
#saveRecovery .sr-alert { border-inline-start: 4px solid var(--bad); background: rgba(217,87,63,.12); padding: 10px 12px; margin: 12px 0 4px; font: 15px/1.4 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif; }
#saveRecovery .sr-ok { border-inline-start-color: var(--good); background: rgba(159,194,107,.10); }
#saveRecovery .sr-sec { margin: 18px 0 6px; font-size: 13px; letter-spacing: 2px; color: var(--khaki); text-transform: uppercase; }
#saveRecovery ul { list-style: none; margin: 0; padding: 0; }
#saveRecovery li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
#saveRecovery li > div { flex: 1; min-width: 0; }
#saveRecovery li b { font-weight: 500; font-size: 17px; letter-spacing: .5px; }
#saveRecovery li .sr-why { color: var(--ink-dim); font-size: 13px; margin-inline-start: 8px; }
#saveRecovery li small { display: block; color: var(--ink-dim); font: 13px/1.4 'IBM Plex Mono', monospace; margin-top: 2px; }
#saveRecovery .sr-empty { color: var(--ink-dim); font: 14px/1.4 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif; padding: 6px 0; }
#saveRecovery .btn { padding: 9px 16px; font-size: 14px; }
#saveRecovery .btn.armed { background: var(--bad); color: #fff; border-color: var(--bad); }
#saveRecovery .sr-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
#saveRecovery .sr-actions .sr-go { margin-inline-start: auto; }
#saveRecovery .sr-status { min-height: 1.4em; margin-top: 10px; color: var(--khaki); font: 14px/1.4 'IBM Plex Sans', 'IBM Plex Sans Arabic', sans-serif; }
@media (max-width: 560px) { #saveRecovery .box { padding: 20px 16px; } #saveRecovery .sr-actions .sr-go { margin-inline-start: 0; flex-basis: 100%; } }
`;

// Friendly names for the stores players care about; anything else is "other game data"
const STORE_NAMES: Record<string, string> = {
  'sws3d.progress.v1': 'Campaign progress', 'sws3d.career.v1': 'Service record', 'sws3d.settings.v2': 'Settings',
  'sws3d.armory.v1': 'Hangar and upgrades', 'sws3d.achievements.v1': 'Trophies', 'sws3d.campaign.v2': 'Campaign map',
  'sws3d.tour.v1': 'Tour of duty', 'sws3d.crew.v1': 'Crew', 'sws3d.mastery.v1': 'Gunner mastery',
};
const REASONS: Record<string, string> = {
  launch: 'Game start', mission: 'After a mission', update: 'Before an update', manual: 'Saved by you', undo: 'Before the last change',
};

export const storeName = (k: string) => tx(STORE_NAMES[k] ?? 'Other game data');

function when(t: number) {
  const loc = isAr() ? 'en-GB' : getLang() === 'en' ? undefined : getLang();
  const d = new Date(t);
  return `${d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`;
}

function backupRow(b: BackupEntry) {
  const s = b.summary;
  return `<li><div><b>${esc(when(b.at))}</b><span class="sr-why">${tx(REASONS[b.reason] ?? 'Game start')}</span>
    <small>${tx('Missions {n}', { n: num(s.missions) })} · ${tx('XP {n}', { n: num(s.xp) })} · ${tx('Campaign mission {n}', { n: num(s.unlocked + 1) })}</small></div>
    <button class="btn ghost" data-restore="${esc(b.id)}">${tx('Restore')}</button></li>`;
}

// Download the whole profile as one JSON file
export function exportToFile(kv: KV | null = browserKV()): boolean {
  if (!kv) return false;
  try {
    const blob = new Blob([exportProfile(kv)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sky-war-profile-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch { return false; }
}

// Pick a profile file and load it. Resolves with a status line (or 'ok' once it is loaded).
export function importFromFile(kv: KV | null = browserKV()): Promise<string> {
  return new Promise((resolve) => {
    if (!kv) { resolve(tx('Saving is not available in this browser.')); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) { resolve(''); return; }
      const r = importProfile(kv, f.size > 2_000_000 ? '' : await f.text());
      resolve(r.ok ? 'ok' : tx(r.error === 'newer' ? 'This file comes from a newer version of the game. Update the game first.' : 'That file is not a Sky War profile.'));
    };
    input.click();
  });
}

export interface RecoveryOptions {
  reason: 'damaged' | 'crash' | 'manual';
  // Boot: the game is not running yet, so the screen just closes after a change. Otherwise the
  // page reloads so every system reads the new profile.
  live: boolean;
}

// Show the screen; resolves when the player continues (a change while the game runs reloads)
export function openSaveRecovery(o: RecoveryOptions): Promise<void> {
  const kv = browserKV();
  if (!document.getElementById('saveRecoveryCss')) {
    const st = document.createElement('style'); st.id = 'saveRecoveryCss'; st.textContent = CSS; document.head.append(st);
  }
  document.getElementById('saveRecovery')?.remove();
  const el = document.createElement('div');
  el.id = 'saveRecovery';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  document.body.append(el);
  return new Promise((resolve) => {
    let status = '';
    const close = () => { removeEventListener('keydown', key); el.remove(); resolve(); };
    const changed = (msg: string) => {
      if (o.live) { el.querySelector('.sr-status')!.textContent = `${msg} ${tx('Restarting…')}`; setTimeout(() => location.reload(), 700); return; }
      status = msg; render();
    };
    const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    addEventListener('keydown', key);
    const render = () => {
      const damaged = kv ? findDamage(readProfile(kv)) : [];
      const backups = kv ? listBackups(kv) : [];
      const regular = backups.filter((b) => b.id !== UNDO_ID);
      const undo = backups.find((b) => b.id === UNDO_ID);
      const alert = !kv
        ? `<p class="sr-alert">${tx('Saving is not available in this browser (private mode or storage blocked). Progress will not be kept.')}</p>`
        : damaged.length
          ? `<p class="sr-alert">${tx(o.reason === 'crash' ? 'The game could not start with your saved data.' : 'Part of your saved data could not be read.')} ${tx('Damaged: {list}.', { list: [...new Set(damaged.map(storeName))].join(tx(', ')) })} ${tx('Restore a backup, or repair to reset only the damaged parts.')}</p>`
          : o.reason === 'crash'
            ? `<p class="sr-alert">${tx('The game could not start with your saved data.')} ${tx('Restore a backup from before the problem.')}</p>`
            : `<p class="sr-alert sr-ok">${tx('Your saved data is healthy. A backup is made each time you start the game and after every mission.')}</p>`;
      el.innerHTML = `<div class="screen-center"><div class="box panel">
        <div class="kicker">${tx('PROFILE')}</div><h2 class="h2">${tx('Save recovery')}</h2>
        ${alert}
        <div class="sr-sec">${tx('Backups')}</div>
        ${regular.length ? `<ul>${regular.map(backupRow).join('')}</ul>` : `<div class="sr-empty">${tx('No backups yet. One is made each time you start the game and after every mission.')}</div>`}
        ${undo ? `<div class="sr-sec">${tx('Undo')}</div><ul>${backupRow(undo)}</ul>` : ''}
        <div class="sr-actions">
          ${damaged.length ? `<button class="btn" data-repair>${tx('Repair')}</button>` : ''}
          <button class="btn ghost" data-export>${tx('Export profile')}</button>
          <button class="btn ghost" data-import>${tx('Import profile')}</button>
          <button class="btn sr-go" data-continue>${tx(o.live ? 'Close' : 'Continue')}</button>
        </div>
        <div class="sr-status" role="status">${esc(status)}</div>
      </div></div>`;
      el.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) => b.addEventListener('click', () => {
        if (!b.classList.contains('armed')) {
          el.querySelectorAll('.armed').forEach((x) => { x.classList.remove('armed'); x.textContent = tx('Restore'); });
          b.classList.add('armed'); b.textContent = tx('Tap again to restore'); return;
        }
        changed(tx(kv && restoreBackup(kv, b.dataset.restore!) ? 'Backup restored.' : 'That backup could not be read.'));
      }));
      el.querySelector('[data-repair]')?.addEventListener('click', () => {
        const fixed = kv ? repairDamage(kv) : [];
        changed(tx('Repaired: {list}.', { list: [...new Set(fixed.map(storeName))].join(tx(', ')) }));
      });
      el.querySelector('[data-export]')!.addEventListener('click', () => {
        status = tx(exportToFile(kv) ? 'Profile file saved to your downloads.' : 'Could not save the file.');
        el.querySelector('.sr-status')!.textContent = status;
      });
      el.querySelector('[data-import]')!.addEventListener('click', async () => {
        const r = await importFromFile(kv);
        if (r === 'ok') changed(tx('Profile imported.'));
        else if (r) { status = r; el.querySelector('.sr-status')!.textContent = r; }
      });
      el.querySelector('[data-continue]')!.addEventListener('click', close);
      el.querySelector<HTMLElement>(damaged.length ? '[data-repair]' : '[data-continue]')?.focus();
    };
    render();
  });
}

// Boot (main.ts, before the game reads its stores): migrate, back up, and stop at the recovery
// screen when part of the profile is damaged ('?recover' in the address opens it on purpose)
export async function checkSavesAtBoot(): Promise<void> {
  const kv = browserKV();
  if (!kv) return;
  const r = bootSaves(kv);
  let ask = false;
  try { ask = new URLSearchParams(location.search).has('recover'); } catch { /* */ }
  if (r.damaged.length || ask) await openSaveRecovery({ reason: r.damaged.length ? 'damaged' : 'manual', live: false });
}
