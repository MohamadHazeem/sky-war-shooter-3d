// Persistent achievements: per-mission tracking, the unlock toast and the Credits-panel list.
// Self-contained so Game.ts only needs a few one-line hooks. Progress lives in localStorage
// (per browser), and every storage call is guarded because it can be blocked or full.
import type { Mission } from './Missions';

const STORE_KEY = 'sws3d.achievements.v1';
const TOAST_MS = 4200;
// Accuracy needs a minimum sample so a lucky burst of a few rounds can't unlock it
const SHARP_MIN_SHOTS = 50;
const SHARP_ACCURACY = 0.3;
const ACE_KILLS = 5;
const SURVIVOR_WAVE = 5;

export interface AchievementDef { id: string; name: string; desc: string }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBlood', name: 'First Blood', desc: 'Confirm your first Fw 190 kill.' },
  { id: 'ace', name: 'Ace in a Day', desc: `Confirm ${ACE_KILLS} kills in a single mission.` },
  { id: 'untouchable', name: 'Untouchable', desc: 'Complete a mission without taking a single hit.' },
  { id: 'flakSurvivor', name: 'Flak Survivor', desc: 'Complete a mission that flies through flak.' },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: `Finish a mission with over ${SHARP_ACCURACY * 100}% accuracy (${SHARP_MIN_SHOTS}+ rounds fired).` },
  { id: 'wingClipper', name: 'Wing Clipper', desc: 'Shoot a wing off a Fw 190.' },
  { id: 'survivor', name: 'Survivor', desc: `Reach survival wave ${SURVIVOR_WAVE}.` },
];

interface MissionTrack {
  hitsTaken: number;
  startedDamaged: boolean;
  flak: boolean;
}

function readStore(): Record<string, number> {
  try {
    const s = localStorage.getItem(STORE_KEY);
    const o = s ? JSON.parse(s) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}

let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
#achv-toasts { position: fixed; top: 14px; right: 14px; z-index: 45; display: flex; flex-direction: column; gap: 10px; pointer-events: none; max-width: min(340px, calc(100vw - 28px)); }
.achv-toast { display: flex; gap: 12px; align-items: center; background: rgba(10,10,6,0.88); border: 1px solid rgba(185,167,111,0.65); box-shadow: 0 6px 24px rgba(0,0,0,0.45); padding: 12px 14px; color: #ece6d2; font-family: 'IBM Plex Mono', monospace; opacity: 0; transform: translateX(24px); transition: opacity 0.4s, transform 0.4s; }
.achv-toast.show { opacity: 1; transform: none; }
.achv-star { font-size: 26px; color: #e0b65a; text-shadow: 0 0 10px rgba(224,182,90,0.6); line-height: 1; }
.achv-k { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #b9a76f; }
.achv-n { font-family: Oswald, sans-serif; font-size: 18px; letter-spacing: 1px; }
.achv-d { font-size: 12px; color: #a9a48f; line-height: 1.4; }
.achv-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 18px; }
.achv-count { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #b9a76f; }
.achv-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
.achv-list li { display: flex; gap: 10px; align-items: flex-start; border: 1px solid rgba(185,167,111,0.2); background: rgba(255,255,255,0.03); padding: 9px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #8f8a78; line-height: 1.5; }
.achv-list li.got { color: #ece6d2; border-color: rgba(185,167,111,0.55); }
.achv-list li.got .achv-mark { color: #e0b65a; }
.achv-mark { width: 14px; flex: none; text-align: center; }
.achv-list small { display: block; font-size: 11px; color: #b9a76f; letter-spacing: 1px; }`;
  document.head.appendChild(st);
}

class Achievements {
  private unlocked: Record<string, number>;
  private mission: MissionTrack | null = null;
  private queue: AchievementDef[] = [];
  private toastBusy = false;
  private toastHost: HTMLElement | null = null;

  constructor() { this.unlocked = readStore(); }

  has(id: string) { return this.unlocked[id] !== undefined; }

  unlock(id: string) {
    if (this.has(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    this.unlocked[id] = Date.now();
    try {
      // merge with anything another tab stored meanwhile
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...this.unlocked }));
    } catch { /* storage unavailable: the unlock lasts for this session only */ }
    this.queue.push(def);
    this.pump();
  }

  // ---- mission hooks ----
  beginMission(m: Mission) {
    this.mission = { hitsTaken: 0, startedDamaged: !!m.playerDamaged, flak: !!m.flak };
  }

  onPlayerHit() {
    if (this.mission) this.mission.hitsTaken++;
  }

  // `kills` is the mission's confirmed-kill count including this kill; `cause` is how the victim went down
  onConfirmedKill(kills: number, cause: string) {
    if (!this.has('firstBlood')) this.unlock('firstBlood');
    if (kills >= ACE_KILLS) this.unlock('ace');
    if (cause === 'wingL' || cause === 'wingR') this.unlock('wingClipper');
  }

  onSurvivalWave(wave: number) {
    if (wave >= SURVIVOR_WAVE) this.unlock('survivor');
  }

  // Called once when the debrief appears; shots/hits are the mission's gunnery stats
  endMission(success: boolean, shots: number, hits: number) {
    const t = this.mission;
    this.mission = null;
    if (!t) return;
    if (success && t.flak) this.unlock('flakSurvivor');
    if (success && t.hitsTaken === 0 && !t.startedDamaged) this.unlock('untouchable');
    if (shots >= SHARP_MIN_SHOTS && hits / shots > SHARP_ACCURACY) this.unlock('sharpshooter');
  }

  // ---- toast ----
  private pump() {
    if (this.toastBusy || !this.queue.length || typeof document === 'undefined') return;
    const def = this.queue.shift()!;
    this.toastBusy = true;
    ensureStyle();
    if (!this.toastHost) {
      this.toastHost = document.createElement('div');
      this.toastHost.id = 'achv-toasts';
      document.body.appendChild(this.toastHost);
    }
    const el = document.createElement('div');
    el.className = 'achv-toast';
    el.innerHTML = `<div class="achv-star">★</div><div><div class="achv-k">Achievement unlocked</div><div class="achv-n">${def.name}</div><div class="achv-d">${def.desc}</div></div>`;
    this.toastHost.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.remove(); this.toastBusy = false; this.pump(); }, 450);
    }, TOAST_MS);
  }

  // ---- Credits list ----
  listHtml(): string {
    ensureStyle();
    const n = ACHIEVEMENTS.filter((a) => this.has(a.id)).length;
    const rows = ACHIEVEMENTS.map((a) => {
      const ts = this.unlocked[a.id];
      const got = ts !== undefined;
      return `<li class="${got ? 'got' : ''}"><span class="achv-mark">${got ? '★' : '☆'}</span><span>${a.name} — ${a.desc}${got ? `<small>Unlocked ${new Date(ts).toLocaleDateString()}</small>` : ''}</span></li>`;
    }).join('');
    return `<div class="achv-head"><div class="kicker">ACHIEVEMENTS</div><span class="achv-count">${n}/${ACHIEVEMENTS.length}</span></div><ul class="achv-list">${rows}</ul>`;
  }
}

export const achievements = new Achievements();
export const achievementsHtml = () => achievements.listHtml();
