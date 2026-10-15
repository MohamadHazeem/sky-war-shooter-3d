// French for ar/pilot.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { INTERCEPT: 'INTERCEPTION', SWEEP: 'BALAYAGE', STRAGGLER: 'TRAÎNARD' };
const SIDE: Record<string, string> = { left: 'à gauche', right: 'à droite' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (INTERCEPT|SWEEP|STRAGGLER) — (.+)$/, (m, tr) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])}`],
  [/^ROUND (\d+) · (INTERCEPT|SWEEP|STRAGGLER)$/, (m) => `MANCHE ${m[1]} · ${KIND[m[2]]}`],
  [/^cover "(.+)" \((\d+)%\) · (\d+)s$/, 'couvrez « $1 » ($2 %) · $3 s'],
  [/^cover "(.+)" \((\d+)%\) · clear her six$/, 'couvrez « $1 » ($2 %) · dégagez ses six heures'],
  [/^(\d+) bandits?, (\d+) on the bombers$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'bandit' : 'bandits'}, ${m[2]} sur les bombardiers`],
  [/^(\d+) bandits?$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'bandit' : 'bandits'}`],
  [/^(\d+) bombers protected — \+(\d+)$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'bombardier protégé' : 'bombardiers protégés'} — +${m[2]}`],
  [/^Straggler defended — \+(\d+)$/, 'Traînard défendu — +$1'],
  [/^Bomber saved — \+(\d+)$/, 'Bombardier sauvé — +$1'],
  [/^Intercepted — \+(\d+)$/, 'Interception — +$1'],
  [/^Straggler "(.+)" lost$/, 'Traînard « $1 » perdu'],
  [/^Cover "(.+)" — she's falling out of formation$/, 'Couvrez « $1 » — elle quitte la formation'],
  [/^"(.+)" is heading home · \+(\d+)$/, '« $1 » rentre à la base · +$2'],
  [/^Careful, Blue two — that (.+) has a rear gunner\. Come at him from below!$/, (m, tr) => `Attention, Bleu deux — ce ${tr(m[1])} a un mitrailleur arrière. Attaquez-le par en dessous !`],
  [/^He's seen you — he's breaking (left|right)! Stay with him!$/, (m) => `Il vous a vu — il dégage ${SIDE[m[1]]} ! Restez sur lui !`],
  [/^The (.+) is diving away — let him go or run him down!$/, (m, tr) => `Le ${tr(m[1])} plonge pour fuir — laissez-le ou rattrapez-le !`],
  [/^Little friends, this is (.+)\. We've lost two engines and can't keep up — can you cover us\?$/, 'Petits amis, ici « $1 ». Deux moteurs perdus, on ne suit plus — vous pouvez nous couvrir ?'],
];

