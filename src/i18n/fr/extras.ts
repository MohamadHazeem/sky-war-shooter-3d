// French for ar/extras.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MONTHS: Record<string, string> = {
  January: 'janvier', February: 'février', March: 'mars', April: 'avril', May: 'mai', June: 'juin',
  July: 'juillet', August: 'août', September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre',
};

const patterns: Pattern[] = [
  [/^([\d,]+) mph \(([\d,]+) km\/h\)$/, '$1 mph ($2 km/h)'],
  [/^([\d.]+) m × ([\d.]+) m$/, '$1 m × $2 m'],
  [/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m) => `${m[1]} ${MONTHS[m[2]]} ${m[3]}`],
];

const table: PhraseTable = {
  phrases: {
    // ---------- What's new ----------
    "What's new": 'Nouveautés',
    '401st Bomb Group · Operations bulletin': '401st Bomb Group · Bulletin des opérations',
    'Orders of the day · version {v}': 'Ordres du jour · version {v}',
    'Understood': 'Compris',
    'Try it': 'Essayer',
    "This bulletin stays pinned up: title menu → What's new, or Settings.": 'Ce bulletin reste affiché : menu principal → Nouveautés, ou Paramètres.',
    'bulletin · version {v}': 'bulletin · version {v}',
    'WANTED': 'RECHERCHÉ',
    'WEEK': 'SEMAINE',
    'BETA': 'BÊTA',
    'Choose the next target on a living 1943–44 map. Side raids on rail yards, airfields and oil hit the Luftwaffe where it hurts.':
      'Choisissez la prochaine cible sur une carte vivante de 1943–44. Les raids secondaires sur les gares de triage, les aérodromes et le pétrole frappent la Luftwaffe là où ça fait mal.',
    'Take-off and landing': 'Décollage et atterrissage',
    'Dawn take-off from Deenethorpe and the landing afterwards: red flares and fire trucks if she comes home shot up. Skippable.':
      'Décollage à l\'aube de Deenethorpe puis atterrissage : fusées rouges et camions de pompiers si elle rentre criblée. Peut être passé.',
    'Boss battle groups': 'Groupes de combat de boss',
    'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.':
      'Un groupe de combat de Luftkreuzer fonce sur la formation dès la première manche. Détruisez ses tourelles, moteurs et canons de DCA pour percer le blindage, puis criblez la coque.',
    'Luftkreuzer flying warships with turrets, flak and rocket pods. Shoot the parts away to breach the armour.':
      'Les Luftkreuzer, navires de guerre volants avec tourelles, DCA et lance-roquettes. Détruisez leurs éléments pour percer le blindage.',
    'Living B-17 interior': 'Intérieur vivant du B-17',
    'The other waist gunner fights beside you, brass piles up, frost creeps over the glass. Hold C to look around.':
      'L\'autre mitrailleur de sabord se bat à vos côtés, les douilles s\'entassent, le givre envahit les vitres. Maintenez C pour regarder autour.',
    'P-51 special operations': 'Opérations spéciales P-51',
    'Defend the Field against a Ju 88 raid, hunt bombers as a Night Fighter, or go Train Busting at treetop height.':
      'Défendez la base contre un raid de Ju 88, chassez les bombardiers en chasseur de nuit, ou attaquez des trains en rase-mottes.',
    'Wingman orders': 'Ordres à l\'ailier',
    'Your wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up.':
      'Votre ailier dans chaque mission P-51 : 1 attaque ma cible, 2 couvre-moi, 3 protège les bombardiers, 4 reprends la formation.',
    'Experten nemesis aces': 'As ennemis Experten',
    'Named Luftwaffe aces who remember you, carry scars and grudges, and climb the ranks if they get away.':
      'Des as nommés de la Luftwaffe qui se souviennent de vous, portent cicatrices et rancunes, et montent en grade s\'ils s\'échappent.',
    'Skill tree': 'Arbre de compétences',
    'Spend points from promotions in three branches: Marksman, Gunnery Sergeant and Survivor.':
      'Dépensez les points de promotion dans trois branches : Tireur d\'élite, Sergent artilleur et Survivant.',
    'Custom battle and weekly': 'Bataille personnalisée et défi hebdo',
    'Build your own battle: enemies, weather, time of day, a boss round. Or fly the weekly challenge for its ribbon.':
      'Créez votre bataille : ennemis, météo, heure, manche de boss. Ou relevez le défi hebdomadaire pour son ruban.',
    'Scrub the last 90 seconds of a mission, fly a free camera, save the best moments and screenshots.':
      'Parcourez les 90 dernières secondes d\'une mission, pilotez une caméra libre, enregistrez les meilleurs moments et des captures.',
    'Co-op': 'Coop',
    'Two gunners, one B-17: share a room code with a friend and man different guns online.':
      'Deux mitrailleurs, un B-17 : partagez un code de salon avec un ami et tenez des postes différents en ligne.',
    'Arabic': 'Arabe',
    'Every screen in Arabic, right to left. Switch the language in Settings.': 'Tous les écrans en arabe, de droite à gauche. Changez de langue dans les Paramètres.',

    // ---------- gallery: screen ----------
    'recognition · quiz': 'identification · quiz',
    'Aircraft recognition': 'Identification des avions',
    'Hangar 2 · Deenethorpe': 'Hangar 2 · Deenethorpe',
    'Gallery': 'Galerie',
    'Recognition quiz': 'Quiz d\'identification',
    'Drag to orbit · wheel or pinch to zoom · ← → change aircraft · gamepad: right stick, LT / RT, LB / RB':
      'Glissez pour tourner · molette ou pincement pour zoomer · ← → changer d\'avion · manette : stick droit, LT / RT, LB / RB',
    'Previous aircraft': 'Avion précédent',
    'Next aircraft': 'Avion suivant',
    'Wheeling her out…': 'Sortie du hangar…',
    'Fictional · boss': 'Fictif · boss',
    'Allied · USAAF': 'Allié · USAAF',
    'Luftwaffe': 'Luftwaffe',
    'On our side: hold your fire': 'Dans notre camp : ne tirez pas',
    'Warships downed by you:': 'Navires abattus par vous :',
    'Shot down by you:': 'Abattus par vous :',
    'Crew': 'Équipage',
    'Armament': 'Armement',
    'Top speed': 'Vitesse max.',
    'First flight': 'Premier vol',
    'Span × length': 'Envergure × longueur',
    "Gunner's note": 'Note du mitrailleur',
    'HANGAR 2 · KEEP CLEAR': 'HANGAR 2 · NE PAS ENCOMBRER',
    // quiz
    'Round {i} / {n}': 'Manche {i} / {n}',
    'Score {n}': 'Score {n}',
    'Identify the aircraft': 'Identifiez l\'avion',
    'Correct: {name}': 'Exact : {name}',
    'No: that was the {name}': 'Non : c\'était le {name}',
    'Results': 'Résultats',
    'Next': 'Suivant',
    '{n} of {total} identified': '{n} sur {total} identifiés',
    'New best score!': 'Nouveau record !',
    'Best score: {n} / {total}': 'Record : {n} / {total}',
    'Again': 'Rejouer',

    // ---------- gallery: spec cards ----------
    'Boeing B-17G Flying Fortress': 'Boeing B-17G Flying Fortress',
    'Heavy bomber · your aircraft': 'Bombardier lourd · votre avion',
    '13 × .50 cal M2 machine guns · up to 8,000 lb of bombs': '13 mitrailleuses M2 de calibre .50 · jusqu\'à 8 000 lb de bombes',
    'Five gun positions you can man: switch seats to meet each attack where it comes from.': 'Cinq postes de tir à votre disposition : changez de poste pour contrer chaque attaque d\'où elle vient.',
    'North American P-51D Mustang': 'North American P-51D Mustang',
    'Long-range escort fighter': 'Chasseur d\'escorte à long rayon d\'action',
    '6 × .50 cal M2 machine guns': '6 mitrailleuses M2 de calibre .50',
    'Friendly! Bubble canopy and a belly scoop: hold your fire when one dives past the bombers.': 'Ami ! Verrière bulle et écope ventrale : ne tirez pas quand il plonge le long des bombardiers.',
    'Focke-Wulf Fw 190 A-8': 'Focke-Wulf Fw 190 A-8',
    'Fighter · bomber destroyer': 'Chasseur · destructeur de bombardiers',
    '2 × 13 mm MG 131 · 4 × 20 mm MG 151/20 cannon': '2 MG 131 de 13 mm · 4 canons MG 151/20 de 20 mm',
    "Attacks head-on from twelve o'clock high in tight groups: meet him with the top turret and fire early.": 'Attaque de face à midi haut en groupes serrés : accueillez-le avec la tourelle dorsale et tirez tôt.',
    'Messerschmitt Bf 109 G-14': 'Messerschmitt Bf 109 G-14',
    'Fighter': 'Chasseur',
    '1 × 20 mm MG 151/20 cannon · 2 × 13 mm MG 131': '1 canon MG 151/20 de 20 mm · 2 MG 131 de 13 mm',
    'Nimble but lightly built: a short, well-led burst brings him down. Watch for him diving on stragglers.': 'Agile mais fragile : une rafale courte bien anticipée l\'abat. Méfiez-vous de ses piqués sur les traînards.',
    'Messerschmitt Bf 110 G': 'Messerschmitt Bf 110 G',
    'Zerstörer heavy fighter': 'Chasseur lourd Zerstörer',
    '2 × 20 mm cannon · 4 × 7.92 mm MG · twin rear MG 81Z · 21 cm rockets': '2 canons de 20 mm · 4 MG de 7,92 mm · MG 81Z jumelée arrière · roquettes de 21 cm',
    'Hangs back out of range and lobs 21 cm rockets from a kilometre: break the wave up before it fires.': 'Reste hors de portée et lance des roquettes de 21 cm à un kilomètre : dispersez la vague avant qu\'elle ne tire.',
    'Junkers Ju 88 A-4': 'Junkers Ju 88 A-4',
    'Bomber · heavy fighter': 'Bombardier · chasseur lourd',
    '7.92 mm and 13 mm defensive guns · 1,400 kg of bombs internally': 'Armes défensives de 7,92 et 13 mm · 1 400 kg de bombes en soute',
    'Slow and armoured: go for an engine, not the fuselage.': 'Lent et blindé : visez un moteur, pas le fuselage.',
    'Messerschmitt Me 262 A-1a Schwalbe': 'Messerschmitt Me 262 A-1a Schwalbe',
    'Jet fighter': 'Chasseur à réaction',
    '4 × 30 mm MK 108 cannon': '4 canons MK 108 de 30 mm',
    '18 April 1941 (first jet flight 18 July 1942)': '18 avril 1941 (premier vol à réaction 18 juillet 1942)',
    'Too fast to track: lead him far ahead, and fire as he slows to line up his cannon.': 'Trop rapide à suivre : anticipez très loin devant, et tirez quand il ralentit pour aligner ses canons.',
    'Messerschmitt Me 163 B Komet': 'Messerschmitt Me 163 B Komet',
    'Rocket interceptor': 'Intercepteur à fusée',
    '2 × 30 mm MK 108 cannon': '2 canons MK 108 de 30 mm',
    'A few minutes of rocket fuel: one slashing pass, then he glides home. One good hit and he is done.': 'Quelques minutes de carburant : une seule passe fulgurante, puis il rentre en vol plané. Un bon coup et c\'est fini.',
    'Heinkel He 111 H': 'Heinkel He 111 H',
    'Medium bomber': 'Bombardier moyen',
    'Up to 7 × 7.92 mm MG · 2,000 kg of bombs': 'Jusqu\'à 7 MG de 7,92 mm · 2 000 kg de bombes',
    'Glazed nose, close formations, a gunner in every window: attack from below and go for the engines.': 'Nez vitré, formations serrées, un mitrailleur à chaque fenêtre : attaquez par en dessous et visez les moteurs.',
    'Messerschmitt Me 410 A Hornisse': 'Messerschmitt Me 410 A Hornisse',
    'Heavy fighter · bomber destroyer': 'Chasseur lourd · destructeur de bombardiers',
    '2 × 20 mm cannon · 2 × 7.92 mm MG · 2 × 13 mm remote barbettes · 50 mm BK 5 cannon (U4)': '2 canons de 20 mm · 2 MG de 7,92 mm · 2 barbettes télécommandées de 13 mm · canon BK 5 de 50 mm (U4)',
    'The BK 5 cannon telegraphs: he lines up from two kilometres and holds steady. Kill him before he fires.': 'Le canon BK 5 le trahit : il s\'aligne à deux kilomètres et reste stable. Abattez-le avant qu\'il ne tire.',
    'Shown on the Bf 110 airframe the game uses as a stand-in.': 'Présenté sur la cellule du Bf 110 que le jeu utilise en remplacement.',
    'Dornier Do 335 A Pfeil': 'Dornier Do 335 A Pfeil',
    'Heavy fighter (push-pull)': 'Chasseur lourd (push-pull)',
    '1 × 30 mm MK 103 cannon · 2 × 20 mm MG 151/20': '1 canon MK 103 de 30 mm · 2 MG 151/20 de 20 mm',
    'A propeller at each end: he dives from high astern as fast as a jet. Watch the tail and lead him hard.': 'Une hélice à chaque bout : il pique de haut par l\'arrière aussi vite qu\'un jet. Surveillez la queue et anticipez fort.',
    'Luftkreuzer (fictional)': 'Luftkreuzer (fictif)',
    'Flying warship · boss battle group': 'Navire de guerre volant · groupe de combat de boss',
    'Fictional': 'Fictif',
    'Gun turrets · 8.8 cm dorsal flak · rocket pods': 'Tourelles · flak dorsale de 8,8 cm · lance-roquettes',
    'Never: invented for the game': 'Jamais : inventé pour le jeu',
    'About three times a Ju 88': 'Environ trois fois un Ju 88',
    'Shoot away turrets, engines and flak to breach the armour, then pour fire into the hull.': 'Détruisez tourelles, moteurs et DCA pour percer le blindage, puis criblez la coque.',
    'Fictional: no such aircraft was ever built.': 'Fictif : aucun appareil de ce type n\'a jamais été construit.',
  },
  patterns,
};
export default table;
