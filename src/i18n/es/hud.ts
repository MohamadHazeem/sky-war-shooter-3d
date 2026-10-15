// Spanish for ar/hud.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const kills = (n: string) => `${n} ${+n === 1 ? 'derribo' : 'derribos'}`;

const patterns: Pattern[] = [
  [/^(\d+)%  ·  (\d+) kills?$/, (m) => `${m[1]}%  ·  ${kills(m[2])}`],
  [/^replacement next round · (\d+) kills?$/, (m) => `relevo la próxima ronda · ${kills(m[1])}`],
  [/^AIRFIELD ([\d.]+) km$/, 'AERÓDROMO $1 km'],
  [/^(CONED · )?([\d.]+) km TO FIELD$/, (m) => `${m[1] ? 'EN LOS REFLECTORES · ' : ''}${m[2]} km A LA PISTA`],
  [/^UNDER ATTACK ×(\d+)$/, 'BAJO ATAQUE ×$1'],
  [/^STRAGGLER (\d+)%( — UNDER ATTACK)?$/, (m) => `REZAGADO ${m[1]}%${m[2] ? ' — BAJO ATAQUE' : ''}`],
  [/^IN RANGE (\d+)m$/, 'A TIRO $1m'],
  [/^(\d+)m$/, '$1m'],
  [/^LOCK (\d+)m ([+-]?\d+)mph$/, 'FIJADO $1m $2mph'],
  [/^LOCK (\d+)m$/, 'FIJADO $1m'],
];

const table: PhraseTable = {
  phrases: {
    'ATTACK MY TARGET': 'ATACA MI OBJETIVO',
    'COVER ME': 'CÚBREME',
    'PROTECT THE BOMBERS': 'PROTEGE LOS BOMBARDEROS',
    'FORM UP': 'EN FORMACIÓN',
    'DOWN': 'DERRIBADO',
    '1 ATK  2 COVER  3 BOMBERS  4 FORM': '1 ATQ  2 CUBRIR  3 BOMBARDEROS  4 FORM',
    'P-51 wingman: attack my target': 'Punto P-51: ataca mi objetivo',
    'P-51 wingman: cover me': 'Punto P-51: cúbreme',
    'P-51 wingman: protect the bombers': 'Punto P-51: protege los bombarderos',
    'P-51 wingman: form up': 'Punto P-51: en formación',
    'ATK': 'ATQ',
    'COVER': 'CUBRIR',
    'BOMB': 'BOMB',
    'FORM': 'FORM',
    'Wingman: {order}': 'Punto: {order}',
    'UNDER ATTACK': 'BAJO ATAQUE',
    '<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase':
      '<kbd>T</kbd> fija la vista en el bandido más cercano — la cámara lo sigue mientras vuelas · <kbd>V</kbd> cabina / persecución',
    'NO TARGET': 'SIN OBJETIVO',
    'SPLASHED': 'DERRIBADO',
    'ENGAGING': 'ENTRANDO',
    'ATTACKING': 'ATACANDO',
    'BREAKING': 'ROMPIENDO',
    'SCISSORS': 'TIJERAS',
    'SPIRALLING': 'EN ESPIRAL',
    'EXTENDING': 'ALEJÁNDOSE',
    'CLIMBING': 'TREPANDO',
    'UNLOADING': 'GANANDO VELOCIDAD',
    'HEAD-ON': 'DE FRENTE',
    'COVERING LEAD': 'CUBRE AL LÍDER',
  },
  patterns,
};
export default table;
