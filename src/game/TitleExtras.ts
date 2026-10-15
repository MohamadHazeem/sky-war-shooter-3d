import type { Engine } from '../core/Engine';
import type { Game } from './Game';
import { tx, getLang, setLang } from '../i18n';
import { CAMPAIGN, survivalMission } from './Missions';
import { buildCustomMission } from './CustomBattle';
import { showNemesisScreen } from '../ui/NemesisScreen';
import { AircraftGallery } from './AircraftGallery';
import { specById, type AircraftId } from './AircraftData';
import { loadMuseum, type MuseumStats } from './Museum';
import type { CodexCtx } from './Codex';
import { NEWS, WHATS_NEW_VERSION, markSeen, type TryTarget } from './WhatsNew';
import { hideWhatsNew, showWhatsNew } from '../ui/WhatsNewScreen';
import { ManualHooks } from './ManualHooks';

// Optional title features are opened from Hangar; the bulletin never opens itself.
const HIDDEN_LAYERS = new Set(['loading', 'hud', 'whatsNew']);
const BOSS_BRIEF = 'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.';

export class TitleExtras {
  readonly gallery: AircraftGallery;
  readonly manual: ManualHooks;   // Field Manual entries: title, pause, Settings (ManualHooks.ts)
  private returnTo: Element[] = [];
  private onReturn: (() => void) | undefined;
  private galleryBack: (() => void) | undefined;
  private reopenSettings = () => this.game.menus.settings();
  private settingsWatch: MutationObserver | null = null;

  constructor(private game: Game, engine: Engine) {
    this.gallery = new AircraftGallery(engine, {
      kills: (id) => this.kills(id),
      onClose: () => { if (this.galleryBack) this.galleryBack(); else this.backToMenu(); },
      museum: () => this.museumStats(),
      codex: () => this.codexCtx(),
    });
    this.manual = new ManualHooks(game, back => this.openGallery(undefined, back));
  }

  // ---------------- hooks ----------------

  /** Menu Settings extras stay in Advanced and retain their parent return path. */
  onSettings(reopen = () => this.game.menus.settings()) {
    this.reopenSettings = reopen;
    const st = document.getElementById('settings');
    if (!st) return;
    const mount = () => {
      if (this.game.state !== 'menu' || !st.classList.contains('show')) return;
      const row = st.querySelector('.settings-advanced');
      if (!row || row.querySelector('[data-whatsnew]')) return;
      const b = document.createElement('button');
      b.className = 'btn ghost';
      b.dataset.whatsnew = '1';
      b.textContent = tx("What's new");
      b.addEventListener('click', () => this.openWhatsNew(this.reopenSettings));
      row.appendChild(b);
      const credits = document.createElement('button');
      credits.className = 'btn ghost'; credits.textContent = tx('Credits');
      credits.onclick = () => this.game.ui.credits(this.reopenSettings);
      row.appendChild(credits);
    };
    mount();
    // the screen rebuilds itself after a language switch
    if (!this.settingsWatch) {
      this.settingsWatch = new MutationObserver(mount);
      this.settingsWatch.observe(st, { childList: true });
    }
  }

  // ---------------- What's new ----------------

  openWhatsNew(back?: () => void) {
    this.onReturn = back;
    markSeen();
    this.returnTo = Array.from(document.querySelectorAll('.layer.show')).filter((l) => !HIDDEN_LAYERS.has(l.id));
    showWhatsNew(NEWS, WHATS_NEW_VERSION, { tryIt: (id) => this.tryIt(id), close: () => this.closeWhatsNew() });
  }

  private closeWhatsNew() {
    hideWhatsNew();
    for (const l of this.returnTo) if (l.isConnected) l.classList.add('show');
    this.returnTo = [];
    if (this.onReturn) this.onReturn(); else this.backToMenu();
  }

  /** "Try it": straight to the feature. */
  tryIt(id: TryTarget) {
    const g = this.game;
    hideWhatsNew();
    this.returnTo = [];
    const parent = this.onReturn;
    const back = () => this.openWhatsNew(parent);
    const titleButton = (a: string) => document.querySelector<HTMLElement>(`#title .menu [data-a="${a}"]`)?.click();
    switch (id) {
      case 'campaign': g.showCampaign(back); break;
      case 'takeoff': g.showBriefing(CAMPAIGN[0], back); break;   // B-17 campaign missions start with the take-off
      case 'boss': g.showBriefing(buildCustomMission({ role: 'gunner', boss: true, bossRound: 1, rounds: 2 }, { title: 'Boss battle groups', briefing: [BOSS_BRIEF] }), back); break;
      case 'interior': g.showBriefing(survivalMission('gunner'), back); break;   // straight into the waist
      case 'specials': this.openModes('raid', back); break;
      case 'wingman': g.showBriefing(survivalMission('pilot'), back); break;     // a wingman flies in every P-51 mission
      case 'nemesis': showNemesisScreen({ back }); break;
      case 'skills': g.skills.open(back); break;
      case 'custom': this.openModes('custom', back); break;
      case 'theatre': void g.cine.theatre.openLibrary(back); break;
      case 'coop': g.coop.openMenu(back); break;
      case 'arabic':
        if (getLang() !== 'ar') { setLang('ar'); g.startMenu(); this.openWhatsNew(); }
        else titleButton('settings');
        break;
    }
  }

  // The Survival screen opened on one of its mode tabs (P-51 operations, Custom Battle)
  private openModes(tab: string, back?: () => void) {
    this.game.menus.survival(tab, back ?? this.onReturn ?? (() => this.game.startMenu()));
  }

  // ---------------- gallery ----------------

  openGallery(id?: AircraftId, back?: () => void) {
    this.galleryBack = back;
    this.gallery.open(id);
  }

  /** Museum fact unlocks: encounters (Museum.ts log), career kills and missions. */
  museumStats(): MuseumStats {
    const seen = loadMuseum().seen;
    return { seen: (id) => seen[id] ?? 0, kills: (id) => this.kills(id) ?? 0, missions: this.game.service?.career?.missions ?? 0 };
  }

  private codexCtx(): CodexCtx {
    const c = this.game.service?.career, p = this.game.progress;
    return { medals: (name) => c?.medals[name] ?? 0, flown: (id) => !!c?.campaignWins.includes(id) || !!p?.medals?.[id]?.length };
  }

  private kills(id: AircraftId): number | null {
    if (specById(id).side === 'allied') return null;
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
