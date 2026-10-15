// The in-mission event banner (Phase 11 goal 28): a small card at the top centre that names what is
// happening in a few words ("NEAR MISS · A Fortress slides right at us"), shown for a few seconds
// while the radio plays the event. One line of state (a chute count) can be updated in place.
// Lives inside #hud (UI.hud() rebuilds it per mission), so show() re-attaches it when dropped.

const CSS = `
#evBanner { position: absolute; left: 50%; top: 13%; transform: translate(-50%, -8px); max-width: min(440px, 86vw); padding: 6px 18px 8px;
  text-align: center; background: rgba(12,14,9,0.72); border: 1px solid rgba(185,167,111,0.5); border-top: 3px solid var(--khaki, #c8b47a);
  opacity: 0; transition: opacity .35s, transform .35s; pointer-events: none; text-shadow: 0 1px 3px rgba(0,0,0,0.85); z-index: 6; }
#evBanner.show { opacity: 1; transform: translate(-50%, 0); }
#evBanner .eb-k { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 3px; color: var(--ink-dim, #a9a48f); }
#evBanner .eb-t { font-size: 21px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--khaki, #c8b47a); line-height: 1.15; margin-top: 1px; }
#evBanner .eb-s { font-family: 'Special Elite', monospace; font-size: 13px; color: var(--ink, #e8e2cc); margin-top: 2px; }
#evBanner.tense { border-top-color: var(--warn, #e0b445); }
#evBanner.tense .eb-t { color: var(--warn, #e0b445); }
#evBanner.loss { border-top-color: var(--bad, #d0523c); }
#evBanner.loss .eb-t { color: #ec8a72; }
/* a gunner frozen on his gun (gunnerFreezes): his station struck through on the station bar */
#hStations span.ev-frozen { color: var(--bad, #d0523c); text-decoration: line-through; animation: evFrozen 1s steps(2) infinite; }
@keyframes evFrozen { 50% { opacity: .45; } }
@media (max-width: 640px) { #evBanner { top: 11%; } #evBanner .eb-t { font-size: 17px; } #evBanner .eb-s { font-size: 12px; } }
@media (prefers-reduced-motion: reduce) { #evBanner { transition: opacity .2s; transform: translate(-50%, 0); } }
`;

export class EventBanner {
  private el: HTMLDivElement | null = null;
  private k!: HTMLElement;
  private t!: HTMLElement;
  private s!: HTMLElement;
  private sub = '';
  shown = false;

  private ensure(): boolean {
    if (typeof document === 'undefined') return false;
    if (!this.el) {
      if (!document.getElementById('evBannerCss')) {
        const st = document.createElement('style');
        st.id = 'evBannerCss'; st.textContent = CSS;
        document.head.appendChild(st);
      }
      const el = document.createElement('div');
      el.id = 'evBanner';
      el.setAttribute('role', 'status');
      el.innerHTML = '<div class="eb-k"></div><div class="eb-t"></div><div class="eb-s"></div>';
      this.k = el.children[0] as HTMLElement; this.t = el.children[1] as HTMLElement; this.s = el.children[2] as HTMLElement;
      this.el = el;
    }
    if (!this.el.isConnected) {
      const hud = document.getElementById('hud');
      if (!hud) return false;
      hud.appendChild(this.el);
    }
    return true;
  }

  show(kicker: string, title: string, sub: string, tone: string) {
    if (!this.ensure()) return;
    const el = this.el!;
    this.k.textContent = kicker;
    this.t.textContent = title;
    this.s.textContent = this.sub = sub;
    el.className = tone;
    void el.offsetWidth;
    el.classList.add('show');
    this.shown = true;
  }

  setSub(sub: string) {
    if (!this.el || sub === this.sub) return;
    this.s.textContent = this.sub = sub;
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.el?.classList.remove('show');
  }
}
