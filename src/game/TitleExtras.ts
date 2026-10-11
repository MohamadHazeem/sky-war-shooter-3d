import { showSquadronScreen } from '../ui/SquadronScreen';
import type { Engine } from '../core/Engine';
import type { Game } from './Game';
import { tx, getLang, setLang } from '../i18n';
import { CAMPAIGN, survivalMission } from './Missions';
import { buildCustomMission } from './CustomBattle';
import { mountModePanel } from './Modes';
import { showNemesisScreen } from '../ui/NemesisScreen';
import { AircraftGallery } from './AircraftGallery';
import type { AircraftId } from './AircraftData';
import { NEWS, WHATS_NEW_VERSION, loadSeen, markSeen, shouldShow, type TryTarget } from './WhatsNew';
import { hideWhatsNew, showWhatsNew } from '../ui/WhatsNewScreen';
import { ManualHooks } from './ManualHooks';

// Title-menu extras (Phase 5 goal 28): the "What's new" bulletin and the aircraft recognition
// gallery. Kept out of Game.ts; Game's hooks:
//   constructor          this.extras = new TitleExtras(this, engine)
//   startMenu()          this.extras.onTitle()      (menu entries + the once-per-version bulletin)
//   title Settings       this.extras.onSettings()   ("What's new" button on the Settings screen)
// The bulletin opens by itself once per WHATS_NEW_VERSION (localStorage sws3d.seenVersion);
// for a brand-new player only after the first-launch training prompt has been answered.

const HIDDEN_LAYERS = new Set(['loading', 'hud', 'whatsNew']);
const BOSS_BRIEF = 'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.';

export class TitleExtras {
  readonly gallery: AircraftGallery;
  readonly manual: ManualHooks;   // Field Manual entries: title, pause, Settings (ManualHooks.ts)
  private returnTo: Element[] = [];
  private promptWatch: MutationObserver | null = null;
  private settingsWatch: MutationObserver | null = null;
  private openTimer = 0;

  constructor(private game: Game, engine: Engine) {
    this.gallery = new AircraftGallery(engine, {
      kills: (id) => this.kills(id),
      onClose: () => this.backToMenu(),
    });
    this.manual = new ManualHooks(game, () => this.openGallery());
  }

  // ---------------- hooks ----------------

  /** Game.startMenu(), after the other title entries: menu buttons, then maybe the bulletin. */
  onTitle() {
    const menu = document.querySelector<HTMLElement>('#title .menu');
    if (!menu) return;
    const add = (a: string, html: string, onClick: () => void) => {
      menu.querySelector(`[data-a="${a}"]`)?.remove();
      const b = document.createElement('button');
      b.dataset.a = a;
      b.innerHTML = html;
      b.addEventListener('click', onClick);
      menu.insertBefore(b, menu.querySelector('[data-a="settings"]'));
    };
    add('squadron', tx('Squadron'), () => showSquadronScreen(() => this.game.startMenu()));
    add('aircraft', `${tx('Aircraft')} <small>${tx('recognition · quiz')}</small>`, () => this.openGallery());
    add('whatsnew', `${tx("What's new")} <small>${tx('bulletin · version {v}', { v: WHATS_NEW_VERSION })}</small>`, () => this.openWhatsNew());
    this.manual.onTitle(menu);
    this.promptWatch?.disconnect();
    this.promptWatch = null;
    clearTimeout(this.openTimer);
    const title = document.getElementById('title')!;
    const promptUp = () => !!title.querySelector('.ob-prompt');
    if (shouldShow(loadSeen(), promptUp())) this.openSoon();
    else if (loadSeen() !== WHATS_NEW_VERSION) {
      // brand-new player: wait until the training prompt is answered (Skip); taking the
      // course leaves the title, and the bulletin waits for the next title screen
      this.promptWatch = new MutationObserver(() => {
        if (promptUp()) return;
        this.promptWatch?.disconnect();
        this.promptWatch = null;
        this.openSoon();
      });
      this.promptWatch.observe(title, { childList: true });
    }
  }

