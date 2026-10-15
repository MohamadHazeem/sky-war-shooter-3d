// German for ar/campaign.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const CITY: Record<string, string> = {
  Hamm: 'Hamm', Münster: 'Münster', Osnabrück: 'Osnabrück', Hannover: 'Hannover', Rheine: 'Rheine', Twente: 'Twente',
  Oldenburg: 'Oldenburg', Gelsenkirchen: 'Gelsenkirchen', Leuna: 'Leuna', Misburg: 'Misburg', Wilhelmshaven: 'Wilhelmshaven',
  Kiel: 'Kiel', Emden: 'Emden', Brunswick: 'Braunschweig', Kassel: 'Kassel', Gotha: 'Gotha',
};
const TARGET: Record<string, string> = {
  'Marshalling yards': 'Rangierbahnhof', 'Rail junction': 'Eisenbahnknoten', 'Rail yards': 'Güterbahnhof',
  'Fighter airfield': 'Jagdfliegerhorst', 'Fighter base': 'Jägerstützpunkt',
  'Synthetic oil plant': 'Hydrierwerk', 'Synthetic fuel works': 'Treibstoffwerk', 'Refinery': 'Raffinerie',
  'U-boat base': 'U-Boot-Stützpunkt', 'U-boat yards': 'U-Boot-Werft',
  'Aircraft assembly plant': 'Flugzeugmontagewerk', 'Fieseler works': 'Fieseler-Werk', 'Gothaer Waggonfabrik': 'Gothaer Waggonfabrik',
};
// the same targets with their article (nominative), for use inside a sentence
const TARGET_MID: Record<string, string> = {
  'marshalling yards': 'der Rangierbahnhof', 'rail junction': 'der Eisenbahnknoten', 'rail yards': 'der Güterbahnhof',
  'fighter airfield': 'der Jagdfliegerhorst', 'fighter base': 'der Jägerstützpunkt',
  'synthetic oil plant': 'das Hydrierwerk', 'synthetic fuel works': 'das Treibstoffwerk', 'refinery': 'die Raffinerie',
  'u-boat base': 'der U-Boot-Stützpunkt', 'u-boat yards': 'die U-Boot-Werft',
  'aircraft assembly plant': 'das Flugzeugmontagewerk', 'fieseler works': 'das Fieseler-Werk', 'gothaer waggonfabrik': 'die Gothaer Waggonfabrik',
};
const LABEL: Record<string, string> = {
  'Rail yards': 'Güterbahnhöfe', 'Airfields': 'Flugplätze', 'Oil': 'Öl', 'U-boat pens': 'U-Boot-Bunker', 'Aircraft factory': 'Flugzeugwerk',
};

const alt = (o: Record<string, string>) => Object.keys(o).map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
const C = `(${alt(CITY)})`;
const N = `(${alt(TARGET)})`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tN = (s: string, tr: (s: string) => string) => TARGET_MID[s.toLowerCase()] ?? tr(s);
const pl = (n: string | number, one: string, many: string) => `${n} ${+n === 1 ? one : many}`;

