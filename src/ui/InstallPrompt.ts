import { installOffer, isIosSafari, readMemory, type InstallMemory, type InstallOffer } from '../core/Install';
import { isTouchDevice } from '../core/Touch';
import { tx } from '../i18n';

// The "Install Sky War" card on the title screen (rules in core/Install.ts). DeviceControls
// counts sorties and calls update() a few times a second with whether the title screen shows.

const STORE_KEY = 'sws3d.install.v1';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export class InstallPrompt {
  readonly el: HTMLElement;
  private mem: InstallMemory;
  private deferred: BeforeInstallPromptEvent | null = null;
  private shown: InstallOffer = null;
  private readonly ios = isIosSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0);

  constructor() {
    let raw: string | null = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch { /* storage unavailable */ }
    this.mem = readMemory(raw);
    const el = document.createElement('div');
    el.id = 'installCard';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    this.el = el;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.deferred = e as BeforeInstallPromptEvent; });
    window.addEventListener('appinstalled', () => { this.mem.installed = true; this.save(); this.hide(); });
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.i === 'install') void this.install();
      else this.dismiss();
    });
  }

  private get standalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches
      || (navigator as { standalone?: boolean }).standalone === true;
  }

  /** A mission was started (the card waits for the first sortie). */
  sortie() { this.mem.sorties++; this.save(); }

  update(titleShown: boolean) {
    const offer = titleShown ? installOffer({ standalone: this.standalone, canPrompt: !!this.deferred, ios: this.ios, touch: isTouchDevice() || document.body.classList.contains('touch') }, this.mem, Date.now()) : null;
    if (offer === this.shown) return;
    if (!offer) { this.hide(); return; }
    this.shown = offer;
    this.el.innerHTML = `
      <div class="ic-t">${tx('Install Sky War')}</div>
      <div class="ic-d">${offer === 'ios' ? tx('Tap Share, then “Add to Home Screen” to play full screen, even offline.') : tx('Play full screen from your home screen, even offline.')}</div>
      <div class="ic-b">${offer === 'prompt' ? `<button class="btn" data-i="install">${tx('Install')}</button>` : ''}<button class="btn ghost" data-i="later">${offer === 'ios' ? tx('Got it') : tx('Not now')}</button></div>`;
    this.el.classList.add('show');
  }

  private hide() { this.shown = null; this.el.classList.remove('show'); }

  private async install() {
    const ev = this.deferred;
    this.deferred = null;
    this.hide();
    if (!ev) return;
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === 'accepted') { this.mem.installed = true; this.save(); } else this.dismiss();
    } catch { /* the browser refused: ask again another day */ this.dismiss(); }
  }

  private dismiss() {
    this.mem.dismissals++;
    this.mem.dismissedAt = Date.now();
    this.save();
    this.hide();
  }

  private save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.mem)); } catch { /* storage unavailable */ } }
}
