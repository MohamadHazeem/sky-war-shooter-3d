// HUD pieces for the mid-round bonus objectives and the random in-flight events:
//  - the bonus objective card (top left): title, line of orders, progress bar, timer bar,
//    then a COMPLETE / FAILED stamp with the merit paid;
//  - the event prompt (under the sight): what went wrong, the key to press and how far along
//    the fix is, with a draining timer;
//  - floating tags over marked aircraft (pathfinder, the bomber to protect, ...);
//  - the hypoxia overlay (blur + dark tunnel) for the oxygen failure event.
// Everything lives inside #hud, which UI.hud() rebuilds per mission, so ensure() re-attaches
// the elements whenever they have been dropped.

export interface CardView {
  title: string;
  desc: string;
  merit: number;
  progress: number;      // 0..1
  progressText: string;  // e.g. "2 / 3 kills" or "18 s"
  timeFrac: number;      // 0..1 of the time limit left
  timeText: string;
}

export interface PromptView {
  kicker: string;        // e.g. "ENGINE FIRE · NUMBER 2"
  action: string;        // HTML: "<kbd>X</kbd> HOLD OR MASH — EXTINGUISHER"
  hint?: string;
  fill: number;          // 0..1 progress of the fix
  timeFrac: number;      // 0..1 time left before it gets worse / times out
  danger?: boolean;      // pulse red (fire spreading)
}

export interface TagView { x: number; y: number; label: string; dist: number; edge: boolean; kind: 'target' | 'friend' }

