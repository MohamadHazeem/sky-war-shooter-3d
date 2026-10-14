import { ToastQueue } from './ToastQueue';
import { hudRuntime } from './HudDetail';
import { tx } from '../i18n';
const queue = new ToastQueue<readonly [string, string, string]>();
let timer: ReturnType<typeof setInterval> | undefined;
let el: HTMLElement | undefined;
let shown: readonly [string, string, string] | null = null;
let last = 0;
export function hudToast(label: string, name: string, desc: string) {
  if (typeof document === 'undefined') return;
  queue.push([label, name, desc]);
  if (!timer) { last = performance.now(); timer = setInterval(tick, 40); }
}
function tick() {
  const now = performance.now();
  const blocked = !!document.querySelector('#settings.show') || (hudRuntime.inMission && (hudRuntime.detail === 'minimal' || (hudRuntime.detail === 'standard' && hudRuntime.heavy)));
  const next = queue.update((now - last) / 1000, blocked); last = now;
  if (next !== shown) {
    if (!el) { el = document.createElement('div'); el.id = 'hudToast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.replaceChildren();
    if (next) for (let i = 0; i < 3; i++) { const line = document.createElement('div'); line.className = ['k', 't', 'd'][i]; line.textContent = tx(next[i]); el.append(line); }
    el.classList.toggle('show', !!next); shown = next;
  }
  if (!queue.busy) { clearInterval(timer); timer = undefined; }
}
