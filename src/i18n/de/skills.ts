// German for ar/skills.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^(\d+) pts?$/, (m) => `${m[1]} Pkt.`],
  [/^The crew patched her up · \+(\d+)% integrity$/, (m) => `Die Crew hat sie geflickt · +${m[1]} % Zustand`],
];

const table: PhraseTable = {
  phrases: {
    // branches
    'Marksman': 'Scharfschütze',
    'Put every round where it counts': 'Jeder Schuss dahin, wo er zählt',
    'Gunnery Sergeant': 'Schützen-Sergeant',
    'Keep the guns hot and talking': 'Halt die MGs heiß und am Reden',
    'Survivor': 'Überlebender',
    'Bring her home in one piece': 'Bring sie heil nach Hause',

    // nodes
    'Computing Sight': 'Rechenvisier',
    "The lead indicator computes with your gun's true muzzle velocity (upgrades and mods included). +6% hit radius.":
      'Der Vorhalteanzeiger rechnet mit der echten Mündungsgeschwindigkeit deiner Waffe (inkl. Upgrades und Mods). +6 % Trefferradius.',
    'Steady Eye': 'Ruhiges Auge',
    '+30% aim assist strength.': '+30 % Zielhilfe-Stärke.',
    'Vital Points': 'Lebenswichtige Stellen',
    'Critical hits: +30% damage on cockpits and engines.': 'Kritische Treffer: +30 % Schaden an Cockpits und Motoren.',
    'Eagle Eye': 'Adlerauge',
    '+12% hit radius, −20% spread.': '+12 % Trefferradius, −20 % Streuung.',
    'Sweet Spot': 'Schwachpunkt',
    'Boss weak points are 30% larger, armour breaks one part sooner and the hull takes double chip damage before the breach.':
      'Boss-Schwachstellen sind 30 % größer, die Panzerung bricht ein Teil früher und der Rumpf nimmt vor dem Durchbruch doppelten Streifschaden.',
    'Every 10th round is a guaranteed hit: it flies true onto the bandit nearest your aim (within 8°).':
      'Jeder 10. Schuss trifft garantiert: Er fliegt direkt auf den Gegner, der deinem Zielpunkt am nächsten ist (innerhalb 8°).',
    'Barrel Discipline': 'Laufdisziplin',
    '−15% barrel heat.': '−15 % Laufhitze.',
    'Buffer Tuning': 'Puffer-Tuning',
    '+8% rate of fire.': '+8 % Feuerrate.',
    'Overdrive Drill': 'Overdrive-Drill',
    'Overdrive lasts 40% longer (8 s → 11.2 s).': 'Overdrive hält 40 % länger (8 s → 11,2 s).',
    'Ready Rack': 'Bereitschaftsgestell',
    'All ability cooldowns −20% (Mustangs, Overdrive, Focus).': 'Alle Abklingzeiten −20 % (Mustangs, Overdrive, Fokus).',
    'Cold Nerves': 'Kalte Nerven',
    'Focus lasts 50% longer (3 s → 4.5 s).': 'Fokus hält 50 % länger (3 s → 4,5 s).',
    'Iron Lungs': 'Eiserne Lunge',
    'The barrel never overheats: at full heat it keeps firing at 75% rate. Every kill during Overdrive tops it up by 1 s.':
      'Der Lauf überhitzt nie: Bei voller Hitze feuert er mit 75 % Rate weiter. Jeder Abschuss im Overdrive verlängert ihn um 1 s.',
    'Extra Plating': 'Zusatzpanzerung',
    '−10% damage taken.': '−10 % erlittener Schaden.',
    'Flak Suits': 'Splitterschutzwesten',
    'Crew wound chance −40%, yours included.': 'Verwundungsrisiko der Crew −40 %, deins eingeschlossen.',
    'Damage Control': 'Schadensbekämpfung',
    'Faster field repairs: +50% from kills and between rounds, and the crew patches 0.4% a second after 8 s without a hit.':
      'Schnellere Feldreparaturen: +50 % durch Abschüsse und zwischen den Runden, und die Crew flickt 0,4 % pro Sekunde nach 8 s ohne Treffer.',
    'Second Wind': 'Zweiter Atem',
    'Once per mission, when a vital part drops below 25%, the crew patches your aircraft back up by 40%.':
      'Einmal pro Einsatz, wenn ein wichtiges Teil unter 25 % fällt, flickt die Crew dein Flugzeug um 40 % auf.',
    'Fire Drill': 'Brandschutzübung',
    'Extinguishers work 95% of the time (from 75%) and every engine carries two bottles.':
      'Feuerlöscher wirken zu 95 % (statt 75 %) und jeder Motor hat zwei Flaschen.',
    'Fortress': 'Festung',
    'The first heavy cannon hit each round is ignored: it glances off the armour plate.':
      'Der erste schwere Kanonentreffer jeder Runde wird ignoriert: Er prallt an der Panzerplatte ab.',

    // blueprint sheet
    'WAR DEPARTMENT · ARMY AIR FORCES': 'KRIEGSMINISTERIUM · ARMY AIR FORCES',
    'TECHNICAL MANUAL TM 1-SK · AERIAL GUNNERY QUALIFICATION': 'TECHNISCHES HANDBUCH TM 1-SK · BORDSCHÜTZEN-QUALIFIKATION',
    'Skills': 'Fähigkeiten',
    'Long-term qualifications. Points come with every promotion and every {n} XP past Major.':
      'Dauerhafte Qualifikationen. Punkte gibt es bei jeder Beförderung und alle {n} EP nach Major.',
    'DRAWING NO. SK-1944 · SHEET 1 OF 1 · SCALE NONE': 'ZEICHNUNG NR. SK-1944 · BLATT 1 VON 1 · OHNE MASSSTAB',
    'SKILLS · LONG-TERM QUALIFICATIONS': 'FÄHIGKEITEN · DAUERHAFTE QUALIFIKATIONEN',
    'SKILL POINT<br/>AVAILABLE': 'FÄHIGKEITSPUNKT<br/>VERFÜGBAR',
    'SKILL POINTS<br/>AVAILABLE': 'FÄHIGKEITSPUNKTE<br/>VERFÜGBAR',
    'Earned <b>{e}</b> · spent <b>{s}</b> of {t}': 'Verdient <b>{e}</b> · ausgegeben <b>{s}</b> von {t}',
    'Next point at <b>{n} XP</b> ({m} to go)': 'Nächster Punkt bei <b>{n} EP</b> (noch {m})',
    'Refund every skill point. Costs merit.': 'Alle Fähigkeitspunkte zurückerstatten. Kostet Verdienst.',
    'Respec': 'Neu verteilen',
    'Respec · {n} merit': 'Neu verteilen · {n} Verdienst',
    'Confirm respec · {n} merit': 'Neu verteilen bestätigen · {n} Verdienst',
    'Qualified': 'Qualifiziert',
    'Available': 'Verfügbar',
    'Short of points': 'Zu wenig Punkte',
    'Hover a card for details · click twice to qualify': 'Karte überfahren für Details · zweimal klicken zum Qualifizieren',
    'QUALIFIED': 'QUALIFIZIERT',
    'AVAILABLE': 'VERFÜGBAR',
    'NOT ENOUGH POINTS': 'ZU WENIG PUNKTE',
    'LOCKED': 'GESPERRT',
    'CONFIRM · {pts}': 'BESTÄTIGEN · {pts}',
    'QUALIFY · {pts}': 'QUALIFIZIEREN · {pts}',
    'NEEDS {pts}': 'BRAUCHT {pts}',
    '{name}: {desc} {state}, costs {pts}': '{name}: {desc} {state}, kostet {pts}',
    'CAPSTONE': 'KRÖNUNG',
    'Requires: {list}': 'Benötigt: {list}',
    'or': 'oder',
    'and': 'und',
    'click twice to qualify': 'zweimal klicken zum Qualifizieren',

    // title menu, in flight and debrief
    '1 point to spend': '1 Punkt zu vergeben',
    '{n} points to spend': '{n} Punkte zu vergeben',
    '{n}/{total} qualified': '{n}/{total} qualifiziert',
    'skill points waiting': 'Fähigkeitspunkte warten',
    'SECOND WIND': 'ZWEITER ATEM',
    "Patched the worst of it, skipper! She'll hold!": 'Das Schlimmste ist geflickt, Skipper! Sie hält!',
    "You're streaming smoke but still flying, Blue two. Stay in it!": 'Du ziehst Rauch, aber du fliegst noch, Blau zwei. Bleib dran!',
    'That one bounced right off the armour plate!': 'Der ist glatt an der Panzerplatte abgeprallt!',
    'FORTRESS — heavy hit glanced off': 'FESTUNG — schwerer Treffer abgeprallt',
    '+1 skill point': '+1 Fähigkeitspunkt',
    '+{n} skill points': '+{n} Fähigkeitspunkte',
    'Spend in Skills (title menu or hangar)': 'Unter Fähigkeiten ausgeben (Hauptmenü oder Hangar)',
  },
  patterns,
};
export default table;