const table: PhraseTable = {
  phrases: {
    // m4 / m7 briefings and objectives
    'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. First the Focke-Wulfs and Zerstörers will go for the bombers — intercept them before they reach the box. Then expect a fighter sweep of 109s hunting the escort, flying in pairs: watch for the wingman. And if a Fortress falls out of formation, the wolves will go for her. Do not let them.':
      'Vous pilotez un P-51D Mustang en escorte rapprochée d’un box de douze Forteresses. D’abord, les Focke-Wulf et les Zerstörer s’en prendront aux bombardiers — interceptez-les avant qu’ils n’atteignent le box. Ensuite, attendez-vous à un balayage de 109 chassant l’escorte, par paires : surveillez l’ailier. Et si une Forteresse quitte la formation, les loups fondront sur elle. Ne les laissez pas faire.',
    'Mouse aim flies the aircraft toward where you look. W and S for throttle, V for cockpit or chase view, T padlocks the nearest bandit. Your six fifties are harmonised at two hundred and fifty metres — get in close.':
      'La visée à la souris dirige l’avion là où vous regardez. W et S pour les gaz, V pour la vue cockpit ou poursuite, T verrouille le bandit le plus proche. Vos six calibres .50 sont harmonisés à deux cent cinquante mètres — approchez-vous.',
    'Intercept the attackers before they reach the bombers': 'Interceptez les assaillants avant qu’ils n’atteignent les bombardiers',
    'Win the dogfight against the fighter sweep': 'Remportez le combat tournoyant contre le balayage de chasseurs',
    'Save the straggler': 'Sauvez le traînard',
    'You lead the escort for our box. Rocket-armed Zerstörers will try to break up the formation, then the 109s and the new jets will come for the escort. The Me 262 is faster than anything we have — do not chase it, turn inside it and catch it when it comes back round. Bf 110s carry a rear gunner: come at them from below.':
      'Vous menez l’escorte de notre box. Des Zerstörer armés de roquettes tenteront de disloquer la formation, puis les 109 et les nouveaux avions à réaction viendront pour l’escorte. Le Me 262 est plus rapide que tout ce que nous avons — ne le poursuivez pas, virez à l’intérieur et cueillez-le quand il revient. Les Bf 110 ont un mitrailleur arrière : attaquez-les par en dessous.',
    'Over the target a crippled Fortress will need you. Pick your targets, protect the bombers, and keep your speed up.':
      'Au-dessus de l’objectif, une Forteresse touchée aura besoin de vous. Choisissez vos cibles, protégez les bombardiers et gardez de la vitesse.',
    'Break up the Zerstörer attacks': 'Brisez les attaques des Zerstörer',
    'Survive the sweep of 109s and jets': 'Survivez au balayage des 109 et des réacteurs',
    'Save the straggler over Berlin': 'Sauvez le traînard au-dessus de Berlin',

    // PilotRounds titles and objectives
    'Intercept — head them off before they reach the box': 'Interception — coupez-leur la route avant le box',
    'Fighter sweep — the 109s are hunting the escort': 'Balayage de chasse — les 109 traquent l’escorte',
    'Save the straggler — a Fortress is falling out': 'Sauvez le traînard — une Forteresse décroche',
    'Intercept — break up the Zerstörer attack': 'Interception — brisez l’attaque des Zerstörer',
    'Fighter sweep — 109s and jets over Berlin': 'Balayage de chasse — 109 et réacteurs sur Berlin',
    'Save the straggler — a crippled Fortress over Berlin': 'Sauvez le traînard — une Forteresse touchée sur Berlin',
    'Dogfight the sweep — keep them off the bombers': 'Combattez le balayage — éloignez-les des bombardiers',
    'Cover the straggler': 'Couvrez le traînard',
    'Break up the attacks before they reach the bombers': 'Brisez les attaques avant qu’elles n’atteignent les bombardiers',
    'Win the dogfight — keep them off the bombers': 'Gagnez le combat — éloignez-les des bombardiers',
    'more bandits inbound': 'd’autres bandits en approche',
    'sky clear': 'ciel dégagé',
    'STRAGGLER': 'TRAÎNARD',
    'STRAGGLER SAVED': 'TRAÎNARD SAUVÉ',

    // pilot radio
    "He's reversing — scissors! Throttle back, make him fly out in front!": 'Il inverse — ciseaux ! Réduisez les gaz, faites-le passer devant !',
    "Jet's running — don't chase him, catch him when he turns back!": 'Le réacteur file — ne le poursuivez pas, cueillez-le quand il revient !',
    "Head-on! Hold your fire till he's close, then break high!": 'De face ! Retenez votre tir jusqu’à ce qu’il soit près, puis dégagez en montée !',
    'Watch it, Blue two — his wingman is sliding in behind you!': 'Attention, Bleu deux — son ailier se glisse derrière vous !',
    "He's spiralling down — don't follow him into the deck!": 'Il descend en spirale — ne le suivez pas jusqu’au sol !',
    "Focke-Wulf's zooming up for another pass. Keep your speed!": 'Le Focke-Wulf remonte en chandelle pour une autre passe. Gardez votre vitesse !',
    'Thanks, little friend — he was all over us!': 'Merci, petit ami — il nous collait de partout !',
    "We owe you one, little friend. We're going to make it!": 'On vous en doit une, petit ami. On va s’en sortir !',
    'Bandits twelve o\'clock low, climbing for the bombers. Get between them and the big friends!': 'Bandits à midi bas, ils montent vers les bombardiers. Interposez-vous entre eux et les gros amis !',
    "Little friends, twin-engine bandits closing at our six — they've got rockets!": 'Petits amis, des bimoteurs ennemis approchent dans nos six heures — ils ont des roquettes !',
    "Another gaggle, nine o'clock level. Some of them are coming for us!": 'Une autre meute, à neuf heures même altitude. Certains viennent pour nous !',
    'Heads up — 109s high at six, coming down on us! Break and engage!': 'Attention — des 109 hauts à six heures, ils plongent sur nous ! Dégagez et engagez !',
    "Bandits on the bombers, twelve o'clock! Little friends, where are you?": 'Bandits sur les bombardiers, à midi ! Petits amis, où êtes-vous ?',
    "Focke-Wulfs diving out of the sun — don't try to out-climb them!": 'Des Focke-Wulf plongent du soleil — n’essayez pas de les battre en montée !',
    'Bandits going for the cripple! Blue two, get back there and cover her!': 'Les bandits foncent sur l’avion touché ! Bleu deux, retournez-y et couvrez-la !',
    "More of them coming in on our tail — we can't take another pass!": 'D’autres arrivent dans notre queue — on ne tiendra pas une autre passe !',
    "One last pass at the box, twelve o'clock. Let's finish this!": 'Une dernière passe sur le box, à midi. Finissons-en !',
    "Big gaggle at twelve o'clock — drop tanks and go! Hit them before they reach the box!": 'Grosse meute à midi — larguez les bidons et foncez ! Frappez-les avant le box !',
    "Zerstörers at six o'clock, with rockets! Get them off us!": 'Des Zerstörer à six heures, avec des roquettes ! Débarrassez-nous-en !',
    "Jets! Twelve o'clock high, fast movers — go for them when they slow down!": 'Des réacteurs ! À midi haut, très rapides — attaquez-les quand ils ralentissent !',
    "Messerschmitts, high at five o'clock! Here they come — break!": 'Des Messerschmitt, hauts à cinq heures ! Les voilà — dégagez !',
    "Jets coming through! You won't out-run them — turn inside them!": 'Des réacteurs passent ! Vous ne les distancerez pas — virez à l’intérieur !',
    "Fighters on the bombers, twelve o'clock level!": 'Chasseurs sur les bombardiers, à midi même altitude !',
    "They're sending another Gruppe down on us. Stay together!": 'Ils lancent une autre Gruppe sur nous. Restez groupés !',
    "They're on the straggler! Blue two, cover her, I'll take the box!": 'Ils sont sur le traînard ! Bleu deux, couvrez-la, je prends le box !',
    'Jet coming up our tail! Somebody get him off us!': 'Un réacteur remonte dans notre queue ! Quelqu’un, débarrassez-nous-en !',
    "Last push — they're throwing everything at the box!": 'Dernier assaut — ils jettent tout sur le box !',

    // field dressing, special events, pacing
    "Hold still — I've patched you up. Back on that gun.": 'Ne bouge pas — je t’ai rafistolé. Retourne à ta mitrailleuse.',
    "The yellow noses are breaking off — they've lost their leader!": 'Les nez jaunes décrochent — ils ont perdu leur chef !',
    "Rocket barrage! Heavies standing off at a kilometre — they'll keep lobbing rockets into the box until we knock them down!": 'Barrage de roquettes ! Des lourds à un kilomètre — ils arroseront le box de roquettes tant qu’on ne les aura pas abattus !',
    "Launchers are down! That's the end of the rockets.": 'Les lanceurs sont abattus ! Fini les roquettes.',
    "They're out of rockets — the heavies are heading home.": 'Ils n’ont plus de roquettes — les lourds rentrent chez eux.',
    "That's the last of the destroyers! Nice work, boys.": 'C’était le dernier des Zerstörer ! Beau travail, les gars.',
    "That one's an ace — kill markings all down the tail. Watch him!": 'Celui-là est un as — des marques de victoires plein la dérive. Surveillez-le !',
    "That's the lot of them! They're breaking off!": 'C’est tout ce qu’ils avaient ! Ils décrochent !',
    // share / privacy (Share.ts, Analytics.ts)
    'Share screenshot': 'Partager une capture',
    'Share result': 'Partager le résultat',
    'Could not capture the screen': 'Impossible de capturer l’écran',
    'Screenshot saved · share text and link copied': 'Capture enregistrée · texte et lien copiés',
    'Screenshot saved': 'Capture enregistrée',
    'Result and link copied — paste it anywhere': 'Résultat et lien copiés — collez-les où vous voulez',
    'PRIVACY': 'CONFIDENTIALITÉ',
    'Share anonymous gameplay stats': 'Partager des statistiques de jeu anonymes',
    'Your browser asks sites not to track you (Do Not Track), so no stats are sent.': 'Votre navigateur demande aux sites de ne pas vous suivre (Do Not Track) : aucune statistique n’est envoyée.',
    'One anonymous summary per mission (mission, result, kills, accuracy, gun positions used, settings, screen size and frame rate) helps balance the game. No name, account or personal data is sent.': 'Un résumé anonyme par mission (mission, résultat, victoires, précision, postes de tir utilisés, réglages, taille d’écran et fréquence d’images) aide à équilibrer le jeu. Aucun nom, compte ni donnée personnelle n’est envoyé.',
  },
  patterns,
};
export default table;
