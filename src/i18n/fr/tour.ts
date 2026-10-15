import type { PhraseTable } from '../types';

// French for ar/tour.ts (same keys and patterns).

const WHAT: Record<string, string> = {
  'U-boat yards': "Chantiers de U-boote", 'Fighter airfield': "Terrain de chasse", 'Propeller works': "Usine d'hélices", 'Marshalling yards': "Gare de triage",
  'Port facilities': "Installations portuaires", 'Focke-Wulf plant': "Usine Focke-Wulf", 'Arado aircraft works': "Usine aéronautique Arado", 'Rail yards': "Dépôts ferroviaires",
  'Ball-bearing plants': "Usines de roulements à billes", 'Port area': "Zone portuaire", 'Synthetic oil plant': "Usine de carburant synthétique", 'Ball-bearing works': "Usine de roulements à billes",
  'Industrial area': "Zone industrielle", 'Naval yards': "Arsenal naval", 'Chemical works': "Usine chimique", 'Fighter assembly plant': "Usine d'assemblage de chasseurs",
  'Junkers works': "Usine Junkers", 'Aircraft works': "Usine aéronautique", 'Aircraft assembly': "Assemblage d'avions", 'Messerschmitt works': "Usine Messerschmitt",
  'Heinkel works': "Usine Heinkel", 'Bearing works': "Usine de roulements", 'Industrial rail district': "Quartier ferroviaire industriel", 'Dornier works': "Usine Dornier",
};
const CITY: Record<string, string> = {
  Emden: 'Emden', Woensdrecht: 'Woensdrecht', Frankfurt: 'Francfort', 'Saarbrücken': 'Sarrebruck', Bremen: 'Brême', Vegesack: 'Vegesack', Marienburg: 'Marienbourg',
  Anklam: 'Anklam', 'Münster': 'Münster', Schweinfurt: 'Schweinfurt', Wilhelmshaven: 'Wilhelmshaven', Gelsenkirchen: 'Gelsenkirchen', Paris: 'Paris', Solingen: 'Solingen',
  Kiel: 'Kiel', 'Osnabrück': 'Osnabrück', Ludwigshafen: 'Ludwigshafen', Oschersleben: 'Oschersleben', Halberstadt: 'Halberstadt', Brunswick: 'Brunswick',
  Leipzig: 'Leipzig', Aschersleben: 'Aschersleben', Bernburg: 'Bernburg', Gotha: 'Gotha', Rostock: 'Rostock', Regensburg: 'Ratisbonne', Augsburg: 'Augsbourg',
  Stuttgart: 'Stuttgart', Berlin: 'Berlin', Oranienburg: 'Oranienbourg', Sorau: 'Sorau', Stettin: 'Stettin', Friedrichshafen: 'Friedrichshafen',
};
const NAMES: Record<string, string> = {
  Brenner: 'Brenner', Doyle: 'Doyle', Stern: 'Stern', Kessler: 'Kessler', Mendez: 'Mendez', Gallo: 'Gallo', Reilly: 'Reilly', Price: 'Price', Walsh: 'Walsh', Dawson: 'Dawson',
  Morrow: 'Morrow', Carver: 'Carver', Pruitt: 'Pruitt', Ortega: 'Ortega', Kowalski: 'Kowalski', Hughes: 'Hughes', Baker: 'Baker', Russo: 'Russo', Novak: 'Novak', Fisher: 'Fisher',
  Whitfield: 'Whitfield', Delgado: 'Delgado', Brennan: 'Brennan', Lindqvist: 'Lindqvist', Harlan: 'Harlan', Mercer: 'Mercer',
  Jablonski: 'Jablonski', Moreno: 'Moreno', "O'Neill": "O'Neill", Petrakis: 'Petrakis', Sullivan: 'Sullivan', Carter: 'Carter', Henderson: 'Henderson', Vance: 'Vance', Kowalczyk: 'Kowalczyk', Abbott: 'Abbott',
};
const RANK: Record<string, string> = { 'Sgt.': 'Sgt', 'S/Sgt.': 'Sgt-chef', 'T/Sgt.': 'Adjudant', 'Lt.': 'Lt', 'Capt.': 'Cne', 'Maj.': 'Cdt' };
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
const name = (s: string, tr: (s: string) => string) => { const i = s.indexOf(' '); return i < 0 ? tr(s) : `${tr(s.slice(0, i))} ${tr(s.slice(i + 1))}`; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whatRx = Object.keys(WHAT).map(esc).join('|');

const table: PhraseTable = {
  phrases: {
    ...WHAT, ...CITY, ...NAMES, ...RANK,
    // menu and entry points
    'The Tour': "Le Tour d'opérations",
    'THE TOUR': "LE TOUR D'OPÉRATIONS",
    'Twenty-five missions, one ship, one crew': "Vingt-cinq missions, un avion, un équipage",
    'The Tour · 25 missions': "Le Tour · 25 missions",
    'THE TOUR · 25 MISSIONS': "LE TOUR · 25 MISSIONS",
    'A tour of duty': "Un tour d'opérations",
    'Twenty-five missions, one Fortress, one crew. Damage stays with the ship until the ground crew patches it, wounded men miss missions, and the men you lose are replaced by rookies.':
      "Vingt-cinq missions, une Forteresse, un équipage. Les dégâts restent sur l'avion jusqu'à ce que les mécanos les rapiècent, les blessés manquent des missions, et les hommes perdus sont remplacés par des bleus.",
    'Pick each target from the field orders as the air war moves from Emden to Berlin. Watch morale and fatigue, and bring them home after mission twenty-five.':
      "Choisissez chaque cible dans les ordres d'opérations, tandis que la guerre aérienne avance d'Emden à Berlin. Surveillez le moral et la fatigue, et ramenez-les chez eux après la vingt-cinquième mission.",
    'Begin the tour': "Commencer le tour",
    'Back': "Retour",
    // the board
    'Mission {n} of 25': "Mission {n} sur 25",
    '{n} sorties flown': "{n} sorties effectuées",
    '{n} of 25 missions credited': "{n} missions validées sur 25",
    'Field orders · {date}': "Ordres d'opérations · {date}",
    'Choose the target': "Choisissez la cible",
    'Mustang escort': "Escorte de Mustang",
    'Escort to the border': "Escorte jusqu'à la frontière",
    'No escort': "Sans escorte",
    'Last mission': "Dernière mission",
    'Maximum effort: danger +1, merit ×1.5.': "Effort maximal : danger +1, mérite ×1.5.",
    'Fly this mission': "Effectuer cette mission",
    'Stand down a day': "Un jour de repos",
    'The crew has had its rest. The next sortie is waiting.': "L'équipage s'est reposé. La prochaine sortie attend.",
    'A stand-down lowers fatigue and lets the wounded heal, once between missions.': "Un jour de repos réduit la fatigue et laisse les blessés guérir, une fois entre deux missions.",
    'Latest': "Dernières nouvelles",
    'Abandon the tour': "Abandonner le tour",
    'Press again to abandon the tour': "Appuyez à nouveau pour abandonner le tour",
    'Between missions': "Entre les missions",
    'Milk run': "Promenade de santé",
    'Light opposition': "Opposition légère",
    'Defended': "Défendue",
    'Heavily defended': "Fortement défendue",
    'Deep penetration': "Pénétration profonde",
    'Tour log ({n} sorties)': "Journal du tour ({n} sorties)",
    'Mission {n}': "Mission {n}",
    'Credited': "Validée",
    'Ship lost': "Avion perdu",
    'Not credited': "Non validée",
    '{n} kills': "{n} victoires",
    // the ship
    'The ship': "L'avion",
    'Damage carried by the ship': "Dégâts portés par l'avion",
    'Missions flown': "Missions effectuées",
    'Repair patches': "Rustines de réparation",
    'Condition': "État",
    'Engine {e} rough': "Moteur {e} irrégulier",
    'Ships lost: {names}': "Avions perdus : {names}",
    'Nose': "Nez", 'Cockpit': "Poste de pilotage", 'Forward fuselage': "Fuselage avant", 'Waist section': "Section des sabords", 'Rear fuselage': "Fuselage arrière", 'Tail': "Queue",
    'Engine 1': "Moteur 1", 'Engine 2': "Moteur 2", 'Engine 3': "Moteur 3", 'Engine 4': "Moteur 4",
    'Left wing': "Aile gauche", 'Left wingtip': "Saumon gauche", 'Right wing': "Aile droite", 'Right wingtip': "Saumon droit",
    // the crew
    'The crew': "L'équipage",
    'Morale': "Moral",
    'Fatigue': "Fatigue",
    'In good heart': "Excellent", 'Holding steady': "Stable", 'Shaken': "Ébranlé", 'Breaking': "Au bord de la rupture",
    'Fresh': "Frais", 'Tired': "Fatigué", 'Worn out': "Épuisé", 'Flak-happy': "Choqué par la flak",
    'Crew gunnery {n}% of a veteran crew.': "Tir de l'équipage : {n}% d'un équipage vétéran.",
    'Wounded · out {n}': "Blessé · absent {n}",
    'New man': "Nouveau",
    '{n} missions': "{n} missions",
    'Pilot': "Pilote", 'Co-Pilot': "Copilote", 'Navigator': "Navigateur", 'Bombardier': "Bombardier", 'Radio Room': "Poste radio",
    'Top Turret': "Tourelle dorsale", 'Ball Turret': "Tourelle ventrale", 'Left Waist': "Sabord gauche", 'Right Waist': "Sabord droit", 'Tail Gun': "Mitrailleur de queue",
    'Air Medal': "Air Medal", 'Oak Leaf Cluster': "Oak Leaf Cluster", 'Distinguished Flying Cross': "Distinguished Flying Cross", 'Purple Heart': "Purple Heart",
    'Interphone': "Interphone",
    // the report
    'The Tour · {n} of 25 missions credited': "Le Tour · {n} missions validées sur 25",
    'Back to the tour': "Retour au tour",
    'Mission {n} of 25 credited.': "Mission {n} sur 25 validée.",
    'The {ship} went down in the sea. Air-Sea Rescue picked up the crew. The sortie is not credited.': "Le {ship} s'est abîmé en mer. Le sauvetage en mer a récupéré l'équipage. La sortie n'est pas validée.",
    'The {ship} ditched in the sea on the way home. Air-Sea Rescue picked up the crew.': "Le {ship} a amerri sur le chemin du retour. Le sauvetage en mer a récupéré l'équipage.",
    'The {ship} was shot down. The sortie is not credited.': "Le {ship} a été abattu. La sortie n'est pas validée.",
    'The sortie is not credited. Mission {n} will be flown again.': "La sortie n'est pas validée. La mission {n} sera refaite.",
    '{who} died of his wounds.': "{who} a succombé à ses blessures.",
    '{who} is badly wounded and is going home. Purple Heart.': "{who} est grièvement blessé et rentre au pays. Purple Heart.",
    '{who} is seriously wounded: hospital for {n} missions. Purple Heart.': "{who} est sérieusement blessé : hôpital pour {n} missions. Purple Heart.",
    '{who} was nicked by a splinter and stays on flying status. Purple Heart.': "{who} a été égratigné par un éclat et reste apte au vol. Purple Heart.",
    '{who} is wounded and misses the next mission. Purple Heart.': "{who} est blessé et manquera la prochaine mission. Purple Heart.",
    '{who} did not get out of the {ship}.': "{who} n'a pas pu sortir du {ship}.",
    '{who} is missing. Nobody saw a parachute.': "{who} est porté disparu. Personne n'a vu de parachute.",
    'The rest of the crew bailed out over the coast and is back at the base.': "Le reste de l'équipage a sauté au-dessus de la côte et est de retour à la base.",
    'A replacement Fortress is assigned to the crew: the {ship}.': "Une Forteresse de remplacement est attribuée à l'équipage : le {ship}.",
    'The ground crew put {n} new patches on the {ship}. She carries {total} now.': "Les mécanos ont posé {n} nouvelles rustines sur le {ship}. Il en porte {total} désormais.",
    'The {ship} came home without a scratch.': "Le {ship} est rentré sans une égratignure.",
    'Number {e} engine is still running rough.': "Le moteur n° {e} tourne toujours de façon irrégulière.",
    '{who} is promoted to {rank}.': "{who} est promu {rank}.",
    '{medal}: {who}': "{medal} : {who}",
    'You are awarded the {medal}.': "Décoration reçue : {medal}.",
    '{who} joins the crew at the {post}.': "{who} rejoint l'équipage au poste : {post}.",
    'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.': "Moral de l'équipage {a}% → {b}%. Fatigue {c}% → {d}%.",
    'The crew is stood down for a day. Fatigue {a}% → {b}%.': "L'équipage est au repos pour la journée. Fatigue {a}% → {b}%.",
    'Maximum effort: +{n} merit.': "Effort maximal : +{n} mérite.",
    'Stand-down': "Repos",
    // the mission
    'Bring her home': "Ramenez-le à la maison",
    'Going Home': "Retour au pays",
    'Mission twenty-five. When this one is over, the crew goes home.': "Mission vingt-cinq. Quand celle-ci sera finie, l'équipage rentre au pays.",
    'Intelligence expects light opposition: a few single-engine fighters near the coast. A milk run, if there is such a thing.':
      "Le renseignement prévoit une opposition légère : quelques monomoteurs près de la côte. Une promenade de santé, si ça existe.",
    'Expect fighters on the way in and out, and flak over the target. Keep the formation tight.':
      "Attendez-vous à des chasseurs à l'aller et au retour, et à la flak au-dessus de la cible. Gardez la formation serrée.",
    'The target is well defended. Fighters will be waiting at the border, and the flak over the target is heavy.':
      "La cible est bien défendue. Les chasseurs attendront à la frontière, et la flak au-dessus de la cible est dense.",
    'This is a heavily defended target. Expect repeated attacks by single- and twin-engine fighters, with rockets from astern.':
      "C'est une cible fortement défendue. Attendez-vous à des attaques répétées de monomoteurs et de bimoteurs, avec des roquettes tirées par l'arrière.",
    'Deep penetration. Every fighter group in the Reich will be up, in relays, from the coast to the target and back. Some of us will not come home.':
      "Pénétration profonde. Tous les groupes de chasse du Reich seront en l'air, par relais, de la côte à la cible et retour. Certains d'entre nous ne rentreront pas.",
    'There is no escort beyond the Dutch coast. From there on the formation is its own escort.':
      "Aucune escorte au-delà de la côte hollandaise. À partir de là, la formation est sa propre escorte.",
    'Thunderbolts will take us as far as the German border. After that we are on our own until they meet us on the way home.':
      "Les Thunderbolt nous accompagneront jusqu'à la frontière allemande. Ensuite, nous serons seuls jusqu'à ce qu'ils nous retrouvent au retour.",
    'Mustangs will be with us all the way to the target. Hold out until the little friends arrive.':
      "Les Mustang nous accompagneront jusqu'à la cible. Tenez bon jusqu'à l'arrivée des petits amis.",
    'One new man is flying with the crew. Keep an eye on them.': "Un nouveau vole avec l'équipage. Gardez un œil sur lui.",
    'Maximum effort: every ship that can fly goes today.': "Effort maximal : tous les avions en état de voler partent aujourd'hui.",
    'Twenty-five. Wheels down at Deenethorpe, and the crew climbs out for the last time. Tour complete.':
      "Vingt-cinq. Roues au sol à Deenethorpe, et l'équipage descend pour la dernière fois. Tour terminé.",
    // the finale
    'Twenty-five missions. The crew climbs out of the {ship} for the last time.': "Vingt-cinq missions. L'équipage descend du {ship} pour la dernière fois.",
    'Lucky Bastard Club': "Lucky Bastard Club",
    'This certifies that the bearer has completed a combat tour of twenty-five missions over enemy territory with the 401st Bomb Squadron.':
      "Il est certifié que le porteur a accompli un tour d'opérations de vingt-cinq missions au-dessus du territoire ennemi avec le 401st Bomb Squadron.",
    'Sorties flown': "Sorties effectuées",
    'Confirmed kills': "Victoires confirmées",
    'Fortresses': "Forteresses",
    'Medals': "Décorations",
    'Going home with you': "Rentrent avec vous",
    'Sent home wounded': "Rapatriés blessés",
    'Remembered': "In memoriam",
    'Begin a new tour': "Commencer un nouveau tour",
    'Main menu': "Menu principal",
    // events
    'Flak house': "Maison de repos",
    'Halfway. The flight surgeon sends the crew to a rest home in the country for a week: real beds, real eggs and no interphone.':
      "Mi-parcours. Le médecin de l'escadrille envoie l'équipage une semaine dans une maison de repos à la campagne : de vrais lits, de vrais œufs et pas d'interphone.",
    'Pack your bags': "Faire ses bagages",
    'A week of sleep. The crew comes back rested.': "Une semaine de sommeil. L'équipage revient reposé.",
    'Mail call': "Distribution du courrier",
    'Letters and parcels from home reach the hut. Nobody says much for an hour.': "Lettres et colis du pays arrivent au baraquement. Personne ne parle beaucoup pendant une heure.",
    'Read your letters': "Lire son courrier",
    'The hut is quiet and warm. Morale rises.': "Le baraquement est calme et chaud. Le moral remonte.",
    'A new engine': "Un moteur neuf",
    'The crew chief has found a factory-fresh Wright Cyclone and wants to hang it on the {ship}.': "Le chef mécanicien a trouvé un Wright Cyclone sortant d'usine et veut le monter sur le {ship}.",
    'Hang the new engine': "Monter le moteur neuf",
    'The tired engine is replaced. She runs like a watch.': "Le moteur fatigué est remplacé. Il tourne comme une horloge.",
    'Forty-eight hour pass': "Permission de quarante-huit heures",
    'The crew has a pass to London. The ground crew could use extra hands on the {ship}.': "L'équipage a une permission pour Londres. Les mécanos auraient bien besoin de bras sur le {ship}.",
    'Go to London': "Aller à Londres",
    'Two days in London. The crew comes back tired but happy.': "Deux jours à Londres. L'équipage revient fatigué mais heureux.",
    'Stay and help the ground crew': "Rester aider les mécanos",
    'Extra hands on the line. The {ship} is in better shape.': "Des bras en plus sur le parking. Le {ship} est en meilleur état.",
    'Empty bunks': "Couchettes vides",
    'The crew in the next hut did not come back yesterday. Their bunks were stripped this morning.': "L'équipage du baraquement voisin n'est pas rentré hier. Leurs couchettes ont été vidées ce matin.",
    'Carry on': "Continuer",
    'Nobody talks much at breakfast.': "Personne ne parle beaucoup au petit-déjeuner.",
    'Maximum effort': "Effort maximal",
    'Group orders a maximum effort: every ship that can fly goes next. The crew chief wants the {ship} on the ground for repairs.':
      "Le groupe ordonne un effort maximal : tous les avions en état de voler partent à la prochaine mission. Le chef mécanicien veut garder le {ship} au sol pour réparations.",
    'Volunteer the {ship}': "Porter le {ship} volontaire",
    'The {ship} is on the board. The danger is higher, and so is the merit.': "Le {ship} est inscrit au tableau. Le danger est plus grand, le mérite aussi.",
    'Ground her for repairs': "Le garder au sol pour réparations",
    'The ground crew works through the night.': "Les mécanos travaillent toute la nuit.",
    'Lucky charm': "Porte-bonheur",
    "Sergeant Walsh has lost the rabbit's foot he keeps in his flak vest. He swears he will not fly without it.": "Le sergent Walsh a perdu la patte de lapin qu'il garde dans son gilet pare-éclats. Il jure qu'il ne volera pas sans elle.",
    'Search the dispersal': "Fouiller l'aire de dispersion",
    'Found it under his bunk. Walsh grins all the way to the briefing.': "Retrouvée sous sa couchette. Walsh sourit jusqu'au briefing.",
    'Tell him luck is for the Luftwaffe': "Lui dire que la chance, c'est pour la Luftwaffe",
    'Walsh flies without it. He does not say a word all day.': "Walsh vole sans elle. Il ne dit pas un mot de la journée.",
    'Fogbound': "Bloqués par le brouillard",
    'Fog sits on the field for three days. Nobody flies, and everybody sleeps.': "Le brouillard couvre le terrain pendant trois jours. Personne ne vole, tout le monde dort.",
    'Sleep': "Dormir",
    'Three quiet days.': "Trois jours tranquilles.",
    'Dance in the hangar': "Bal dans le hangar",
    'A band from the States plays in the big hangar tonight.': "Un orchestre venu des États-Unis joue ce soir dans le grand hangar.",
    'Go dancing': "Aller danser",
    'The crew dances until the band packs up.': "L'équipage danse jusqu'à ce que l'orchestre remballe.",
    'Green replacements': "Remplaçants novices",
    'The new men have never fired at a moving target. You could take them up for gunnery practice over the Wash.': "Les nouveaux n'ont jamais tiré sur une cible mobile. Vous pourriez les emmener s'entraîner au tir au-dessus du Wash.",
    'Fly a practice flight': "Faire un vol d'entraînement",
    'The new men can lead a target now.': "Les nouveaux savent maintenant viser devant la cible.",
    'Let them rest': "Les laisser se reposer",
    'They will learn over Germany.': "Ils apprendront au-dessus de l'Allemagne.",
    'The general visits': "Visite du général",
    'A general is visiting the group. The {ship} must shine.': "Un général visite le groupe. Le {ship} doit briller.",
    'Polish her': "Le faire briller",
    'The general shakes every hand. The crew stands a little taller.': "Le général serre toutes les mains. L'équipage se tient un peu plus droit.",
    'Hide in the hangar': "Se cacher dans le hangar",
    'Nobody notices you were missing.': "Personne ne remarque votre absence.",
    'Letters home': "Lettres aux familles",
    'The skipper sits up late writing to the families of the men the crew has lost.': "Le commandant veille tard pour écrire aux familles des hommes que l'équipage a perdus.",
    'Help him write': "L'aider à écrire",
    'It is the hardest thing the crew has done. They will fly the next one for them.': "C'est la chose la plus dure que l'équipage ait faite. La prochaine, ils la voleront pour eux.",
    "Armorers' work": "Travail des armuriers",
    'The armorers have new barrels and fresh belts for every gun aboard the {ship}.': "Les armuriers ont des canons neufs et des bandes fraîches pour chaque mitrailleuse du {ship}.",
    'Test fire over the sea': "Tir d'essai au-dessus de la mer",
    'Every gun runs clean.': "Toutes les mitrailleuses tirent sans accroc.",
    // titles of the field orders
    'First Light over Emden': "Premières lueurs sur Emden", 'The Dutch Airfields': "Les terrains hollandais", 'Frankfurt Morning': "Matin sur Francfort",
    'Saar Rail Yards': "Les gares de la Sarre", 'Bremen Docks': "Les docks de Brême", 'The Baltic Run': "La route de la Baltique", 'Sunday at Münster': "Dimanche à Münster",
    'Black Thursday': "Jeudi noir", 'Through the Undercast': "À travers la couche nuageuse", 'Münster Again': "Encore Münster", 'Bremen in the Clouds': "Brême dans les nuages",
    'Paris Ball-Bearings': "Les roulements de Paris", 'Kiel with the Mustangs': "Kiel avec les Mustang", 'Bremen Port Area': "Le port de Brême", 'Christmas Week': "Semaine de Noël",
    'Flak Alley': "L'allée de la flak", 'Frankfurt by Radar': "Francfort au radar", 'Frankfurt Rail Yards': "Les gares de Francfort", 'Big Week: Leipzig': "Big Week : Leipzig",
    'Big Week: Brunswick': "Big Week : Brunswick", 'Schweinfurt Again': "Encore Schweinfurt", 'Big B': "Big B", 'Erkner': "Erkner",
    'Berlin by Daylight': "Berlin en plein jour",
  },
  patterns: [
    [new RegExp(`^(${whatRx}), (.+)$`), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
    [/^Mission (\d+) of your tour\. The group is going to (.+) today, and the target is the (.+)\.$/, (m, tr) => `Mission ${m[1]} de votre tour. Le groupe va aujourd'hui sur ${tr(m[2])}, et la cible est : ${tr(m[3])}.`],
    [/^The target is the (.+) at (.+), a long way south\. The Luftwaffe knows the bombers are coming, and a battle group will meet us over the target\.$/,
      (m, tr) => `La cible : ${tr(m[1])} à ${tr(m[2])}, loin au sud. La Luftwaffe sait que les bombardiers arrivent, et un groupe de combat nous attendra au-dessus de la cible.`],
    [/^The (.+) carries (\d+) repair patches from earlier missions\.$/, (m) => `Le ${m[1]} porte ${m[2]} rustines des missions précédentes.`],
    [/^The (.+) is fresh from the depot\. Treat her well\.$/, (m) => `Le ${m[1]} sort tout juste du dépôt. Prenez-en soin.`],
    [/^Number (\d) engine is running rough\. The crew chief says she will hold\.$/, (m) => `Le moteur n° ${m[1]} tourne de façon irrégulière. Le chef mécanicien dit qu'il tiendra.`],
    [/^(.+) is in hospital\. A spare man from the pool flies in his place\.$/, (m, tr) => `${name(m[1], tr)} est à l'hôpital. Un réserviste vole à sa place.`],
    [/^(\d+) new men are flying with the crew\. Keep an eye on them\.$/, (m) => `${m[1]} nouveaux volent avec l'équipage. Gardez un œil sur eux.`],
    [/^You are on the (.+) today\. Use every position, one through five\.$/, (m, tr) => `Votre poste aujourd'hui : ${tr(m[1])}. Utilisez toutes les positions, de un à cinq.`],
    [/^Bombs on the (.+) at (.+)\. Mission (\d+) is in the books\.$/, (m, tr) => `Bombes sur ${tr(m[1])} à ${tr(m[2])}. La mission ${m[3]} est au compteur.`],
    [/^(Sgt\.|S\/Sgt\.|T\/Sgt\.|Lt\.|Capt\.|Maj\.) ([A-Z][A-Za-z']+)$/, (m, tr) => `${RANK[m[1]]} ${tr(m[2])}`],
    // recorded interphone lines (tools/voice/lines.json, group "Phase 11 the tour")
    [/^Pilot to crew: that's number ([a-z-]+) in the books\.$/, (m) => `Pilote à équipage : et de ${NUM_WORDS.indexOf(m[1]) + 1} au compteur.`],
  ],
};
table.phrases["Halfway, boys. Twelve down and thirteen to go."] = "Mi-parcours, les gars. Douze de faites, treize à faire.";
table.phrases["One more, crew. One more and we all go home."] = "Encore une, l'équipage. Encore une et on rentre tous.";
table.phrases["That's twenty-five. Crew, we're going home."] = "Et de vingt-cinq. L'équipage, on rentre à la maison.";
table.phrases["They won't count that one. We go again."] = "Celle-là ne comptera pas. On y retourne.";
table.phrases["We lost the ship. They'll find us another one."] = "On a perdu l'avion. Ils nous en trouveront un autre.";
table.phrases['Mail call! Letters from home for everybody.'] = "Courrier ! Des lettres du pays pour tout le monde.";
table.phrases['A week at the flak house. Real beds and real eggs.'] = "Une semaine à la maison de repos. De vrais lits et de vrais œufs.";
table.phrases['Maximum effort tomorrow. Get some sleep.'] = "Effort maximal demain. Dormez un peu.";
table.phrases["Fog on the field. Nobody's flying today."] = "Brouillard sur le terrain. Personne ne vole aujourd'hui.";

export default table;