import { tx } from '../i18n';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class ObjectiveHud {
  private card = document.createElement('div');
  private prompt = document.createElement('div');
  private hyp = document.createElement('div');
  private tagRoot = document.createElement('div');
  private tags: HTMLElement[] = [];
  private cardKey = '';
  private promptKey = '';
  private cardToken = 0;
  private hypK = -1;

  constructor() {
    this.card.id = 'objCard';
    this.card.innerHTML = `
      <div class="oc-k"><span class="oc-kl">${tx('BONUS OBJECTIVE')}</span><span class="oc-m"></span></div>
      <div class="oc-t"></div>
      <div class="oc-d"></div>
      <div class="oc-row"><div class="oc-bar"><i></i></div><span class="oc-p"></span></div>
      <div class="oc-timer"><i></i></div>
      <div class="oc-res"></div>`;
    this.prompt.id = 'evPrompt';
    this.prompt.innerHTML = `<div class="ev-k"></div><div class="ev-a"></div><div class="ev-bar"><i></i></div><div class="ev-timer"><i></i></div><div class="ev-h"></div>`;
    this.hyp.id = 'hypoxia';
    this.tagRoot.id = 'mrTags';
  }

  // Re-attach after UI.hud() rebuilt the HUD layer
  ensure() {
    if (this.card.isConnected) return;
    const hud = document.getElementById('hud');
    if (!hud) return;
    hud.prepend(this.hyp);   // first child: every other HUD element draws over the blur
    hud.append(this.tagRoot, this.card, this.prompt);
  }

  private q<T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) { return root.querySelector(sel) as T; }

  // ---------- objective card ----------
  showCard(v: CardView) {
    this.ensure();
    this.cardToken++;
    const c = this.card;
    const key = v.title + '|' + v.desc + '|' + v.merit;
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.q(c, '.oc-kl').textContent = tx('BONUS OBJECTIVE');
      this.q(c, '.oc-t').textContent = v.title;
      this.q(c, '.oc-d').textContent = v.desc;
      this.q(c, '.oc-m').textContent = tx('+{n} MERIT', { n: v.merit });
      this.q(c, '.oc-res').textContent = '';
      c.classList.remove('won', 'lost');
    }
    if (!c.classList.contains('show')) c.classList.add('show');
    this.q(c, '.oc-bar i').style.width = `${Math.round(Math.min(1, Math.max(0, v.progress)) * 100)}%`;
    this.q(c, '.oc-p').textContent = v.progressText;
    const tf = Math.min(1, Math.max(0, v.timeFrac));
    const tb = this.q(c, '.oc-timer i');
    tb.style.width = `${(tf * 100).toFixed(1)}%`;
    c.classList.toggle('late', tf < 0.25);
  }

  // Stamp the card COMPLETE / FAILED, then fade it out (real time, so it also clears when
  // the round ends into the hangar and the game loop stops)
  resolveCard(won: boolean, text: string) {
    this.ensure();
    const c = this.card;
    c.classList.add('show');
    c.classList.toggle('won', won);
    c.classList.toggle('lost', !won);
    this.q(c, '.oc-res').textContent = text;
    if (won) this.q(c, '.oc-bar i').style.width = '100%';
    const token = ++this.cardToken;
    window.setTimeout(() => { if (token === this.cardToken) this.hideCard(); }, 3200);
  }

  hideCard() {
    this.cardToken++;
    this.card.classList.remove('show', 'won', 'lost', 'late');
    this.cardKey = '';
  }

  // ---------- event prompt ----------
  showPrompt(v: PromptView) {
    this.ensure();
    const p = this.prompt;
    const key = v.kicker + '|' + v.action + '|' + (v.hint ?? '');
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.q(p, '.ev-k').textContent = v.kicker;
      this.q(p, '.ev-a').innerHTML = v.action;
      this.q(p, '.ev-h').textContent = v.hint ?? '';
    }
    p.classList.add('show');
    p.classList.toggle('danger', !!v.danger);
    this.q(p, '.ev-bar i').style.width = `${Math.round(Math.min(1, Math.max(0, v.fill)) * 100)}%`;
    this.q(p, '.ev-timer i').style.width = `${(Math.min(1, Math.max(0, v.timeFrac)) * 100).toFixed(1)}%`;
  }

  hidePrompt() {
    if (!this.prompt.classList.contains('show')) return;
    this.prompt.classList.remove('show', 'danger');
    this.promptKey = '';
  }

  // ---------- hypoxia ----------
  setHypoxia(k: number) {
    k = Math.round(Math.min(1, Math.max(0, k)) * 100) / 100;
    if (k === this.hypK) return;
    this.hypK = k;
    if (k > 0) this.ensure();
    const h = this.hyp;
    h.style.opacity = String(Math.min(1, k * 1.4));
    // blur ramps late: the picture greys first, then swims
    const blur = Math.max(0, k - 0.25) / 0.75 * 5;
    const f = `blur(${blur.toFixed(2)}px) grayscale(${(k * 0.6).toFixed(2)}) brightness(${(1 - k * 0.25).toFixed(2)})`;
    h.style.backdropFilter = f;
    (h.style as any).webkitBackdropFilter = f;
    h.classList.toggle('on', k > 0);
  }

  // ---------- tags ----------
  setTags(list: TagView[]) {
    if (list.length) this.ensure();
    while (this.tags.length < list.length) {
      const t = document.createElement('div');
      t.className = 'mr-tag';
      t.innerHTML = '<b></b><span></span>';
      this.tagRoot.append(t);
      this.tags.push(t);
    }
    this.tags.forEach((t, i) => {
      const v = list[i];
      if (!v) { t.style.display = 'none'; return; }
      t.style.display = '';
      t.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px) translate(-50%, -100%)`;
      const label = esc(v.label);
      const b = t.firstElementChild as HTMLElement, s = t.lastElementChild as HTMLElement;
      if (b.innerHTML !== label) b.innerHTML = label;
      const d = v.dist < 1000 ? tx('{n} m', { n: Math.round(v.dist) }) : tx('{n} km', { n: (v.dist / 1000).toFixed(1) });
      if (s.textContent !== d) s.textContent = d;
      t.classList.toggle('edge', v.edge);
      t.classList.toggle('friend', v.kind === 'friend');
    });
  }

  hideAll() {
    this.hideCard();
    this.hidePrompt();
    this.setHypoxia(0);
    this.setTags([]);
  }
}
