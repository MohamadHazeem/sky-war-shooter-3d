// Field Manual entry points (Phase 5 extra goal 36). Owned by TitleExtras, so Game.ts needs
// no new lines:
//   title menu   TitleExtras.onTitle() -> manual.onTitle()   ("Field Manual" in the secondary group)
//   pause menu   a "Manual" button, opening the chapter for the role being played
//   Settings     a "Field Manual" button by Done (title and pause Settings alike)
// The pause and Settings buttons are mounted by watching those screens rebuild themselves
// (UI.pause / UI.settings replace their innerHTML, also after a language switch).
// The H controls card links to the manual itself (ui/ControlsCard.ts).
import type { Game } from './Game';
import { tx } from '../i18n';
import { chapterForRole, type ChapterId, type LinkId } from './FieldManual';
import { openFieldManual } from '../ui/FieldManualScreen';

export class ManualHooks {
  constructor(private game: Game, private openGallery: () => void) {
    const watch = (id: string, mount: (el: HTMLElement) => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      new MutationObserver(() => mount(el)).observe(el, { childList: true });
    };
    watch('pause', (p) => this.mountPause(p));
    watch('settings', (s) => this.mountSettings(s));
  }

  /** Game.startMenu() via TitleExtras.onTitle(): the title-menu entry. */
  onTitle(menu: HTMLElement) {
    menu.querySelector('[data-a="manual"]')?.remove();
    const b = document.createElement('button');
    b.dataset.a = 'manual';
    b.innerHTML = `${tx('Field Manual')} <small>${tx('how to fight · all controls')}</small>`;
    b.addEventListener('click', () => this.open());
    menu.insertBefore(b, menu.querySelector('[data-a="settings"]'));
  }

  open(chapter?: ChapterId) {
    const g = this.game;
    // cross-links only from the title menu (they leave for other screens)
    const links: Partial<Record<LinkId, () => void>> | undefined = g.state === 'menu'
      ? { gallery: () => this.openGallery(), skills: () => g.skills.open(), campaign: () => g.showCampaign() }
      : undefined;
    openFieldManual({ chapter, links });
  }

  private mountPause(p: HTMLElement) {
    const menu = p.querySelector('.menu');
    if (!menu || menu.querySelector('[data-a="manual"]')) return;
    const b = document.createElement('button');
    b.dataset.a = 'manual';
    b.textContent = tx('Manual');
    b.addEventListener('click', () => this.open(chapterForRole(this.game.mission?.role ?? 'gunner')));
    menu.insertBefore(b, menu.querySelector('[data-a="quit"]'));
  }

  private mountSettings(st: HTMLElement) {
    const row = st.querySelector('[data-back]')?.parentElement;
    if (!row || row.querySelector('[data-manual]')) return;
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.dataset.manual = '1';
    b.textContent = tx('Field Manual');
    b.addEventListener('click', () => this.open('settings'));
    row.appendChild(b);
  }
}
