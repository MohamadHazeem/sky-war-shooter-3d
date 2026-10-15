// Spanish for ar/skills.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^(\d+) pts?$/, (m) => (+m[1] === 1 ? `${m[1]} pt` : `${m[1]} pts`)],
  [/^The crew patched her up · \+(\d+)% integrity$/, (m) => `La tripulación la ha remendado · +${m[1]} % de integridad`],
];

const table: PhraseTable = {
  phrases: {
    // branches
    'Marksman': 'Tirador de élite',
    'Put every round where it counts': 'Cada bala donde cuenta',
    'Gunnery Sergeant': 'Sargento artillero',
    'Keep the guns hot and talking': 'Mantén las ametralladoras calientes y hablando',
    'Survivor': 'Superviviente',
    'Bring her home in one piece': 'Tráela a casa de una pieza',

    // nodes
    'Computing Sight': 'Mira calculadora',
    "The lead indicator computes with your gun's true muzzle velocity (upgrades and mods included). +6% hit radius.":
      'El indicador de anticipación calcula con la velocidad de salida real de tu arma (mejoras y modificaciones incluidas). +6 % de radio de impacto.',
    'Steady Eye': 'Ojo firme',
    '+30% aim assist strength.': '+30 % de fuerza de la ayuda de puntería.',
    'Vital Points': 'Puntos vitales',
    'Critical hits: +30% damage on cockpits and engines.': 'Impactos críticos: +30 % de daño en cabinas y motores.',
    'Eagle Eye': 'Ojo de águila',
    '+12% hit radius, −20% spread.': '+12 % de radio de impacto, −20 % de dispersión.',
    'Sweet Spot': 'Punto débil',
    'Boss weak points are 30% larger, armour breaks one part sooner and the hull takes double chip damage before the breach.':
      'Los puntos débiles de los jefes son un 30 % más grandes, el blindaje cede una pieza antes y el casco recibe el doble de daño leve antes de la brecha.',
    'Every 10th round is a guaranteed hit: it flies true onto the bandit nearest your aim (within 8°).':
      'Una de cada 10 balas acierta seguro: vuela directa al enemigo más cercano a tu punto de mira (a menos de 8°).',
    'Barrel Discipline': 'Disciplina del cañón',
    '−15% barrel heat.': '−15 % de calor del cañón.',
    'Buffer Tuning': 'Ajuste del amortiguador',
    '+8% rate of fire.': '+8 % de cadencia de tiro.',
    'Overdrive Drill': 'Instrucción de Sobremarcha',
    'Overdrive lasts 40% longer (8 s → 11.2 s).': 'La Sobremarcha dura un 40 % más (8 s → 11,2 s).',
    'Ready Rack': 'Munición a mano',
    'All ability cooldowns −20% (Mustangs, Overdrive, Focus).': 'Recarga de todas las habilidades −20 % (Mustang, Sobremarcha, Concentración).',
    'Cold Nerves': 'Nervios de acero',
    'Focus lasts 50% longer (3 s → 4.5 s).': 'La Concentración dura un 50 % más (3 s → 4,5 s).',
    'Iron Lungs': 'Pulmones de hierro',
    'The barrel never overheats: at full heat it keeps firing at 75% rate. Every kill during Overdrive tops it up by 1 s.':
      'El cañón nunca se sobrecalienta: al máximo calor sigue disparando al 75 % de cadencia. Cada derribo en Sobremarcha la alarga 1 s.',
    'Extra Plating': 'Blindaje adicional',
    '−10% damage taken.': '−10 % de daño recibido.',
    'Flak Suits': 'Chalecos antimetralla',
    'Crew wound chance −40%, yours included.': 'Probabilidad de heridas de la tripulación −40 %, tú incluido.',
    'Damage Control': 'Control de daños',
    'Faster field repairs: +50% from kills and between rounds, and the crew patches 0.4% a second after 8 s without a hit.':
      'Reparaciones más rápidas: +50 % por derribos y entre rondas, y la tripulación repara un 0,4 % por segundo tras 8 s sin impactos.',
    'Second Wind': 'Segundo aliento',
    'Once per mission, when a vital part drops below 25%, the crew patches your aircraft back up by 40%.':
      'Una vez por misión, cuando una parte vital baja del 25 %, la tripulación repara tu avión un 40 %.',
    'Fire Drill': 'Simulacro de incendio',
    'Extinguishers work 95% of the time (from 75%) and every engine carries two bottles.':
      'Los extintores funcionan el 95 % de las veces (antes 75 %) y cada motor lleva dos botellas.',
    'Fortress': 'Fortaleza',
    'The first heavy cannon hit each round is ignored: it glances off the armour plate.':
      'Se ignora el primer impacto de cañón pesado de cada ronda: rebota en la placa de blindaje.',

    // blueprint sheet
    'WAR DEPARTMENT · ARMY AIR FORCES': 'DEPARTAMENTO DE GUERRA · ARMY AIR FORCES',
    'TECHNICAL MANUAL TM 1-SK · AERIAL GUNNERY QUALIFICATION': 'MANUAL TÉCNICO TM 1-SK · CALIFICACIÓN DE TIRO AÉREO',
    'Skills': 'Habilidades',
    'Long-term qualifications. Points come with every promotion and every {n} XP past Major.':
      'Calificaciones permanentes. Ganas puntos con cada ascenso y cada {n} XP después de Comandante.',
    'DRAWING NO. SK-1944 · SHEET 1 OF 1 · SCALE NONE': 'PLANO N.º SK-1944 · HOJA 1 DE 1 · SIN ESCALA',
    'SKILLS · LONG-TERM QUALIFICATIONS': 'HABILIDADES · CALIFICACIONES PERMANENTES',
    'SKILL POINT<br/>AVAILABLE': 'PUNTO DE HABILIDAD<br/>DISPONIBLE',
    'SKILL POINTS<br/>AVAILABLE': 'PUNTOS DE HABILIDAD<br/>DISPONIBLES',
    'Earned <b>{e}</b> · spent <b>{s}</b> of {t}': 'Ganados <b>{e}</b> · gastados <b>{s}</b> de {t}',
    'Next point at <b>{n} XP</b> ({m} to go)': 'Próximo punto a <b>{n} XP</b> (faltan {m})',
    'Refund every skill point. Costs merit.': 'Devuelve todos los puntos de habilidad. Cuesta mérito.',
    'Respec': 'Redistribuir',
    'Respec · {n} merit': 'Redistribuir · {n} mérito',
    'Confirm respec · {n} merit': 'Confirmar · {n} mérito',
    'Qualified': 'Calificado',
    'Available': 'Disponible',
    'Short of points': 'Faltan puntos',
    'Hover a card for details · click twice to qualify': 'Pasa sobre una tarjeta para ver detalles · haz clic dos veces para calificarte',
    'QUALIFIED': 'CALIFICADO',
    'AVAILABLE': 'DISPONIBLE',
    'NOT ENOUGH POINTS': 'PUNTOS INSUFICIENTES',
    'LOCKED': 'BLOQUEADO',
    'CONFIRM · {pts}': 'CONFIRMAR · {pts}',
    'QUALIFY · {pts}': 'CALIFICARSE · {pts}',
    'NEEDS {pts}': 'REQUIERE {pts}',
    '{name}: {desc} {state}, costs {pts}': '{name}: {desc} {state}, cuesta {pts}',
    'CAPSTONE': 'CULMINACIÓN',
    'Requires: {list}': 'Requiere: {list}',
    'or': 'o',
    'and': 'y',
    'click twice to qualify': 'haz clic dos veces para calificarte',

    // title menu, in flight and debrief
    '1 point to spend': '1 punto por gastar',
    '{n} points to spend': '{n} puntos por gastar',
    '{n}/{total} qualified': '{n}/{total} calificadas',
    'skill points waiting': 'puntos de habilidad pendientes',
    'SECOND WIND': 'SEGUNDO ALIENTO',
    "Patched the worst of it, skipper! She'll hold!": '¡Lo peor está remendado, jefe! ¡Aguantará!',
    "You're streaming smoke but still flying, Blue two. Stay in it!": 'Echas humo pero sigues volando, Azul dos. ¡Aguanta!',
    'That one bounced right off the armour plate!': '¡Ese ha rebotado en la placa de blindaje!',
    'FORTRESS — heavy hit glanced off': 'FORTALEZA — impacto pesado desviado',
    '+1 skill point': '+1 punto de habilidad',
    '+{n} skill points': '+{n} puntos de habilidad',
    'Spend in Skills (title menu or hangar)': 'Gástalos en Habilidades (menú principal o hangar)',
  },
  patterns,
};
export default table;