const patterns: Pattern[] = [
  // ---------------- SideRaids.ts: generated raid missions ----------------
  [new RegExp(`^Strike on ${C}$`), (m, tr) => `Angriff auf ${tr(m[1])}`],
  [new RegExp(`^(${alt(LABEL)}) — ${C}$`), (m, tr) => `${LABEL[m[1]]} — ${tr(m[2])}`],
  [new RegExp(`^Escort — ${N}, ${C}$`, 'i'), (m, tr) => `Begleitschutz — ${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^${N}, ${C}$`, 'i'), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^A short one today\\. The ${N} at ${C} move every train between the Ruhr and the north German ports: fighters, fuel and flak shells all pass through them\\.$`, 'i'),
    (m, tr) => `Heute ein kurzer Einsatz. ${cap(tN(m[1], tr))} in ${tr(m[2])} ist das Nadelöhr für jeden Zug zwischen dem Ruhrgebiet und den norddeutschen Häfen: Jäger, Treibstoff und Flakgranaten kommen alle hier durch.`],
  [new RegExp(`^The yards at ${C} are a tangle of twisted rail\\. Nothing will move through them for a week\\.$`),
    (m, tr) => `Die Gleisanlagen in ${tr(m[1])} sind ein Gewirr aus verbogenen Schienen. Eine Woche lang fährt dort nichts mehr.`],
  [new RegExp(`^The Jagdgruppe at ${C} has been hitting our formations over the coast for a month\\. Today we hit it at home: runways, hangars and dispersal pens\\.$`),
    (m, tr) => `Die Jagdgruppe in ${tr(m[1])} greift seit einem Monat unsere Formationen über der Küste an. Heute treffen wir sie zu Hause: Startbahnen, Hangars und Abstellboxen.`],
  [new RegExp(`^${C} is cratered from end to end\\. The Jagdgruppe there will be flying from somewhere else for a while\\.$`),
    (m, tr) => `${tr(m[1])} ist von einem Ende zum anderen zerbombt. Die Jagdgruppe dort muss eine Weile von woanders starten.`],
  [new RegExp(`^The target is the ${N} at ${C}\\. Germany has almost no natural oil: every drop of fuel for her fighters is cooked out of coal in plants like this one\\.$`, 'i'),
    (m, tr) => `Ziel: ${tN(m[1], tr)} in ${tr(m[2])}. Deutschland hat kaum eigenes Erdöl: Jeder Tropfen Treibstoff für seine Jäger wird in Werken wie diesem aus Kohle gewonnen.`],
  [new RegExp(`^Black smoke over ${C} is climbing past twenty thousand feet\\. The Luftwaffe will be counting its fuel by the litre\\.$`),
    (m, tr) => `Schwarzer Rauch über ${tr(m[1])} steigt über zwanzigtausend Fuß. Die Luftwaffe wird ihren Treibstoff literweise zählen.`],
  [new RegExp(`^The Navy has asked for this one\\. The ${N} at ${C} turns out the boats that hunt our convoys in the Atlantic, and those convoys carry our new aircraft and crews\\.$`, 'i'),
    (m, tr) => `Die Navy hat um diesen Einsatz gebeten. ${cap(tN(m[1], tr))} in ${tr(m[2])} liefert die U-Boote, die unsere Geleitzüge im Atlantik jagen, und diese Geleitzüge bringen unsere neuen Flugzeuge und Besatzungen.`],
  [new RegExp(`^The slipways at ${C} took a pounding\\. The next convoy will have a quieter crossing, and the group will see the benefit\\.$`),
    (m, tr) => `Die Hellinge in ${tr(m[1])} haben schwer was abbekommen. Der nächste Geleitzug hat eine ruhigere Überfahrt, und die Gruppe wird es merken.`],
  [new RegExp(`^The ${N} at ${C} builds fighters, and every one it finishes will be shooting at us within a month\\. This is a deep one, and it will be defended like Berlin\\.$`, 'i'),
    (m, tr) => `${cap(tN(m[1], tr))} in ${tr(m[2])} baut Jäger, und jeder, der dort fertig wird, schießt binnen eines Monats auf uns. Ein tiefer Einsatz, und das Ziel wird verteidigt wie Berlin.`],
  [new RegExp(`^The assembly halls at ${C} are burning\\. That is a month of fighters the Luftwaffe will never get\\.$`),
    (m, tr) => `Die Montagehallen in ${tr(m[1])} brennen. Das ist ein Monat Jäger, den die Luftwaffe nie bekommen wird.`],
  [new RegExp(`^Bandits climbing out of ${C}! Blue flight, go get them\\.$`), (m, tr) => `Banditen steigen aus ${tr(m[1])} auf! Blauer Schwarm, schnappt sie euch.`],
  [new RegExp(`^Fighters coming up from ${C}\\. Here they come!$`), (m, tr) => `Jäger steigen aus ${tr(m[1])} auf. Da kommen sie!`],

  // ---------------- CampaignState.ts: intelligence report (saved in English) ----------------
  [/^Mission (complete|failed) · (.+)$/, (m, tr) => `${m[1] === 'complete' ? 'Mission erfüllt' : 'Mission gescheitert'} · ${tr(m[2])}`],
  [/^Luftwaffe strength (up|down|holds) (?:at (\d+)%|(\d+)% → (\d+)%)\. (.+)$/, (m, tr) => {
    const head = m[1] === 'holds' ? `Stärke der Luftwaffe hält bei ${m[2]}%.` : `Stärke der Luftwaffe ${m[1] === 'up' ? 'steigt' : 'sinkt'}: ${m[3]}% → ${m[4]}%.`;
    return `${head} ${tr(m[5])}`;
  }],
  [/^Losses over (.+) are thinning the Jagdgruppen\.$/, (m, tr) => `Die Verluste über ${tr(m[1])} dünnen die Jagdgruppen aus.`],
  [/^Squadron (\d+) → (\d+) ships\. (?:(\d+) Fortress(?:es)? lost|No Fortresses lost); (\d+) replacement crews arrived(?:, (\d+) of them early thanks to the convoys)?\.(?: The next formation will be (\d+)% of full size\.)?$/, (m) => {
    let s = `Staffel: ${m[1]} → ${pl(m[2], 'Maschine', 'Maschinen')}. `;
    s += m[3] ? `${pl(m[3], 'Fortress verloren', 'Fortresses verloren')}; ` : 'Keine Fortress verloren; ';
    s += `${pl(m[4], 'Ersatzbesatzung eingetroffen', 'Ersatzbesatzungen eingetroffen')}${m[5] ? `, davon ${m[5]} früher dank der Geleitzüge` : ''}.`;
    if (m[6]) s += ` Die nächste Formation hat ${m[6]}% ihrer Sollstärke.`;
    return s;
  }],
  [/^Crew morale (?:steady at (\d+)%|(\d+)% → (\d+)%)\. (.+?)(?: Merit x([\d.]+)\.)?$/, (m, tr) => {
    const head = m[1] ? `Moral der Besatzungen stabil bei ${m[1]}%.` : `Moral der Besatzungen: ${m[2]}% → ${m[3]}%.`;
    return `${head} ${tr(m[4])}${m[5] ? ` Verdienst x${m[5]}.` : ''}`;
  }],
  [/^Escort availability (\d+)% → (\d+)%\.(?: (.+))?$/, (m, tr) => `Verfügbarkeit des Begleitschutzes: ${m[1]}% → ${m[2]}%.${m[3] ? ` ${tr(m[3])}` : ''}`],
  [/^Mustangs join the gunner missions at (\d+)%\.$/, 'Mustangs begleiten die Schützenmissionen ab $1%.'],
  [/^Next operation: Mission (\d+), (.+) \((.+)\)\. Enemy fighters x([\d.]+)\.$/, (m, tr) => `Nächster Einsatz: Mission ${m[1]}, „${tr(m[2])}“ (${tr(m[3])}). Feindjäger x${m[4]}.`],
  // tour summary log: "6 kills · 2 lost"
  [/^(\d+) kills$/, (m) => pl(m[1], 'Abschuss', 'Abschüsse')],
  [/^(\d+) lost$/, (m) => pl(m[1], 'Fortress verloren', 'Fortresses verloren')],
  [/^Raid bonus: \+(\d+) merit\.$/, 'Angriffsbonus: +$1 Verdienst.'],
  [/^Your (\d+) completed missions? (?:have|has) been entered in the group's records\. The strategic picture below reflects them\.$/,
    (m) => (+m[1] === 1
      ? 'Deine abgeschlossene Mission wurde in die Akten der Gruppe eingetragen. Die strategische Lage unten berücksichtigt sie.'
      : `Deine ${m[1]} abgeschlossenen Missionen wurden in die Akten der Gruppe eingetragen. Die strategische Lage unten berücksichtigt sie.`)],
];

const table: PhraseTable = {
  phrases: {
    ...CITY,
    ...TARGET,
    ...LABEL,
    'the Netherlands': 'den Niederlanden',
    'the Channel': 'dem Ärmelkanal',

    // ---------------- SideRaids.ts: raid template texts ----------------
    'Snarls German supply: Luftwaffe −3, morale +3': 'Stört den deutschen Nachschub: Luftwaffe −3, Moral +3',
    'Catches fighters on the ground: Luftwaffe −8, escort +12': 'Erwischt Jäger am Boden: Luftwaffe −8, Begleitschutz +12',
    'Starves the fighters of fuel: Luftwaffe −6, morale +2': 'Schneidet die Jäger vom Treibstoff ab: Luftwaffe −6, Moral +2',
    'Convoys get through: +3 replacement ships, morale +4': 'Geleitzüge kommen durch: +3 Ersatzmaschinen, Moral +4',
    'Cuts fighter production: Luftwaffe −7, escort +6': 'Drosselt die Jägerproduktion: Luftwaffe −7, Begleitschutz +6',
    'The defences are light, and Group calls it a chance to blood the new crews. Do not believe the words "milk run". The day fighters based nearby will come up to meet us.':
      'Die Abwehr ist schwach, und die Gruppe sieht darin eine Chance, die neuen Besatzungen einzuweihen. Glaubt nicht an das Wort "Spazierflug". Die Tagjäger in der Nähe werden uns entgegenkommen.',
    'Every fighter we catch on the ground is one that will not be waiting for us over Germany, and with the coastal fields out of action the Mustangs can push further inland. Expect the whole Gruppe to scramble the moment we cross the coast.':
      'Jeder Jäger, den wir am Boden erwischen, wartet nicht mehr über Deutschland auf uns, und ohne die Küstenflugplätze können die Mustangs tiefer ins Landesinnere vorstoßen. Rechnet damit, dass die ganze Gruppe alarmstartet, sobald wir die Küste überqueren.',
    'No fuel means no training flights, and no training means green pilots. The Germans know it, so the plant is ringed with heavy flak, and twin-engine destroyers will be up with rockets. Keep them off the formation through the bomb run.':
      'Kein Treibstoff heißt keine Schulflüge, und keine Schulung heißt grüne Piloten. Das wissen die Deutschen, darum ist das Werk von schwerer Flak umringt, und zweimotorige Zerstörer steigen mit Raketen auf. Haltet sie während des ganzen Bombenanflugs von der Formation fern.',
    'Every convoy that gets through brings replacements to the group sooner. The route runs low over the North Sea; expect fighters from the coastal fields and Ju 88s from the Frisian Islands.':
      'Jeder Geleitzug, der durchkommt, bringt der Gruppe früher Ersatz. Die Route führt tief über die Nordsee; rechnet mit Jägern von den Küstenflugplätzen und Ju 88 von den Friesischen Inseln.',
    'The Sturmgruppen and the rocket-carrying destroyers will be up in force. Hold the formation tight and keep firing; the bombardiers need a steady run of four minutes over the aiming point.':
      'Die Sturmgruppen und die raketentragenden Zerstörer werden in voller Stärke da sein. Haltet die Formation eng und feuert weiter; die Bombenschützen brauchen vier Minuten ruhigen Anflug über dem Zielpunkt.',
    'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.':
      'Du fliegst Nahbegleitschutz in einer P-51D. Bleib bei den Bombern, bis sie vom Ziel ablaufen, dann darfst du runtergehen und jagen.',
    'This is an optional operation. Group will not hold it against any crew that stands down, but what we hit today changes what is waiting for us on the next big one.':
      'Dies ist ein freiwilliger Einsatz. Die Gruppe nimmt es keiner Besatzung übel, die aussetzt, aber was wir heute treffen, ändert, was uns beim nächsten großen Einsatz erwartet.',
    'Bomb the rail yards': 'Bombardiere den Güterbahnhof',
    'Wreck the airfield': 'Zerstöre den Flugplatz',
    'Bomb the oil plant through the flak': 'Bombardiere das Ölwerk durch die Flak',
    'Hit the U-boat slipways': 'Triff die U-Boot-Hellinge',
    'Destroy the aircraft factory': 'Zerstöre das Flugzeugwerk',
    'Protect the bombers over the airfield': 'Schütze die Bomber über dem Flugplatz',

    // ---------------- CampaignState.ts: report reasons and notes ----------------
    'With the rail yards cut, fuel and spares are not reaching the fighter fields.': 'Mit dem zerstörten Güterbahnhof erreichen Treibstoff und Ersatzteile die Jagdflugplätze nicht mehr.',
    'Fighters were caught on the ground and the field is out of action.': 'Jäger wurden am Boden erwischt, und der Flugplatz ist außer Betrieb.',
    'Fuel is short: training flights are grounded and fewer fighters can be put up.': 'Treibstoff ist knapp: Schulflüge fallen aus, und weniger Jäger können aufsteigen.',
    'A month of fighter production has gone up in smoke.': 'Ein Monat Jägerproduktion ist in Rauch aufgegangen.',
    'The Jagdgruppen are claiming a victory, and their confidence and strength recover.': 'Die Jagdgruppen verbuchen einen Sieg, und ihr Selbstvertrauen und ihre Stärke erholen sich.',
    'This target did not touch the fighter arm.': 'Dieses Ziel hat die Jagdwaffe nicht getroffen.',
    'The crews are cheered by the result.': 'Das Ergebnis hebt die Stimmung der Besatzungen.',
    'The crews are holding up.': 'Die Besatzungen halten durch.',
    'Empty bunks in the huts weigh on the crews.': 'Leere Kojen in den Baracken lasten auf den Besatzungen.',
    'A bad day; the crews are subdued.': 'Ein schlechter Tag; die Besatzungen sind gedrückt.',
    'Steady.': 'Stabil.',
    'Fighter Command confirms: P-51 Mustangs will now join the bombers on gunner missions.': 'Das Fighter Command bestätigt: P-51 Mustangs begleiten ab jetzt die Bomber auf Schützenmissionen.',
    'The Mustangs will reach us sooner.': 'Die Mustangs werden uns früher erreichen.',
    'The tour is complete. The campaign summary is ready.': 'Die Dienstzeit ist beendet. Die Kampagnenbilanz liegt bereit.',
    'A replay of a finished operation. The strategic picture is unchanged.': 'Wiederholung eines abgeschlossenen Einsatzes. Die strategische Lage bleibt unverändert.',
    'Campaign records transferred': 'Kampagnenakten übertragen',

    // ---------------- CampaignMap.ts: chart ----------------
    '{n}°N': '{n}° N',
    '{n}°W': '{n}° W',
    '{n}°E': '{n}° O',
    'N (compass)': 'N',
    'LUFTWAFFE DAY FIGHTERS · {n}%': 'TAGJÄGER DER LUFTWAFFE · {n}%',
    'ESCORT RADIUS · {n}%': 'BEGLEITREICHWEITE · {n}%',
    'Mission {n}: {title}': 'Mission {n}: {title}',
    '{place} · NEXT': '{place} · NÄCHSTE',
    'DEENETHORPE · 401ST BG': 'DEENETHORPE · 401. BG',
    'Next story operation': 'Nächster Story-Einsatz',
    'Flown · ○ to come': 'Geflogen · ○ ausstehend',
    'Side raid on offer': 'Nebenangriff verfügbar',
    'Escort radius / raid route': 'Begleitreichweite / Angriffsroute',
    'Campaign map: England, the North Sea and Germany': 'Kampagnenkarte: England, die Nordsee und Deutschland',
    'NORTH SEA & NORTHWEST EUROPE · 1943–44': 'NORDSEE & NORDWESTEUROPA · 1943–44',

    // ---------------- CampaignMap.ts: gauges and intelligence ----------------
    'Strategic situation': 'Strategische Lage',
    'Luftwaffe strength': 'Stärke der Luftwaffe',
    'Squadron strength': 'Stärke der Staffel',
    'Crew morale': 'Moral der Besatzungen',
    'Escort availability': 'Verfügbarkeit des Begleitschutzes',
    'Enemy fighters x{a} · skill x{b}': 'Feindjäger x{a} · Können x{b}',
    'Full-size formations': 'Formationen in voller Stärke',
    'Formations at {n}% — replacements arriving': 'Formationen bei {n}% — Ersatz unterwegs',
    'Merit x{n}': 'Verdienst x{n}',
    'P-51s join the gunner missions': 'P-51 begleiten die Schützenmissionen',
    'P-51s join gunner missions at {n}%': 'P-51 begleiten Schützenmissionen ab {n}%',
    'Intelligence report': 'Lagebericht',
    'No operations flown yet. Group expects heavy fighter opposition over the German coast.': 'Noch keine Einsätze geflogen. Die Gruppe erwartet starke Jägerabwehr über der deutschen Küste.',

    // ---------------- CampaignMap.ts: operation cards ----------------
    'P-51D escort': 'P-51D-Begleitschutz',
    'Low sun': 'Tiefe Sonne',
    'Formation {n} ships': 'Formation {n} Maschinen',
    'Fighters x{n}': 'Jäger x{n}',
    'P-51s at {t}': 'P-51 bei {t}',
    'MISSION {n} OF {total}': 'MISSION {n} VON {total}',
    'Brief the crew': 'Besatzung einweisen',
    'Tour complete': 'Dienstzeit beendet',
    'Twenty-five missions': 'Fünfundzwanzig Missionen',
    "The Sky Queen's crew is going home.": 'Die Besatzung der Sky Queen fährt nach Hause.',
    'Campaign summary': 'Kampagnenbilanz',
    'Begin a new tour': 'Neue Dienstzeit beginnen',
    'Confirm: new tour (medals and Armory kept)': 'Bestätigen: neue Dienstzeit (Orden und Waffenkammer bleiben)',
    'Raid flown — target destroyed': 'Angriff geflogen — Ziel zerstört',
    'Raid flown — target missed': 'Angriff geflogen — Ziel verfehlt',
    'The window has passed': 'Die Gelegenheit ist vorbei',
    'Fly this raid': 'Diesen Angriff fliegen',
    '{fx} · +{n} merit': '{fx} · +{n} Verdienst',
    'The tour is over. Side raids are closed.': 'Die Dienstzeit ist vorbei. Nebenangriffe sind geschlossen.',
    'Side raids open after your first mission. Fly Mission 1 to begin the tour.': 'Nebenangriffe öffnen nach deiner ersten Mission. Flieg Mission 1, um die Dienstzeit zu beginnen.',
    'One raid per lull between operations.': 'Ein Angriff pro Pause zwischen den Einsätzen.',
    'Optional: fly one raid before Mission {n}, or go straight on. What you hit changes the odds on the next big one.':
      'Optional: Flieg vor Mission {n} einen Angriff oder mach direkt weiter. Was du triffst, ändert die Chancen beim nächsten großen Einsatz.',
    '1 medal': '1 Orden',
    '{n} medals': '{n} Orden',
    '401ST BOMB SQUADRON · OPERATIONS ROOM': '401. BOMBERSTAFFEL · EINSATZRAUM',
    ' · TOUR {n}': ' · DIENSTZEIT {n}',
    'Campaign': 'Kampagne',
    'Campaign date': 'Kampagnendatum',
    '{done}/{total} operations': '{done}/{total} Einsätze',
    '1 side raid': '1 Nebenangriff',
    '{n} side raids': '{n} Nebenangriffe',
    'Next operation': 'Nächster Einsatz',
    'Tour of duty': 'Dienstzeit',
    'Side raids': 'Nebenangriffe',
    '· before Mission {n}': '· vor Mission {n}',
    'Tour timeline': 'Zeitleiste der Dienstzeit',

    // ---------------- CampaignMap.ts: tour summary ----------------
    'The German day-fighter arm is a shadow of the force that met you over Emden. You helped break it.': 'Die deutsche Tagjagd ist nur noch ein Schatten der Streitmacht, die dir über Emden begegnet ist. Du hast geholfen, sie zu brechen.',
    'The Luftwaffe is still flying, but it is bleeding pilots it cannot replace. The air war has turned.': 'Die Luftwaffe fliegt noch, aber sie verliert Piloten, die sie nicht ersetzen kann. Der Luftkrieg hat sich gewendet.',
    'The Luftwaffe is battered but unbroken. The crews who follow you will still have a fight on their hands.': 'Die Luftwaffe ist angeschlagen, aber nicht gebrochen. Die Besatzungen nach dir haben noch einen Kampf vor sich.',
    'Your {n} successful side raids kept the pressure on between the big operations.': 'Deine {n} erfolgreichen Nebenangriffe hielten den Druck zwischen den großen Einsätzen aufrecht.',
    '1 side raid hit home between the big operations.': '1 Nebenangriff saß zwischen den großen Einsätzen.',
    '{n} side raids hit home between the big operations.': '{n} Nebenangriffe saßen zwischen den großen Einsätzen.',
    'You flew the story operations alone, without side raids.': 'Du bist nur die Story-Einsätze geflogen, ohne Nebenangriffe.',
    'The crews finish the tour in fine spirits.': 'Die Besatzungen beenden die Dienstzeit in bester Stimmung.',
    'The crews are tired, but proud.': 'Die Besatzungen sind müde, aber stolz.',
    'The crews are worn to the bone. Too many empty bunks.': 'Die Besatzungen sind völlig ausgelaugt. Zu viele leere Kojen.',
    '401ST BOMB SQUADRON · TOUR OF DUTY': '401. BOMBERSTAFFEL · DIENSTZEIT',
    'Tour in progress': 'Dienstzeit läuft',
    'Story operations': 'Story-Einsätze',
    'Sorties flown': 'Geflogene Einsätze',
    'Confirmed kills': 'Bestätigte Abschüsse',
    'Fortresses lost': 'Verlorene Fortresses',
    'Medals on record': 'Verliehene Orden',
    'Squadron': 'Staffel',
    'Escort': 'Begleitschutz',
    'Operations log': 'Einsatzprotokoll',
    'No sorties recorded.': 'Keine Einsätze verzeichnet.',
    'Campaign map': 'Kampagnenkarte',
    'Main menu': 'Hauptmenü',

    // ---------------- CampaignMap.ts: briefing sheet ----------------
    'SIDE RAID · OPTIONAL OPERATION': 'NEBENANGRIFF · FREIWILLIGER EINSATZ',
    'Campaign: Luftwaffe {n}%': 'Kampagne: Luftwaffe {n}%',
    'Morale {n}% · merit x{m}': 'Moral {n}% · Verdienst x{m}',
    'On success: {fx} · +{n} merit': 'Bei Erfolg: {fx} · +{n} Verdienst',
  },
  patterns,
};
export default table;
