// French for ar/mastery.ts (same keys and patterns).
import type { PhraseTable } from '../types';

const table: PhraseTable = {
  phrases: {
    // menu
    'Gunner Mastery': 'Maîtrise du mitrailleur',
    'Station ranks, challenges and unlocks': 'Rangs par poste, défis et déblocages',
    'GUNNER MASTERY': 'MAÎTRISE DU MITRAILLEUR',
    'Gunner Mastery reward': 'Récompense de maîtrise',
    'Weekly Ace Hunt · B-17 Gunner': 'Chasse aux as hebdo · Mitrailleur de B-17',
    'WEEKLY ACE HUNT · TOP 10': 'CHASSE AUX AS HEBDO · TOP 10',

    // ranks
    'Trainee': 'Élève',
    'Gunner': 'Mitrailleur',
    'Seasoned Gunner': 'Mitrailleur aguerri',
    'Expert': 'Expert',
    'Ace Gunner': 'As mitrailleur',
    'Master Gunner': 'Maître mitrailleur',
    'Legend': 'Légende',

    // tabs
    'Stations': 'Postes',
    'Challenges': 'Défis',
    'Locker': 'Casier',
    'Stats': 'Stats',

    // stations tab
    'Rank {n}': 'Rang {n}',
    'Tier {n}': 'Palier {n}',
    '{xp} / {next} XP': '{xp} / {next} XP',
    'Highest rank · {xp} XP': 'Rang maximal · {xp} XP',
    'accuracy {p}': 'précision {p}',
    'Mastery XP: 10 a kill, +10 deflection, +25 ace, +10 at 600 m or more, +5 heavy, +20 an untouched round, +20 for 25% accuracy over 100 rounds.':
      'XP de maîtrise : 10 par victoire, +10 en tir de déflexion, +25 pour un as, +10 à 600 m ou plus, +5 pour un lourd, +20 pour une manche sans dégâts, +20 pour 25 % de précision sur 100 balles.',
    'Best gun: {s}, rank {n}': 'Meilleur poste : {s}, rang {n}',
    '{n} of {of} ranks': '{n} rangs sur {of}',
    'Goal reached ✓ {p}': 'Objectif atteint ✓ {p}',

    // rewards
    'Gun sight': 'Viseur',
    'Crew patch': "Écusson d'équipage",
    'Weekly Ace Hunt goal': 'Objectif de la chasse aux as hebdo',

    // challenges
    'Deflection Shooting': 'Tir de déflexion',
    'Down fighters crossing your line of fire at 60° or more.': 'Abattez des chasseurs qui croisent votre ligne de tir à 60° ou plus.',
    'Ace Hunter': "Chasseur d'as",
    'Down aces: named Experten, Ace Hunt aces and squadron leaders.': "Abattez des as : Experten nommés, as de la chasse hebdo et chefs d'escadrille.",
    'Untouched': 'Intact',
    'Clear a round at the guns without your B-17 taking a hit.': 'Terminez une manche aux mitrailleuses sans que votre B-17 soit touché.',
    'Long Shot': 'Tir lointain',
    'Down fighters 600 m away or more.': 'Abattez des chasseurs à 600 m ou plus.',
    'Every Gun': 'Tous les postes',
    'Kills at every gun station: counts the station with the fewest.': 'Victoires à chaque poste de tir : le poste le moins fourni compte.',
    'All tiers complete · {n}': 'Tous les paliers terminés · {n}',

    // weekly Ace Hunt
    'Fw 190s': 'Fw 190',
    'Bf 109s': 'Bf 109',
    'Heavy fighters (Bf 110 / Ju 88 / Me 410)': 'Chasseurs lourds (Bf 110 / Ju 88 / Me 410)',
    'Jets and rockets (Me 262 / Me 163)': 'Avions à réaction et fusées (Me 262 / Me 163)',
    'Week {n}': 'Semaine {n}',
    'B-17 gunners': 'Mitrailleurs de B-17',
    'Quarry': 'Gibier',
    'Every gunner sortie this week counts: campaign, Survival and the other modes.': 'Chaque sortie de mitrailleur cette semaine compte : campagne, Survie et les autres modes.',
    'Resets in': 'Réinitialisation dans',
    'points': 'points',
    'Goal reached': 'Objectif atteint',
    '{k} kills · {m} sorties this week': '{k} victoires · {m} sorties cette semaine',
    'Weeks won: {n}': 'Semaines gagnées : {n}',
    'Goal reward: +{m} merit every week, and the Hunt Master patch the first time.': "Récompense : +{m} mérite chaque semaine, et l'écusson Maître de chasse la première fois.",
    'Quarry kill (extra)': 'Gibier abattu (bonus)',
    'Ace kill': 'As abattu',
    'Deflection kill': 'Victoire en déflexion',
    'Kill at 600 m or more': 'Victoire à 600 m ou plus',
    'Untouched round': 'Manche sans dégâts',
    'Weekly Ace Hunt': 'Chasse aux as hebdo',
    '+{n} points': '+{n} points',

    // Locker
    'EQUIPPED': 'ÉQUIPÉ',
    'EQUIP': 'ÉQUIPER',
    'Gun sights': 'Viseurs',
    "Your reticle on the waist guns, the top turret and the ball turret's reflector glass.": 'Votre réticule aux sabords, dans la tourelle dorsale et sur la vitre réflectrice de la tourelle ventrale.',
    'Crew patches': "Écussons d'équipage",
    'Worn on your mastery record and in the debrief.': 'Affiché sur votre fiche de maîtrise et au débriefing.',
    'Bomber names': 'Noms du bombardier',
    // sights
    'Standard Ring': 'Anneau standard',
    'Issue ring with four ticks and a centre dot.': 'Anneau réglementaire à quatre repères et point central.',
    'Mk IX Reflector': 'Réflecteur Mk IX',
    'Two rings for range and a fine centre dot, in amber.': 'Deux anneaux de distance et un fin point central, couleur ambre.',
    'Fine Crosshair': 'Croix fine',
    'Thin cross with range ticks, nothing else in the way.': 'Croix fine avec repères de distance, rien d’autre pour gêner.',
    'Gyro K-14': 'Gyro K-14',
    'Six diamonds round a centre pipper, like the fighters carry.': 'Six losanges autour d’un point central, comme sur les chasseurs.',
    "Ace's Chevron": "Chevron d'as",
    'A gold chevron over the aim point and a short ring.': 'Un chevron doré au-dessus du point de visée et un anneau court.',
    'Tracer Dot': 'Point traçant',
    'A bright green dot in a broken ring.': 'Un point vert vif dans un anneau brisé.',
    'Deflection Rings': 'Anneaux de déflexion',
    'Inner and outer lead rings with crossing-speed ticks.': "Anneaux d'anticipation intérieur et extérieur avec repères de vitesse de croisement.",
    // patches
    "Gunner's Wings": 'Ailes du mitrailleur',
    'Port Watch': 'Veille bâbord',
    'Starboard Watch': 'Veille tribord',
    'Top Hat': 'Haut-de-forme',
    'Ball Bearing': 'Roulement à billes',
    'Stinger': 'Dard',
    'Crossfire': 'Feux croisés',
    'Hunt Master': 'Maître de chasse',

    // stats
    'Hits': 'Touchés',
    'Rounds fired': 'Balles tirées',
    'Time at the gun': 'Temps au poste',
    'All stations': 'Tous les postes',
    'Your best gun: {s}, {p} accuracy.': 'Votre meilleur poste : {s}, {p} de précision.',
    'Deflection': 'Déflexion',
    'Aces': 'As',
    '600 m+': '600 m+',
    'Heavies': 'Lourds',
    'Untouched rounds': 'Manches sans dégâts',
    'Best sortie': 'Meilleure sortie',
    'Rounds and hits are counted since Gunner Mastery arrived; earlier kills carry over from your service record.': "Balles et touchés sont comptés depuis l'arrivée de la Maîtrise ; les victoires antérieures viennent de vos états de service.",

    // debrief
    'RANK UP': 'RANG SUPÉRIEUR',
    '{k} kills · {d} deflection · {a} aces': '{k} victoires · {d} en déflexion · {a} as',
  },
};

export default table;
