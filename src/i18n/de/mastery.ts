// German for ar/mastery.ts (same keys and patterns).
import type { PhraseTable } from '../types';

const table: PhraseTable = {
  phrases: {
    // menu
    'Gunner Mastery': 'Schützen-Meisterschaft',
    'Station ranks, challenges and unlocks': 'Stationsränge, Herausforderungen und Freischaltungen',
    'GUNNER MASTERY': 'SCHÜTZEN-MEISTERSCHAFT',
    'Gunner Mastery reward': 'Meisterschafts-Belohnung',
    'Weekly Ace Hunt · B-17 Gunner': 'Wöchentliche Asse-Jagd · B-17-Schütze',
    'WEEKLY ACE HUNT · TOP 10': 'WÖCHENTLICHE ASSE-JAGD · TOP 10',

    // ranks
    'Trainee': 'Rekrut',
    'Gunner': 'Schütze',
    'Seasoned Gunner': 'Erfahrener Schütze',
    'Expert': 'Experte',
    'Ace Gunner': 'Schützen-Ass',
    'Master Gunner': 'Meisterschütze',
    'Legend': 'Legende',

    // tabs
    'Stations': 'Stationen',
    'Challenges': 'Herausforderungen',
    'Locker': 'Spind',
    'Stats': 'Statistik',

    // stations tab
    'Rank {n}': 'Rang {n}',
    'Tier {n}': 'Stufe {n}',
    '{xp} / {next} XP': '{xp} / {next} EP',
    'Highest rank · {xp} XP': 'Höchster Rang · {xp} EP',
    'accuracy {p}': 'Trefferquote {p}',
    'Mastery XP: 10 a kill, +10 deflection, +25 ace, +10 at 600 m or more, +5 heavy, +20 an untouched round, +20 for 25% accuracy over 100 rounds.':
      'Meisterschafts-EP: 10 pro Abschuss, +10 Vorhalteschuss, +25 Ass, +10 ab 600 m, +5 schwer, +20 Runde ohne Treffer, +20 für 25 % Trefferquote über 100 Schuss.',
    'Best gun: {s}, rank {n}': 'Beste Station: {s}, Rang {n}',
    '{n} of {of} ranks': '{n} von {of} Rängen',
    'Goal reached ✓ {p}': 'Ziel erreicht ✓ {p}',

    // rewards
    'Gun sight': 'Visier',
    'Crew patch': 'Crew-Abzeichen',
    'Weekly Ace Hunt goal': 'Ziel der Asse-Jagd',

    // challenges
    'Deflection Shooting': 'Vorhalteschießen',
    'Down fighters crossing your line of fire at 60° or more.': 'Schieß Jäger ab, die deine Schusslinie mit 60° oder mehr kreuzen.',
    'Ace Hunter': 'Asse-Jäger',
    'Down aces: named Experten, Ace Hunt aces and squadron leaders.': 'Schieß Asse ab: namentliche Experten, Asse der Asse-Jagd und Staffelkapitäne.',
    'Untouched': 'Unversehrt',
    'Clear a round at the guns without your B-17 taking a hit.': 'Schließ eine Runde an den MGs ab, ohne dass deine B-17 getroffen wird.',
    'Long Shot': 'Weitschuss',
    'Down fighters 600 m away or more.': 'Schieß Jäger auf 600 m oder mehr ab.',
    'Every Gun': 'Jede Station',
    'Kills at every gun station: counts the station with the fewest.': 'Abschüsse an jeder Schützenstation: Es zählt die Station mit den wenigsten.',
    'All tiers complete · {n}': 'Alle Stufen geschafft · {n}',

    // weekly Ace Hunt
    'Fw 190s': 'Fw 190',
    'Bf 109s': 'Bf 109',
    'Heavy fighters (Bf 110 / Ju 88 / Me 410)': 'Zerstörer (Bf 110 / Ju 88 / Me 410)',
    'Jets and rockets (Me 262 / Me 163)': 'Strahl- und Raketenjäger (Me 262 / Me 163)',
    'Week {n}': 'Woche {n}',
    'B-17 gunners': 'B-17-Schützen',
    'Quarry': 'Beute',
    'Every gunner sortie this week counts: campaign, Survival and the other modes.': 'Jeder Schützeneinsatz diese Woche zählt: Kampagne, Überleben und die anderen Modi.',
    'Resets in': 'Neustart in',
    'points': 'Punkte',
    'Goal reached': 'Ziel erreicht',
    '{k} kills · {m} sorties this week': '{k} Abschüsse · {m} Einsätze diese Woche',
    'Weeks won: {n}': 'Gewonnene Wochen: {n}',
    'Goal reward: +{m} merit every week, and the Hunt Master patch the first time.': 'Belohnung: +{m} Verdienst pro Woche und beim ersten Mal das Abzeichen Jagdmeister.',
    'Quarry kill (extra)': 'Beute abgeschossen (Bonus)',
    'Ace kill': 'Ass abgeschossen',
    'Deflection kill': 'Vorhalte-Abschuss',
    'Kill at 600 m or more': 'Abschuss ab 600 m',
    'Untouched round': 'Runde ohne Treffer',
    'Weekly Ace Hunt': 'Wöchentliche Asse-Jagd',
    '+{n} points': '+{n} Punkte',

    // Locker
    'EQUIPPED': 'AUSGERÜSTET',
    'EQUIP': 'AUSRÜSTEN',
    'Gun sights': 'Visiere',
    "Your reticle on the waist guns, the top turret and the ball turret's reflector glass.": 'Dein Absehen an den Seiten-MGs, im oberen Turm und auf dem Reflexglas des Kugelturms.',
    'Crew patches': 'Crew-Abzeichen',
    'Worn on your mastery record and in the debrief.': 'Zu sehen in deiner Meisterschaftsakte und in der Nachbesprechung.',
    'Bomber names': 'Bombernamen',
    // sights
    'Standard Ring': 'Standardring',
    'Issue ring with four ticks and a centre dot.': 'Dienstring mit vier Strichen und Mittelpunkt.',
    'Mk IX Reflector': 'Reflexvisier Mk IX',
    'Two rings for range and a fine centre dot, in amber.': 'Zwei Entfernungsringe und ein feiner Mittelpunkt, in Bernstein.',
    'Fine Crosshair': 'Feines Fadenkreuz',
    'Thin cross with range ticks, nothing else in the way.': 'Dünnes Kreuz mit Entfernungsstrichen, sonst nichts im Weg.',
    'Gyro K-14': 'Kreisel K-14',
    'Six diamonds round a centre pipper, like the fighters carry.': 'Sechs Rauten um einen Zielpunkt, wie bei den Jägern.',
    "Ace's Chevron": 'Ass-Winkel',
    'A gold chevron over the aim point and a short ring.': 'Ein goldener Winkel über dem Zielpunkt und ein kurzer Ring.',
    'Tracer Dot': 'Leuchtspurpunkt',
    'A bright green dot in a broken ring.': 'Ein hellgrüner Punkt in einem unterbrochenen Ring.',
    'Deflection Rings': 'Vorhalteringe',
    'Inner and outer lead rings with crossing-speed ticks.': 'Innerer und äußerer Vorhaltering mit Strichen für die Quergeschwindigkeit.',
    // patches
    "Gunner's Wings": 'Schützenschwingen',
    'Port Watch': 'Wache Backbord',
    'Starboard Watch': 'Wache Steuerbord',
    'Top Hat': 'Zylinder',
    'Ball Bearing': 'Kugellager',
    'Stinger': 'Stachel',
    'Crossfire': 'Kreuzfeuer',
    'Hunt Master': 'Jagdmeister',

    // stats
    'Hits': 'Treffer',
    'Rounds fired': 'Abgefeuerte Schuss',
    'Time at the gun': 'Zeit am MG',
    'All stations': 'Alle Stationen',
    'Your best gun: {s}, {p} accuracy.': 'Deine beste Station: {s}, {p} Trefferquote.',
    'Deflection': 'Vorhalt',
    'Aces': 'Asse',
    '600 m+': '600 m+',
    'Heavies': 'Schwere',
    'Untouched rounds': 'Runden ohne Treffer',
    'Best sortie': 'Bester Einsatz',
    'Rounds and hits are counted since Gunner Mastery arrived; earlier kills carry over from your service record.': 'Schuss und Treffer zählen seit Einführung der Meisterschaft; frühere Abschüsse stammen aus deiner Dienstakte.',

    // debrief
    'RANK UP': 'RANG AUFGESTIEGEN',
    '{k} kills · {d} deflection · {a} aces': '{k} Abschüsse · {d} Vorhalt · {a} Asse',
  },
};

export default table;
