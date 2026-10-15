// Co-op crew intercom glue: push-to-talk (the remappable Talk key, or the hold buttons in the
// lobby and the mission HUD), the microphone (asked for the first time you talk; stopped when the
// session ends), playback through the radio filter (audio/RadioVoice.ts) with per-crewman mute
// and volume, and the talking indicator (ui/IntercomHud.ts). Transport: net/Intercom.ts.
//
// Hooks in CoopSession.ts: constructed with the session; newLink(): addVoiceLines(pc, role);
// onEvent(): 'talk' messages; update(): this.update(dt); reset(): this.reset(); the lobby's
// panel is rendered through CoopScreen's intercom(el) handler.
import { Intercom, loadPrefs, playerPref, savePrefs, setPlayerPref, speakerSource, voiceGain, voiceSlots, type VoiceLink } from '../net/Intercom';
import { RadioVoice } from '../audio/RadioVoice';
import { IntercomHud, type MicState } from '../ui/IntercomHud';
import { keyMap } from '../core/KeyMap';
import { sound } from '../audio/Sound';

export const TALK_KEY = 'KeyY';   // logical code of the Talk action (KeyMap 'talk')
const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;

export interface IntercomSession {
  readonly role: 'host' | 'guest' | null;
  readonly phase: 'idle' | 'lobby' | 'mission' | 'debrief';
  voiceLinks(): VoiceLink[];
  readonly voiceLive: boolean;   // at least one open link (cheap, polled every frame)
  voiceName(id: number): string;
  voiceCrew(): number[];   // crew ids of everyone else aboard
}

export class CrewIntercom {
  readonly net: Intercom;
  prefs = loadPrefs();
  mic: MicState = 'off';
  private voice = new RadioVoice(() => sound.ctx, () => sound.voiceBus());
  private hud: IntercomHud | null = null;
  private stream: MediaStream | null = null;
  private heldKey = false;
  private heldButton = false;
  private shown = '';
  private seen = -1;
  private shownMission = false;

  constructor(private s: IntercomSession, private toast: (text: string) => void) {
    this.net = new Intercom({
      role: () => s.role, links: () => s.voiceLinks(), mic: () => this.liveTrack(),
      onTalk: (id, on) => this.onTalk(id, on),
    });
    if (typeof window === 'undefined') return;
    const field = (e: Event) => FIELD.test((e.target as HTMLElement)?.tagName ?? '');
    // Bubble phase: Input's remap has already turned the player's own key into TALK_KEY
    window.addEventListener('keydown', (e) => { if (e.code === TALK_KEY && !e.repeat && !field(e)) { this.heldKey = true; this.hold(); } });
    window.addEventListener('keyup', (e) => { if (e.code === TALK_KEY) { this.heldKey = false; this.hold(); } });
    window.addEventListener('blur', () => { this.heldKey = this.heldButton = false; this.hold(); });
  }

  private get ui() {
    return this.hud ??= new IntercomHud({
      hold: (d) => { this.heldButton = d; this.hold(); },
      mute: (id) => { const n = this.s.voiceName(id); setPlayerPref(this.prefs, n, { m: !playerPref(this.prefs, n).m }); this.prefsChanged(true); },
      volume: (id, v) => { setPlayerPref(this.prefs, this.s.voiceName(id), { v }); this.prefsChanged(false); },
      master: (v) => { this.prefs.volume = Math.min(1, Math.max(0, v)); this.prefsChanged(false); },
    });
  }

  private get live() { return this.s.role !== null && this.s.phase !== 'idle' && this.s.voiceLive; }

  private liveTrack(): MediaStreamTrack | null {
    const t = this.stream?.getAudioTracks()[0];
    return t && t.readyState === 'live' ? t : null;
  }

  // Key or button held: open the microphone if needed, then transmit
  private hold() {
    const want = (this.heldKey || this.heldButton) && this.live;
    if (!want) { if (this.net.local) { this.net.key(false); this.voice.squelch(false, 0.25); } return; }
    if (this.net.local) return;
    if (this.liveTrack()) { this.net.key(true); if (this.net.local) this.voice.squelch(true, 0.25); return; }
    if (this.mic === 'asking') return;
    if (this.mic === 'blocked') { this.toast('Microphone blocked — text pings still work'); return; }
    void this.openMic().then(ok => { if (ok) this.hold(); });
  }

  private async openMic(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) { this.setMic('blocked'); return false; }
    this.setMic('asking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (!this.live) { stream.getTracks().forEach(t => t.stop()); this.setMic('off'); return false; }
      this.stream = stream;
      this.setMic('on');
      return true;
    } catch {
      this.setMic('blocked');
      this.toast('Microphone blocked — text pings still work');
      return false;
    }
  }

  private setMic(m: MicState) { this.mic = m; this.hud?.micState(m); this.shown = ''; }

  private onTalk(id: number, on: boolean) {
    const role = this.s.role;
    if (!role) return;
    if (on) {
      const src = speakerSource(role, id);
      const link = this.s.voiceLinks().find(l => l.id === src.link);
      this.voice.attach(id, (link && voiceSlots(link.pc)[src.slot]?.receiver.track) || null);
    }
    const name = this.s.voiceName(id);
    this.voice.level(id, voiceGain(this.prefs, name, on));
    if (!playerPref(this.prefs, name).m) this.voice.squelch(on, 0.45 * this.prefs.volume);
  }

  private prefsChanged(rerender: boolean) {
    savePrefs(this.prefs);
    for (const id of this.net.talkers) this.voice.level(id, voiceGain(this.prefs, this.s.voiceName(id), true));
    this.shown = '';
    if (rerender) { const el = document.querySelector<HTMLElement>('#coop [data-intercom]'); if (el) this.lobby(el); }
  }

  // CoopScreen: the lobby was (re)rendered
  lobby(el: HTMLElement) {
    const rows = this.s.voiceCrew().map(id => { const name = this.s.voiceName(id), p = playerPref(this.prefs, name); return { id, name, muted: p.m, volume: p.v }; });
    this.ui.lobby(el, keyMap.label('talk'), this.mic, rows, this.prefs.volume, (id) => this.net.isTalking(id));
    this.shown = '';
  }

  // CoopSession.update (every frame, also in the lobby)
  update(dt: number) {
    this.net.tick(dt);
    if (this.net.local && !((this.heldKey || this.heldButton) && this.live)) this.hold();   // link lost mid-call
    const inMission = this.s.phase === 'mission' && this.s.voiceLive;
    const bound = keyMap.bindings.talk;
    if (inMission === this.shownMission && bound === this.shown && this.seen === this.net.version) return;
    if (!this.hud && !inMission && !this.net.talkers.size) return;
    this.shownMission = inMission; this.shown = bound; this.seen = this.net.version;
    const talkers = [...this.net.talkers].map(id => { const name = this.s.voiceName(id); return { id, name, muted: playerPref(this.prefs, name).m }; });
    this.ui.update(inMission, keyMap.label('talk'), this.net.local, talkers);
  }

  // The co-op session ended: stop transmitting, free the microphone and the playback chains
  reset() {
    this.heldButton = false;
    this.net.reset();
    this.voice.dispose();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.mic !== 'blocked') this.mic = 'off';
    this.shown = '';
    this.hud?.update(false, keyMap.label('talk'), false, []);
  }
}