  /** The Settings screen opened from the title: a "What's new" button by Done. */
  onSettings() {
    const st = document.getElementById('settings');
    if (!st) return;
    const mount = () => {
      if (this.game.state !== 'menu' || !st.classList.contains('show')) return;
      const row = st.querySelector('[data-back]')?.parentElement;
      if (!row || row.querySelector('[data-whatsnew]')) return;
      const b = document.createElement('button');
      b.className = 'btn ghost';
      b.dataset.whatsnew = '1';
      b.textContent = tx("What's new");
      b.addEventListener('click', () => this.openWhatsNew());
      row.appendChild(b);
    };
    mount();
    // the screen rebuilds itself after a language switch
    if (!this.settingsWatch) {
      this.settingsWatch = new MutationObserver(mount);
      this.settingsWatch.observe(st, { childList: true });
    }
  }

  // ---------------- What's new ----------------

  private openSoon() {
    clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(() => {
      const title = document.getElementById('title');
      if (this.game.state === 'menu' && title?.classList.contains('show') && !this.gallery.active) this.openWhatsNew();
    }, 450);
  }

  openWhatsNew() {
    clearTimeout(this.openTimer);
    markSeen();
    this.returnTo = Array.from(document.querySelectorAll('.layer.show')).filter((l) => !HIDDEN_LAYERS.has(l.id));
    showWhatsNew(NEWS, WHATS_NEW_VERSION, { tryIt: (id) => this.tryIt(id), close: () => this.closeWhatsNew() });
  }

  private closeWhatsNew() {
    hideWhatsNew();
    for (const l of this.returnTo) if (l.isConnected) l.classList.add('show');
    this.returnTo = [];
    this.backToMenu();
  }

  /** "Try it": straight to the feature. */
  tryIt(id: TryTarget) {
    const g = this.game;
    hideWhatsNew();
    this.returnTo = [];
    const titleButton = (a: string) => document.querySelector<HTMLElement>(`#title .menu [data-a="${a}"]`)?.click();
    switch (id) {
      case 'campaign': g.showCampaign(); break;
      case 'takeoff': g.showBriefing(CAMPAIGN[0]); break;   // B-17 campaign missions start with the take-off
      case 'boss': g.showBriefing(buildCustomMission({ role: 'gunner', boss: true, bossRound: 1, rounds: 2 }, { title: 'Boss battle groups', briefing: [BOSS_BRIEF] })); break;
      case 'interior': g.showBriefing(survivalMission('gunner')); break;   // straight into the waist
      case 'specials': this.openModes('raid'); break;
      case 'wingman': g.showBriefing(survivalMission('pilot')); break;     // a wingman flies in every P-51 mission
      case 'nemesis': showNemesisScreen({ back: () => g.startMenu() }); break;
      case 'skills': g.skills.open(); break;
      case 'custom': this.openModes('custom'); break;
      case 'theatre': void g.cine.theatre.openLibrary(); break;
      case 'coop': titleButton('coop'); break;
      case 'arabic':
        if (getLang() !== 'ar') { setLang('ar'); g.startMenu(); this.openWhatsNew(); }
        else titleButton('settings');
        break;
    }
  }

  // The Survival screen opened on one of its mode tabs (P-51 operations, Custom Battle)
  private openModes(tab: string) {
    const g = this.game;
    g.ui.survivalMenu(g.progress, (r) => g.showBriefing(survivalMission(r)), () => g.startMenu());
    const host = document.querySelector<HTMLElement>('#survival .box');
    if (host) mountModePanel(host, (m) => g.showBriefing(m), tab);
  }

  // ---------------- gallery ----------------

  openGallery(id?: AircraftId) {
    clearTimeout(this.openTimer);
    this.gallery.open(id);
  }

  private kills(id: AircraftId): number | null {
    if (id === 'b17' || id === 'p51d') return null;
    const c = this.game.service?.career;
    if (!c) return 0;
    return id === 'boss' ? c.bosses ?? 0 : c.killsByType[id] ?? 0;
  }

  // A screen of ours closed: back to the title menu, unless another screen is already up
  private backToMenu() {
    if (this.game.state !== 'menu') return;
    const up = Array.from(document.querySelectorAll('.layer.show')).some((l) => !HIDDEN_LAYERS.has(l.id));
    if (!up && !document.getElementById('theatreLib')) document.getElementById('title')?.classList.add('show');
  }
}
