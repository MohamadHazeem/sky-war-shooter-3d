// HUD for the active abilities: three slots at the bottom centre, each with its key, an
// icon, a cooldown sweep (dark wedge that shrinks as it recharges), a draining ring while
// the ability runs and a pulsing glow when it is ready. Also owns the Focus screen tint.
// The elements live outside #hud (UI.hud() rewrites that layer at every mission start).
// update() only touches the DOM when a value visibly changes.

export interface AbilitySlotView {
  id: string;
  name: string;
  key: string;      // label shown on the key cap ('Q', 'E', ...)
  cd: number;       // 0..1 cooldown remaining (1 = just used)
  cdLeft: number;   // seconds of cooldown left
  active: number;   // 0..1 effect time remaining (0 = not running)
  ready: boolean;
}

const ICONS: Record<string, string> = {
  // three P-51 silhouettes in a diving vic
  mustangs: `<svg viewBox="0 0 32 32"><g fill="currentColor">
    <path d="M16 5l1.3 4.2 5.2 1.4v1.3l-5 .3-.6 3.4 2 1v1l-2.9-.4-2.9.4v-1l2-1-.6-3.4-5-.3v-1.3l5.2-1.4z"/>
    <path d="M7 16l.9 2.9 3.6 1v.9l-3.5.2-.4 2.4 1.4.7v.7l-2-.3-2 .3v-.7l1.4-.7-.4-2.4-3.5-.2v-.9l3.6-1z"/>
    <path d="M25 16l.9 2.9 3.6 1v.9l-3.5.2-.4 2.4 1.4.7v.7l-2-.3-2 .3v-.7l1.4-.7-.4-2.4-3.5-.2v-.9l3.6-1z"/></g></svg>`,
  // a barrel throwing a hot round
  overdrive: `<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 4l-8 13h6l-3 11 9-15h-6z" fill="currentColor" stroke-width="1.2"/></g></svg>`,
  // ring sight with a slowed-down clock hand
  focus: `<svg viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="16" cy="16" r="10.5"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/>
    <path d="M16 2.5v4M16 25.5v4M2.5 16h4M25.5 16h4"/><path d="M16 16l5-3.5" stroke-width="1.4"/></g></svg>`,
};

interface SlotEls { root: HTMLElement; time: HTMLElement; cdQ: number; actQ: number; ready: boolean; active: boolean; secs: number }

export class AbilityBar {
  private root: HTMLElement;
  private tint: HTMLElement;
  private slots = new Map<string, SlotEls>();
  private shown = false;
  private tintQ = -1;
  private hotQ = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'abilityBar';
    this.tint = document.createElement('div');
    this.tint.id = 'abilityTint';
    document.body.append(this.tint, this.root);
  }

  // Build the slots for a mission (keys differ between gunner and pilot)
  build(slots: readonly AbilitySlotView[]) {
    this.slots.clear();
    this.root.innerHTML = slots.map((s) => `<div class="ab-slot" data-a="${s.id}">
        <div class="ab-face"><div class="ab-icon">${ICONS[s.id] ?? ''}</div><div class="ab-sweep"></div><div class="ab-ring"></div><div class="ab-time"></div></div>
        <kbd class="ab-key">${s.key}</kbd><div class="ab-name">${s.name}</div>
      </div>`).join('');
    this.root.querySelectorAll<HTMLElement>('.ab-slot').forEach((el) => {
      this.slots.set(el.dataset.a!, { root: el, time: el.querySelector('.ab-time')!, cdQ: -1, actQ: -1, ready: false, active: false, secs: -1 });
    });
  }

  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.root.classList.toggle('show', on);
    if (!on) this.setTint(0);
  }

  update(views: readonly AbilitySlotView[]) {
    for (const v of views) {
      const s = this.slots.get(v.id);
      if (!s) continue;
      const cdQ = Math.round(v.cd * 240);
      if (cdQ !== s.cdQ) { s.cdQ = cdQ; s.root.style.setProperty('--cd', String(cdQ / 240)); }
      const actQ = Math.round(v.active * 240);
      if (actQ !== s.actQ) { s.actQ = actQ; s.root.style.setProperty('--act', String(actQ / 240)); }
      const active = v.active > 0;
      if (active !== s.active) { s.active = active; s.root.classList.toggle('active', active); }
      if (v.ready !== s.ready) {
        s.ready = v.ready;
        s.root.classList.toggle('ready', v.ready);
        if (v.ready) { s.root.classList.remove('flash'); void s.root.offsetWidth; s.root.classList.add('flash'); }
      }
      const secs = !active && !v.ready ? Math.ceil(v.cdLeft) : 0;
      if (secs !== s.secs) { s.secs = secs; s.time.textContent = secs > 0 ? String(secs) : ''; }
    }
  }

  // Pressed while recharging: a short shake
  deny(id: string) {
    const s = this.slots.get(id);
    if (!s) return;
    s.root.classList.remove('deny'); void s.root.offsetWidth; s.root.classList.add('deny');
  }

  // Focus: blue-grey screen tint, 0..1
  setTint(k: number) {
    const q = Math.round(k * 50);
    if (q === this.tintQ) return;
    this.tintQ = q;
    this.tint.style.opacity = String(q / 50);
    this.tint.classList.toggle('on', q > 0);
  }

  // Overdrive: warms the barrel-heat meter on the gunner HUD (body class, toggled on change)
  setOverdrive(on: boolean) {
    if (on === this.hotQ) return;
    this.hotQ = on;
    document.body.classList.toggle('ab-overdrive', on);
  }
}
