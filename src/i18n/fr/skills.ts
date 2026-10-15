// French for ar/skills.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^(\d+) pts?$/, (m) => (+m[1] <= 1 ? `${m[1]} pt` : `${m[1]} pts`)],
  [/^The crew patched her up · \+(\d+)% integrity$/, (m) => `L'équipage l'a rafistolée · +${m[1]} % d'intégrité`],
];

const table: PhraseTable = {
  phrases: {
    // branches
    'Marksman': "Tireur d'élite",
    'Put every round where it counts': 'Chaque balle là où elle compte',
    'Gunnery Sergeant': 'Sergent mitrailleur',
    'Keep the guns hot and talking': 'Gardez les mitrailleuses chaudes et bavardes',
    'Survivor': 'Survivant',
    'Bring her home in one piece': 'Ramenez-la entière',

    // nodes
    'Computing Sight': 'Viseur calculateur',
    "The lead indicator computes with your gun's true muzzle velocity (upgrades and mods included). +6% hit radius.":
      "L'indicateur d'anticipation utilise la vraie vitesse initiale de votre arme (améliorations et modifs comprises). +6 % de rayon d'impact.",
    'Steady Eye': 'Œil sûr',
    '+30% aim assist strength.': "+30 % de force d'aide à la visée.",
    'Vital Points': 'Points vitaux',
    'Critical hits: +30% damage on cockpits and engines.': 'Coups critiques : +30 % de dégâts sur cockpits et moteurs.',
    'Eagle Eye': "Œil d'aigle",
    '+12% hit radius, −20% spread.': "+12 % de rayon d'impact, −20 % de dispersion.",
    'Sweet Spot': 'Point sensible',
    'Boss weak points are 30% larger, armour breaks one part sooner and the hull takes double chip damage before the breach.':
      'Les points faibles des boss sont 30 % plus grands, le blindage cède une pièce plus tôt et la coque subit le double de dégâts légers avant la brèche.',
    'Every 10th round is a guaranteed hit: it flies true onto the bandit nearest your aim (within 8°).':
      "Une balle sur 10 touche à coup sûr : elle file droit sur l'ennemi le plus proche de votre visée (à 8° près).",
    'Barrel Discipline': 'Discipline du canon',
    '−15% barrel heat.': '−15 % de chauffe du canon.',
    'Buffer Tuning': "Réglage de l'amortisseur",
    '+8% rate of fire.': '+8 % de cadence de tir.',
    'Overdrive Drill': 'Entraînement Surrégime',
    'Overdrive lasts 40% longer (8 s → 11.2 s).': 'Le Surrégime dure 40 % plus longtemps (8 s → 11,2 s).',
    'Ready Rack': 'Râtelier prêt',
    'All ability cooldowns −20% (Mustangs, Overdrive, Focus).': 'Recharge de toutes les capacités −20 % (Mustang, Surrégime, Concentration).',
    'Cold Nerves': 'Nerfs d’acier',
    'Focus lasts 50% longer (3 s → 4.5 s).': 'La Concentration dure 50 % plus longtemps (3 s → 4,5 s).',
    'Iron Lungs': 'Poumons de fer',
    'The barrel never overheats: at full heat it keeps firing at 75% rate. Every kill during Overdrive tops it up by 1 s.':
      'Le canon ne surchauffe jamais : à chauffe maximale, il tire encore à 75 % de cadence. Chaque victoire en Surrégime le prolonge de 1 s.',
    'Extra Plating': 'Blindage supplémentaire',
    '−10% damage taken.': '−10 % de dégâts subis.',
    'Flak Suits': 'Gilets pare-éclats',
    'Crew wound chance −40%, yours included.': "Risque de blessure de l'équipage −40 %, vous compris.",
    'Damage Control': 'Contrôle des avaries',
    'Faster field repairs: +50% from kills and between rounds, and the crew patches 0.4% a second after 8 s without a hit.':
      "Réparations plus rapides : +50 % grâce aux victoires et entre les manches, et l'équipage répare 0,4 % par seconde après 8 s sans être touché.",
    'Second Wind': 'Second souffle',
    'Once per mission, when a vital part drops below 25%, the crew patches your aircraft back up by 40%.':
      "Une fois par mission, quand une pièce vitale passe sous 25 %, l'équipage répare votre appareil de 40 %.",
    'Fire Drill': 'Exercice incendie',
    'Extinguishers work 95% of the time (from 75%) and every engine carries two bottles.':
      'Les extincteurs marchent 95 % du temps (au lieu de 75 %) et chaque moteur a deux bouteilles.',
    'Fortress': 'Forteresse',
    'The first heavy cannon hit each round is ignored: it glances off the armour plate.':
      'Le premier obus lourd de chaque manche est ignoré : il ricoche sur la plaque de blindage.',

    // blueprint sheet
    'WAR DEPARTMENT · ARMY AIR FORCES': 'DÉPARTEMENT DE LA GUERRE · ARMY AIR FORCES',
    'TECHNICAL MANUAL TM 1-SK · AERIAL GUNNERY QUALIFICATION': 'MANUEL TECHNIQUE TM 1-SK · QUALIFICATION DE TIR AÉRIEN',
    'Skills': 'Compétences',
    'Long-term qualifications. Points come with every promotion and every {n} XP past Major.':
      'Qualifications durables. Un point à chaque promotion, puis tous les {n} XP après Commandant.',
    'DRAWING NO. SK-1944 · SHEET 1 OF 1 · SCALE NONE': 'PLAN N° SK-1944 · FEUILLE 1 SUR 1 · SANS ÉCHELLE',
    'SKILLS · LONG-TERM QUALIFICATIONS': 'COMPÉTENCES · QUALIFICATIONS DURABLES',
    'SKILL POINT<br/>AVAILABLE': 'POINT DE COMPÉTENCE<br/>DISPONIBLE',
    'SKILL POINTS<br/>AVAILABLE': 'POINTS DE COMPÉTENCE<br/>DISPONIBLES',
    'Earned <b>{e}</b> · spent <b>{s}</b> of {t}': 'Gagnés <b>{e}</b> · dépensés <b>{s}</b> sur {t}',
    'Next point at <b>{n} XP</b> ({m} to go)': 'Prochain point à <b>{n} XP</b> (encore {m})',
    'Refund every skill point. Costs merit.': 'Rembourse tous les points de compétence. Coûte du mérite.',
    'Respec': 'Réattribuer',
    'Respec · {n} merit': 'Réattribuer · {n} mérite',
    'Confirm respec · {n} merit': 'Confirmer · {n} mérite',
    'Qualified': 'Qualifié',
    'Available': 'Disponible',
    'Short of points': 'Points insuffisants',
    'Hover a card for details · click twice to qualify': 'Survolez une carte pour les détails · cliquez deux fois pour la valider',
    'QUALIFIED': 'QUALIFIÉ',
    'AVAILABLE': 'DISPONIBLE',
    'NOT ENOUGH POINTS': 'POINTS INSUFFISANTS',
    'LOCKED': 'VERROUILLÉ',
    'CONFIRM · {pts}': 'CONFIRMER · {pts}',
    'QUALIFY · {pts}': 'VALIDER · {pts}',
    'NEEDS {pts}': 'REQUIERT {pts}',
    '{name}: {desc} {state}, costs {pts}': '{name} : {desc} {state}, coûte {pts}',
    'CAPSTONE': 'SOMMET',
    'Requires: {list}': 'Requiert : {list}',
    'or': 'ou',
    'and': 'et',
    'click twice to qualify': 'cliquez deux fois pour valider',

    // title menu, in flight and debrief
    '1 point to spend': '1 point à dépenser',
    '{n} points to spend': '{n} points à dépenser',
    '{n}/{total} qualified': '{n}/{total} validées',
    'skill points waiting': 'points de compétence en attente',
    'SECOND WIND': 'SECOND SOUFFLE',
    "Patched the worst of it, skipper! She'll hold!": 'Le plus gros est réparé, commandant ! Elle tiendra !',
    "You're streaming smoke but still flying, Blue two. Stay in it!": 'Vous fumez mais vous volez encore, Bleu deux. Restez dans la bagarre !',
    'That one bounced right off the armour plate!': 'Celui-là a ricoché sur le blindage !',
    'FORTRESS — heavy hit glanced off': 'FORTERESSE — obus lourd dévié',
    '+1 skill point': '+1 point de compétence',
    '+{n} skill points': '+{n} points de compétence',
    'Spend in Skills (title menu or hangar)': 'À dépenser dans Compétences (menu principal ou hangar)',
  },
  patterns,
};
export default table;
