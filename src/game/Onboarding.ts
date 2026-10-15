import { controlsHintShown, hudRuntime } from '../ui/HudDetail';
import { shouldStartFirstFlight } from './MenuModel';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import { sound } from '../audio/Sound';
import { Tutorial, TUTORIAL } from './Tutorial';
import { GunneryRange, type RangeResult } from './GunneryRange';
import { Hints } from './Hints';
import { ControlsCard, ControlsHint } from '../ui/ControlsCard';
import '../ui/onboarding.css';

// First-time player experience, kept out of Game.ts: the Gunnery School tutorial (offered
// automatically for new profiles), the H/F1 controls card, the
// "H — controls" reminder and the once-per-profile context hints.
//
// Game.ts hooks (see each method): constructor, startMenu → onTitle(),
// startMission → onMissionStart(m), direct → direct(dt, m), frame → update(dt).

const KEY = 'sws3d.onboarding.v1';

interface Saved { tutorialDone: boolean; promptDismissed: boolean; missions?: number }

// Private Game methods the onboarding needs, handed over by Game's constructor
export interface OnboardingHost {
  awardPerk(label: string): void;
  showCampaign(): void;
  rangeDone(r: RangeResult): void;   // a gunnery range drill ended: back to the range screen with the result
}

export class Onboarding {
  readonly tutorial: Tutorial;
  readonly range: GunneryRange;   // the Gunnery Range's practice flights (GunneryRange.ts), same hooks as the school
  readonly hints: Hints;
  readonly card = new ControlsCard();
  private hint = new ControlsHint();
  private saved: Saved;
  private hintT = 0;   // seconds of live play since the mission started (the reminder's own clock)

  constructor(private game: Game, private engine: Engine, private input: Input, private ui: UI, host: OnboardingHost) {
    this.saved = { tutorialDone: false, promptDismissed: false };
    try { Object.assign(this.saved, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* storage unavailable */ }
    this.hints = new Hints(game, ui);
    this.tutorial = new Tutorial(game, engine, ui, {
      awardPerk: (l) => host.awardPerk(l),
      showCampaign: () => host.showCampaign(),
      onDone: () => { this.saved.tutorialDone = true; this.save(); },
      markHint: (id) => this.hints.markSeen(id),
    });
    this.range = new GunneryRange(game, { done: (r) => host.rangeDone(r) });
    this.card.onClose = () => this.closeCard();
    // registered after Game's own key handler, so Esc closing the card never also pauses
    window.addEventListener('keydown', (e) => {
      const toggle = e.code === 'KeyH' || e.code === 'F1';
      if (this.card.open) {
        if (toggle || e.code === 'Escape') { e.preventDefault(); this.closeCard(); }
        return;
      }
      if (toggle && !e.repeat && this.game.state === 'playing' && this.game.mission && !this.game.photo.active) {
        e.preventDefault();
        this.openCard();
      }
    });
  }

  get tutorialDone() { return this.saved.tutorialDone; }

  private save() { try { localStorage.setItem(KEY, JSON.stringify(this.saved)); } catch { /* storage unavailable */ } }

  // Dev/test: forget the tutorial and every hint
  reset() {
    this.saved = { tutorialDone: false, promptDismissed: false };
    this.save();
    this.hints.reset();
  }

  startTutorial() {
    this.saved.promptDismissed = true;
    this.save();
    this.game.startMission(TUTORIAL);
  }

  // ---------------- hooks ----------------
  // Game.startMenu(): first flight starts once; no prompt overlays the title.
  onTitle() {
    this.tutorial.stop();
    this.range.stop();
    if (this.card.open) { this.card.hide(); }
    this.hint.set(false);
    if (shouldStartFirstFlight(this.saved, this.game.progress, this.game.service.career.missions)) {
      this.startTutorial();
    }
  }

  // Game.startMission(), at the end
  onMissionStart(m: Mission) {
    if (this.card.open) this.card.hide();
    this.hints.onMissionStart();
    this.hintT = 0;
    if (!m.tutorial) { this.saved.missions = (this.saved.missions ?? 0) + 1; this.save(); }
    if (m.tutorial && !m.range) this.tutorial.start(); else this.tutorial.stop();
    if (m.range) this.range.start(); else this.range.stop();
  }

  // Game.direct(): the tutorial replaces the director, waves and end conditions
  direct(dt: number, m: Mission): boolean {
    if (!m.tutorial) return false;
    if (m.range) this.range.update(dt); else this.tutorial.update(dt);
    return true;
  }

  // Game.frame(), every frame
  update(dt: number) {
    const g = this.game;
    // own clock of live play, not world.time: photo mode freezes world.time with the state still
    // 'playing' (the reminder stayed up for as long as the photo session) and kill-cam slow motion
    // stretched it; it also goes as soon as the mission is ending
    const playing = !!g.mission && g.state === 'playing' && !g.photo.active && g.input.enabled;
    if (playing) this.hintT += dt;
    this.hint.set(controlsHintShown({ missions: this.saved.missions ?? 0, detail: hudRuntime.detail, playing, t: this.hintT, cardOpen: this.card.open }));
    if (this.tutorial.active && g.state !== 'playing' && g.state !== 'paused' && g.state !== 'ending') this.tutorial.stop();
    if (this.range.active && g.state !== 'playing' && g.state !== 'paused' && g.state !== 'ending') this.range.stop();
    this.hints.update(dt);
  }

  // ---------------- controls card ----------------
  private openCard() {
    const g = this.game;
    g.state = 'paused';
    this.engine.paused = true;
    this.input.unlock();
    sound.ctx?.suspend();
    this.card.show(g.mission!.role);
    this.hint.set(false);
  }

  private closeCard() {
    if (!this.card.open) return;
    this.card.hide();
    if (this.game.state === 'paused') this.game.resume();
  }
}
