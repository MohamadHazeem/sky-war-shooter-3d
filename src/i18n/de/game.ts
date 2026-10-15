// German for ar/game.ts (same keys and patterns).
import type { PhraseTable } from '../types';

const STATION: Record<string, string> = {
  'Left Waist': 'Seitenstand links',
  'Right Waist': 'Seitenstand rechts',
  'Top Turret': 'Oberer Turm',
  'Ball Turret': 'Kugelturm',
  'Tail Gun': 'Heckstand',
};
const STATION_UP: Record<string, string> = Object.fromEntries(Object.entries(STATION).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
const ST = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';

const MONTHS: Record<string, string> = {
  JANUARY: 'JANUAR', FEBRUARY: 'FEBRUAR', MARCH: 'MÄRZ', APRIL: 'APRIL', MAY: 'MAI', JUNE: 'JUNI',
  JULY: 'JULI', AUGUST: 'AUGUST', SEPTEMBER: 'SEPTEMBER', OCTOBER: 'OKTOBER', NOVEMBER: 'NOVEMBER', DECEMBER: 'DEZEMBER',
};

const pl = (s: string, one: string, many: string) => (+s === 1 ? `${s} ${one}` : `${s} ${many}`);
const round = (a: string, b?: string) => (b ? `Runde ${a}/${b}` : `Runde ${a}`);

// Text shown in capitals: tr() handles capitalised text; only dates need the fallback
function upper(s: string, tr: (s: string) => string): string {
  const d = tr(s);
  if (d !== s) return d;
  const date = s.match(/^(\d{1,2}) ([A-Z]+) (\d{4})$/);
  if (date && MONTHS[date[2]]) return `${date[1]}. ${MONTHS[date[2]]} ${date[3]}`;
  return s;
}

const MODE: Record<string, string> = { 'MOUSE AIM': 'MAUSZIELEN', DIRECT: 'DIREKT', COCKPIT: 'COCKPIT', CHASE: 'VERFOLGER' };
const QUALITY: Record<string, string> = { low: 'niedrig', medium: 'mittel', high: 'hoch' };

const table: PhraseTable = {
  phrases: {
    // ---- gun stations ----
    ...STATION,
    ...STATION_UP,

    // ---- crew panel ----
    'Pilot': 'Pilot',
    'Co-Pilot': 'Kopilot',
    'Navigator': 'Navigator',
    'Bombardier': 'Bombenschütze',
    'Engineer': 'Bordmechaniker',
    'Radio': 'Funker',
    'Ball': 'Kugel',
    'Waist L': 'Seite L',
    'Waist R': 'Seite R',
    'Tail': 'Heck',
    'OK': 'OK',
    'WOUNDED': 'VERWUNDET',

    // ---- banners ----
    'FIVE CONFIRMED': 'FÜNF BESTÄTIGT',
    'Ace in a day': 'Ass an einem Tag',
    'They\'re sending everything they have': 'Sie schicken alles, was sie haben',
    'More fighters inbound': 'Weitere Jäger im Anflug',
    'INCOMING': 'ANGRIFF',
    'ALL GUNS SECURE': 'ALLE WAFFEN GESICHERT',
    'MISSION FAILED': 'EINSATZ GESCHEITERT',
    'Mission complete': 'Einsatz erfüllt',
    'Shot down': 'Abgeschossen',
    'BAIL OUT! BAIL OUT!': 'AUSSTEIGEN! AUSSTEIGEN!',
    'Crew, abandon the aircraft': 'Besatzung, Maschine verlassen',
    '5 kill streak · +50% score': '5er-Serie · +50 % Punkte',
    'ON FIRE': 'IN FAHRT',
    'SOMEWHERE OVER THE REICH': 'IRGENDWO ÜBER DEM REICH',
    'OVER THE RUHR, SPRING 1944': 'ÜBER DEM RUHRGEBIET, FRÜHJAHR 1944',
    'THE CLOCK IS RUNNING': 'DIE ZEIT LÄUFT',
    'TRAINING FLIGHT · OVER THE WASH': 'ÜBUNGSFLUG · ÜBER DEM WASH',

    // ---- tips ----
    '<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire': '<kbd>Maus</kbd>: Waffe schwenken · <kbd>Linke Taste halten</kbd>: Feuer',
    'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom': 'Halte vor — ziele dorthin, wo die Jäger sein werden · <kbd>Rechte Taste</kbd> zum Zoomen',
    'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position': 'Kurze Feuerstöße halten den Lauf kühl · <kbd>1–5</kbd> Waffenstand wechseln',
    '<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires': '<kbd>Bewege die Maus</kbd>, um dorthin zu fliegen, wo du hinsiehst · <kbd>Linke Taste</kbd> feuert',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle': 'Setz das K-14-Visier vor den Gegner und feuere · <kbd>W/S</kbd> Gas',
    'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view': 'Fw 190 werden dich jagen — bleib im Kurven · <kbd>V</kbd> Verfolgeransicht',
    '<kbd>Drag</kbd> to swing the gun · <kbd>Hold FIRE</kbd> to shoot': '<kbd>Ziehen</kbd>, um die Waffe zu schwenken · <kbd>FEUER halten</kbd> zum Schießen',
    'Lead the fighters — aim where they will be · <kbd>ZOOM</kbd> for the ring sight': 'Halte vor — ziele dorthin, wo die Jäger sein werden · <kbd>ZOOM</kbd> für das Ringvisier',
    'Short bursts keep the barrel cool · tap a gun position to change seats': 'Kurze Feuerstöße halten den Lauf kühl · tippe auf einen Waffenstand zum Wechseln',
    '<kbd>Drag</kbd> on the left to fly · <kbd>FIRE</kbd> shoots': '<kbd>Ziehe</kbd> links zum Fliegen · <kbd>FEUER</kbd> schießt',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>THR</kbd> lever for power': 'Setz das K-14-Visier vor den Gegner und feuere · Hebel <kbd>GAS</kbd> für Leistung',
    'Fw 190s will come for you — keep turning · <kbd>VIEW</kbd> chase view': 'Fw 190 werden dich jagen — bleib im Kurven · <kbd>SICHT</kbd> Verfolgeransicht',
    'Guns topped up': 'Munition aufgefüllt',
    'RELOADING — new ammunition box': 'NACHLADEN — neuer Munitionskasten',
    'BARREL OVERHEATED — let it cool': 'LAUF ÜBERHITZT — abkühlen lassen',
    '<kbd>Space</kbd> skip': '<kbd>Leertaste</kbd> überspringen',

    // ---- kill feed ----
    'P-51 lost': 'P-51 verloren',
    'You are wounded': 'Du bist verwundet',
    'Fire\'s out — took a heavy hit': 'Feuer gelöscht — schwerer Treffer',
    'Streak cooled off': 'Serie beendet',

    // ---- field upgrades ----
    '6 KILLS · FIELD UPGRADE': '6 ABSCHÜSSE · FELD-UPGRADE',
    '5 KILLS · FIELD PROMOTION': '5 ABSCHÜSSE · FRONTBEFÖRDERUNG',

    // ---- hangar / armory headers ----
    'ARMORY': 'WAFFENKAMMER',
    'B-17 gunner loadout (P-51 loadout: between rounds)': 'Ausrüstung B-17-Schütze (Ausrüstung P-51: zwischen den Runden)',
    'Back': 'Zurück',

    // ---- HUD objective line ----
    'Gunnery School — follow the instructions': 'Schießschule — folge den Anweisungen',
    'Stand by — enemy fighters approaching': 'Bereithalten — feindliche Jäger im Anflug',
    'Hold steady through the flak': 'Ruhig bleiben im Flakfeuer',
    'Scan the sky — more fighters expected': 'Himmel absuchen — weitere Jäger erwartet',

    // ---- pilot HUD mode line ----
    'MOUSE AIM': 'MAUSZIELEN',
    'DIRECT': 'DIREKT',
    'COCKPIT': 'COCKPIT',
    'CHASE': 'VERFOLGER',
    'STALL': 'STRÖMUNGSABRISS',

    // ---- gunner HUD station line ----
    'RELOADING': 'NACHLADEN',
    'BARREL HOT': 'LAUF HEISS',

    // ---- debrief: end-of-mission reasons ----
    'Both pilots were hit and the Sky Queen fell out of control.': 'Beide Piloten wurden getroffen und die Sky Queen geriet außer Kontrolle.',
    'The tail was shot away.': 'Das Leitwerk wurde weggeschossen.',
    'A wing was shot off.': 'Eine Tragfläche wurde abgeschossen.',
    'All four engines were knocked out.': 'Alle vier Motoren fielen aus.',
    'The Sky Queen was shot down.': 'Die Sky Queen wurde abgeschossen.',
    'Your Mustang flew into the ground.': 'Deine Mustang ist in den Boden geflogen.',
    'Your Mustang was shot down.': 'Deine Mustang wurde abgeschossen.',
    'You were seriously wounded and could no longer man your gun.': 'Du wurdest schwer verwundet und konntest deine Waffe nicht mehr bedienen.',
    'The formation fought its way through. Good shooting, gunner.': 'Die Formation hat sich durchgekämpft. Gut geschossen, Schütze.',
    'The bombers made it through. Outstanding work, Blue Leader.': 'Die Bomber sind durchgekommen. Hervorragende Arbeit, Blue Leader.',

    // ---- debrief: medals and tiles ----
    'Air Medal': 'Air Medal',
    'Ace in a Day': 'Ass an einem Tag',
    'Distinguished Flying Cross': 'Distinguished Flying Cross',
    'Silver Star': 'Silver Star',
    'Purple Heart': 'Purple Heart',
    'Gun kills': 'Abschüsse',
    'ONLINE LEADERBOARD': 'ONLINE-BESTENLISTE',
    'You': 'Du',

    // ---- loading screen ----
    'Starting the engines…': 'Motoren werden angelassen…',
    'Loading aircraft…': 'Flugzeuge werden geladen…',
    'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.': 'WebGL 2 wird benötigt. Bitte nutze einen aktuellen Desktop-Browser mit aktivierter Hardwarebeschleunigung.',
    'Forming up over England…': 'Sammeln über England…',
    'Ready': 'Bereit',

    // ---- cinematics ----
    'KILL CAM': 'ABSCHUSSKAMERA',
    '{what} · DESTROYED': '{what} · ZERSTÖRT',
    'BANDIT': 'FEIND',
    'CLICK TO SKIP': 'KLICKEN ZUM ÜBERSPRINGEN',
    'MISSION COMPLETE': 'EINSATZ ERFÜLLT',
    'Mission {n} · {title}': 'Einsatz {n} · {title}',
    '▶ Replay best moment': '▶ Besten Moment ansehen',
    'REPLAY': 'WIEDERHOLUNG',
    'BEST MOMENT': 'BESTER MOMENT',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · F exit': 'FOTOMODUS · WASD bewegen · Maus umsehen · Q/E runter/hoch · Shift schneller · Mausrad Tempo · F beenden',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · Enter share · F exit': 'FOTOMODUS · WASD bewegen · Maus umsehen · Q/E runter/hoch · Shift schneller · Mausrad Tempo · Enter teilen · F beenden',

    // ---- kill juice and streak meter ----
    'DOUBLE KILL': 'DOPPELABSCHUSS',
    'TRIPLE KILL': 'DREIFACHABSCHUSS',
    'QUAD KILL': 'VIERFACHABSCHUSS',
    'RAMPAGE': 'AMOKLAUF',
    'ON FIRE ×{n}': 'IN FAHRT ×{n}',
    'ON FIRE  ×{n}': 'IN FAHRT  ×{n}',
    '{label} DOWN': '{label} ABGESCHOSSEN',
    'STREAK': 'SERIE',
    'ON YOU': 'AUF DIR',
  },
  patterns: [
    // ---- banners ----
    [/^MISSION (\d+) · (.+)$/, (m, tr) => `EINSATZ ${m[1]} · ${upper(m[2], tr)}`],
    [/^(\d{1,2}) (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) (\d{4})$/, (m) => `${m[1]}. ${MONTHS[m[2]]} ${m[3]}`],
    [/^DAILY RUN · (.+)$/, 'TAGESEINSATZ · $1'],
    [/^ROUND (\d+)$/, 'RUNDE $1'],
    [/^Wave (\d+)$/, 'Welle $1'],

    // ---- field upgrade labels ----
    [/^WAVE (\d+) CLEARED$/, 'WELLE $1 ABGEWEHRT'],
    [/^WAVE (\d+) SURVIVED$/, 'WELLE $1 ÜBERSTANDEN'],

    // ---- hangar between rounds ----
    [/^ROUND (\d+) CLEARED$/, 'RUNDE $1 GESCHAFFT'],
    [/^(\d+) kills this round · \+(\d+) merit$/, (m) => `${pl(m[1], 'Abschuss', 'Abschüsse')} in dieser Runde · +${m[2]} Verdienst`],
    [/^Round (\d+) of (\d+)$/, 'Runde $1 von $2'],
    [/^Round (\d+)$/, 'Runde $1'],

    // ---- HUD: mission line, formation, crew ----
    [/^(.+) · (\d+:\d{2})$/, (m, tr) => `${upper(m[1], tr)} · ${m[2]}`],
    [/^(\d+)\/(\d+) B-17s$/, '$1/$2 B-17'],
    [/^Gunner wounded \((\d+)\/4\)$/, 'Schütze verwundet ($1/4)'],

    // ---- HUD objective line ----
    [/^Round (\d+)(?:\/(\d+))? — (\d+:\d{2}) · (\d+) fighters$/, (m) => `${round(m[1], m[2])} — ${m[3]} · ${pl(m[4], 'Jäger', 'Jäger')}`],
    [/^Round (\d+)(?:\/(\d+))? — clear the last (\d+) fighters?$/, (m) => `${round(m[1], m[2])} — ${+m[3] === 1 ? 'schieß den letzten Jäger ab' : `schieß die letzten ${m[3]} Jäger ab`}`],
    [/^Round (\d+)(?:\/(\d+))? — (.+)$/, (m, tr) => `${round(m[1], m[2])} — ${tr(m[3])}`],
    [/^Round (\d+)\/(\d+)$/, 'Runde $1/$2'],
    [/^Wave (\d+) — (\d+) fighters remaining$/, (m) => `Welle ${m[1]} — noch ${m[2]} Jäger`],
    [/^Hold out — escort ETA (\d+)s$/, 'Durchhalten — Begleitschutz in $1 s'],
    [/^(\d+) enemy fighters? attacking$/, (m) => (+m[1] === 1 ? `${m[1]} feindlicher Jäger greift an` : `${m[1]} feindliche Jäger greifen an`)],

    // ---- pilot HUD mode line ----
    [/^(MOUSE AIM|DIRECT) · (COCKPIT|CHASE)( · STALL)?$/, (m) => `${MODE[m[1]]} · ${MODE[m[2]]}${m[3] ? ' · STRÖMUNGSABRISS' : ''}`],

    // ---- gunner HUD ----
    [new RegExp(`^${ST} — (RELOADING|BARREL HOT)$`), (m) => `${STATION[m[1]]} — ${m[2] === 'RELOADING' ? 'NACHLADEN' : 'LAUF HEISS'}`],
    [/^([1-5]) (LEFT WAIST|RIGHT WAIST|TOP TURRET|BALL TURRET|TAIL GUN)$/, (m) => `${m[1]} ${STATION_UP[m[2]]}`],
    [new RegExp(`^${ST} kills$`), (m) => `Abschüsse · ${STATION[m[1]]}`],

    // ---- tips ----
    [/^Fighters attacking the (.+) — press <kbd>(.+)<\/kbd>$/, (m, tr) => `Jäger greifen ${tr(m[1])} an — drücke <kbd>${m[2]}</kbd>`],
    [/^(\d+) fighters? in the (.+) arc — press <kbd>(.+)<\/kbd>$/, (m, tr) => `${pl(m[1], 'Jäger', 'Jäger')} im Schussfeld ${tr(m[2])} — drücke <kbd>${m[3]}</kbd>`],
    [/^Graphics set to <kbd>(\w+)<\/kbd> to keep the frame rate up \(change in Settings\)$/, (m) => `Grafik auf <kbd>${QUALITY[m[1]] ?? m[1]}</kbd> gestellt, um die Bildrate zu halten (änderbar in den Einstellungen)`],

    // ---- kill feed ----
    [/^([^—]{1,40}?) destroyed — AI gunner, (.+)$/, (m, tr) => `${tr(m[1])} zerstört — KI-Schütze, ${m[2]}`],
    [/^([^—]{1,40}?) destroyed — Escort P-51$/, (m, tr) => `${tr(m[1])} zerstört — Begleit-P-51`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed — (.+)$/, (m, tr) => `${tr(m[1])} zerstört — ${tr(m[2])}`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed$/, (m, tr) => `${tr(m[1])} zerstört`],
    [/^Double — \+(\d+)$/, 'Doppel — +$1'],
    [/^Triple — \+(\d+)$/, 'Dreifach — +$1'],
    [/^(\d+)× — \+(\d+)$/, '$1× — +$2'],
    [/^B-17 "(.+)" going down$/, 'B-17 „$1“ stürzt ab'],

    // ---- debrief reasons ----
    [/^(.+\.) The crew bailed out over enemy territory\.$/, (m, tr) => `${tr(m[1])} Die Besatzung ist über Feindgebiet abgesprungen.`],
    [/^Both pilots were hit and the (.+) fell out of control\.$/, 'Beide Piloten wurden getroffen und die $1 geriet außer Kontrolle.'],
    [/^The (.+) was shot down\.$/, 'Die $1 wurde abgeschossen.'],
    [/^Too many bombers lost — (\d+) Fortresses went down\.$/, 'Zu viele Bomber verloren — $1 Fortresses abgestürzt.'],

    // ---- loading ----
    [/^Loading aircraft and sounds… ([\d.]+) \/ ([\d.]+) MB$/, 'Flugzeuge und Sounds werden geladen… $1 / $2 MB'],

    // ---- enemy marker label ----
    [/^(.+?) {2}(\d+)m$/, (m, tr) => `${tr(m[1])}  ${m[2]}m`],
  ],
};
export default table;
