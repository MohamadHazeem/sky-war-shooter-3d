// German for ar/hud.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const kills = (n: string) => `${n} ${+n === 1 ? 'Abschuss' : 'Abschüsse'}`;

const patterns: Pattern[] = [
  [/^(\d+)%  ·  (\d+) kills?$/, (m) => `${m[1]}%  ·  ${kills(m[2])}`],
  [/^replacement next round · (\d+) kills?$/, (m) => `Ersatz nächste Runde · ${kills(m[1])}`],
  [/^AIRFIELD ([\d.]+) km$/, 'FLUGPLATZ $1 km'],
  [/^(CONED · )?([\d.]+) km TO FIELD$/, (m) => `${m[1] ? 'IM SCHEINWERFERKEGEL · ' : ''}${m[2]} km ZUM PLATZ`],
  [/^UNDER ATTACK ×(\d+)$/, 'UNTER BESCHUSS ×$1'],
  [/^STRAGGLER (\d+)%( — UNDER ATTACK)?$/, (m) => `NACHZÜGLER ${m[1]}%${m[2] ? ' — UNTER BESCHUSS' : ''}`],
  [/^IN RANGE (\d+)m$/, 'IN REICHWEITE $1m'],
  [/^(\d+)m$/, '$1m'],
  [/^LOCK (\d+)m ([+-]?\d+)mph$/, 'AUFGESCHALTET $1m $2mph'],
  [/^LOCK (\d+)m$/, 'AUFGESCHALTET $1m'],
];

const table: PhraseTable = {
  phrases: {
    'ATTACK MY TARGET': 'GREIF MEIN ZIEL AN',
    'COVER ME': 'DECK MICH',
    'PROTECT THE BOMBERS': 'SCHÜTZ DIE BOMBER',
    'FORM UP': 'FORMATION',
    'DOWN': 'ABGESCHOSSEN',
    '1 ATK  2 COVER  3 BOMBERS  4 FORM': '1 ANGR  2 DECK  3 BOMBER  4 FORM',
    'P-51 wingman: attack my target': 'P-51-Rottenflieger: Greif mein Ziel an',
    'P-51 wingman: cover me': 'P-51-Rottenflieger: Deck mich',
    'P-51 wingman: protect the bombers': 'P-51-Rottenflieger: Schütz die Bomber',
    'P-51 wingman: form up': 'P-51-Rottenflieger: Formation',
    'ATK': 'ANGR',
    'COVER': 'DECK',
    'BOMB': 'BOMB',
    'FORM': 'FORM',
    'Wingman: {order}': 'Rottenflieger: {order}',
    'UNDER ATTACK': 'UNTER BESCHUSS',
    '<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase':
      '<kbd>T</kbd> schaltet den nächsten Feind auf — die Sicht folgt ihm, während du fliegst · <kbd>V</kbd> Cockpit / Verfolgung',
    'NO TARGET': 'KEIN ZIEL',
    'SPLASHED': 'ABGESCHOSSEN',
    'ENGAGING': 'GREIFT AN',
    'ATTACKING': 'ATTACKIERT',
    'BREAKING': 'BRICHT AB',
    'SCISSORS': 'SCHERE',
    'SPIRALLING': 'SPIRALE',
    'EXTENDING': 'SETZT SICH AB',
    'CLIMBING': 'STEIGT',
    'UNLOADING': 'NIMMT FAHRT AUF',
    'HEAD-ON': 'FRONTAL',
    'COVERING LEAD': 'DECKT FÜHRER',
  },
  patterns,
};
export default table;
