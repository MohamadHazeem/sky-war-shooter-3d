import type { Game } from './Game';
import { nextCampaignMission, type HangarRoute, type HangarTab } from './MenuModel';
import { showHangarScreen } from '../ui/HangarScreen';
import { onBackKey, showLayer, esc } from '../ui/serviceCommon';
import { mountCrewRoster } from '../ui/CrewPanel';
import { mountLeaderboard } from '../ui/LeaderboardPanel';
import { showSquadronScreen } from '../ui/SquadronScreen';
import { showCustomBattleScreen } from '../ui/CustomBattleScreen';
import { MODES, mountModePanel } from './Modes';
import { survivalMission } from './Missions';
import { loadSeen, WHATS_NEW_VERSION } from './WhatsNew';
import { tx } from '../i18n';
import { huntMode } from './Mastery';

/** Menu navigation owns its return callbacks; gameplay/dev entry points remain on Game. */
export class SimpleMenu {
  constructor(private g: Game) {}

  title() {
    const g = this.g;
    const notice = loadSeen() !== WHATS_NEW_VERSION || g.prog.skills.available(g.service.career.xp) > 0;
    g.ui.title({
      campaign: () => g.showBriefing(nextCampaignMission(g.progress), () => g.startMenu()),
      survival: () => this.survival(), coop: () => g.coop.openMenu(),
      hangar: () => this.hangar(), settings: () => this.settings(),
    }, nextCampaignMission(g.progress), notice);
  }

  survival(startTab = 'survival', back = () => this.g.startMenu()) {
    const g = this.g;
    const restore = () => this.survival(startTab, back);
    const pick = (m: ReturnType<typeof survivalMission>) => {
      startTab = document.querySelector<HTMLSelectElement>('#survival [data-mode-select]')?.value ?? startTab;
      const expanded = document.querySelector<HTMLDetailsElement>('#survival details')?.open ?? false;
      g.showBriefing(m, () => { restore(); const details = document.querySelector<HTMLDetailsElement>('#survival details'); if (details) details.open = expanded; });
    };
    g.ui.survivalMenu(g.progress, r => pick(survivalMission(r)), back);
    mountModePanel(document.querySelector<HTMLElement>('#survival .box')!, pick, startTab);
  }

  hangar(tab: HangarTab = 'crew') {
    this.g.state = 'menu';
    showHangarScreen(tab, route => {
      const active = document.querySelector<HTMLElement>('#hangarHub [aria-selected="true"]')?.dataset.tab as HangarTab;
      this.open(route, () => this.hangar(active));
    }, () => this.g.startMenu());
  }

  open(route: HangarRoute, back: () => void) {
    const g = this.g;
    switch (route) {
      case 'settings': this.settings(back); break;
      case 'skills': g.skills.open(back); break;
      case 'mastery': g.mastery.open(back); break;
      case 'career': g.service.openCareer(back); break;
      case 'trophies': g.service.openTrophies(back); break;
      case 'daily': g.service.openDaily(back); break;
      case 'squadron': showSquadronScreen(back); break;
      case 'aircraft': g.extras.openGallery(undefined, back); break;
      case 'whatsnew': g.extras.openWhatsNew(back); break;
      case 'manual': g.extras.manual.open(undefined, back); break;
      case 'theatre': g.ui.hideAll(); void g.cine.theatre.openLibrary(back); break;
      case 'campaign': g.showCampaign(back); break;
      case 'tour': g.showTour(back); break;
      case 'custom': {
        const open = () => showCustomBattleScreen({ back, start: m => g.showBriefing(m, open) });
        open(); break;
      }
      case 'weekly': this.survival('weekly', back); break;
      case 'training': g.ui.hideAll(); g.onboarding.startTutorial(); break;
      case 'crew': {
        const root = this.sheet('crewMenu', 'Crew', back);
        mountCrewRoster(root.querySelector('.box')!, g.prog); break;
      }
      case 'armory': case 'customize':
        g.ui.hideAll();
        g.ui.hangar(g.prog, 'gunner', { title: route === 'armory' ? 'Armory' : 'Customize', sub: 'B-17', next: 'Back', section: route }, back);
        break;
      case 'leaderboards': this.leaderboards(back); break;
    }
  }

  private sheet(id: string, title: string, back: () => void) {
    const root = showLayer(id);
    root.innerHTML = `<div class="screen-center"><div class="box panel menu-sheet"><button class="btn ghost menu-back" data-back>${tx('Back')}</button><h2>${tx(title)}</h2></div></div>`;
    root.querySelector<HTMLElement>('[data-back]')!.onclick = back;
    onBackKey(root, back);
    return root;
  }

  private leaderboards(back: () => void) {
    const root = this.sheet('recordsBoards', 'Leaderboards', back);
    const box = root.querySelector<HTMLElement>('.box')!;
    const boards = MODES.flatMap(m => (m.roles ?? ['gunner', 'pilot'] as const).map(role => ({ id: m.board(role), label: `${tx(m.title)} · ${tx(role === 'gunner' ? 'B-17 Gunner' : 'P-51 Escort')}` }))).filter(b => b.id);
    boards.push({ id: huntMode(), label: tx('Weekly Ace Hunt · B-17 Gunner') });   // Gunner Mastery (Mastery.ts)
    box.insertAdjacentHTML('beforeend', `<label>${tx('Mode')} <select data-board>${boards.map(b => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join('')}</select></label><div data-scores></div>`);
    const draw = () => {
      const host = box.querySelector<HTMLElement>('[data-scores]')!;
      host.innerHTML = '';
      mountLeaderboard(host, box.querySelector<HTMLSelectElement>('select')!.value, 'Top scores');
    };
    box.insertAdjacentHTML('beforeend', `<details class="settings-group"><summary>${tx('Local scores')}</summary><table class="leader">${this.g.progress.survival.slice(0, 8).map(r => `<tr><td>${esc(r.date)}</td><td>${r.role === 'pilot' ? 'P-51' : 'B-17'}</td><td>${tx('{n} rounds', { n: r.waves })}</td><td>${r.score}</td></tr>`).join('') || `<tr><td>${tx('No scores yet.')}</td></tr>`}</table></details>`);
    box.querySelector('select')!.onchange = draw;
    draw();
  }

  settings(back = () => this.g.startMenu()) {
    const g = this.g;
    g.ui.hideAll();
    g.ui.openSettings!(back);
  }
}
