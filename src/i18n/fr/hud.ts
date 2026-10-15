// French for ar/hud.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const kills = (n: string) => `${n} victoire${+n <= 1 ? '' : 's'}`;

const patterns: Pattern[] = [
  [/^(\d+)%  ·  (\d+) kills?$/, (m) => `${m[1]}%  ·  ${kills(m[2])}`],
  [/^replacement next round · (\d+) kills?$/, (m) => `remplaçant à la prochaine manche · ${kills(m[1])}`],
  [/^AIRFIELD ([\d.]+) km$/, 'AÉRODROME $1 km'],
  [/^(CONED · )?([\d.]+) km TO FIELD$/, (m) => `${m[1] ? 'PRIS DANS LES PROJECTEURS · ' : ''}TERRAIN À ${m[2]} km`],
  [/^UNDER ATTACK ×(\d+)$/, 'ATTAQUÉ ×$1'],
  [/^STRAGGLER (\d+)%( — UNDER ATTACK)?$/, (m) => `TRAÎNARD ${m[1]}%${m[2] ? ' — ATTAQUÉ' : ''}`],
  [/^IN RANGE (\d+)m$/, 'À PORTÉE $1m'],
  [/^(\d+)m$/, '$1m'],
  [/^LOCK (\d+)m ([+-]?\d+)mph$/, 'VERROU $1m $2mph'],
  [/^LOCK (\d+)m$/, 'VERROU $1m'],
];

const table: PhraseTable = {
  phrases: {
    'ATTACK MY TARGET': 'ATTAQUE MA CIBLE',
    'COVER ME': 'COUVRE-MOI',
    'PROTECT THE BOMBERS': 'PROTÈGE LES BOMBARDIERS',
    'FORM UP': 'EN FORMATION',
    'DOWN': 'ABATTU',
    '1 ATK  2 COVER  3 BOMBERS  4 FORM': '1 ATQ  2 COUV  3 BOMB  4 FORM',
    'P-51 wingman: attack my target': 'Ailier P-51 : attaque ma cible',
    'P-51 wingman: cover me': 'Ailier P-51 : couvre-moi',
    'P-51 wingman: protect the bombers': 'Ailier P-51 : protège les bombardiers',
    'P-51 wingman: form up': 'Ailier P-51 : en formation',
    'ATK': 'ATQ',
    'COVER': 'COUV',
    'BOMB': 'BOMB',
    'FORM': 'FORM',
    'Wingman: {order}': 'Ailier : {order}',
    'UNDER ATTACK': 'ATTAQUÉ',
    '<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase':
      '<kbd>T</kbd> verrouille le bandit le plus proche — la vue le suit pendant que vous pilotez · <kbd>V</kbd> cockpit / poursuite',
    'NO TARGET': 'PAS DE CIBLE',
    'SPLASHED': 'ABATTU',
    'ENGAGING': 'ENGAGE',
    'ATTACKING': 'ATTAQUE',
    'BREAKING': 'DÉGAGE',
    'SCISSORS': 'CISEAUX',
    'SPIRALLING': 'EN SPIRALE',
    'EXTENDING': 'S’ÉLOIGNE',
    'CLIMBING': 'MONTE',
    'UNLOADING': 'REPREND DE LA VITESSE',
    'HEAD-ON': 'DE FACE',
    'COVERING LEAD': 'COUVRE SON LEADER',
  },
  patterns,
};
export default table;
