// French for ar/campaign.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const CITY: Record<string, string> = {
  Hamm: 'Hamm', Münster: 'Münster', Osnabrück: 'Osnabrück', Hannover: 'Hanovre', Rheine: 'Rheine', Twente: 'Twente',
  Oldenburg: 'Oldenbourg', Gelsenkirchen: 'Gelsenkirchen', Leuna: 'Leuna', Misburg: 'Misburg', Wilhelmshaven: 'Wilhelmshaven',
  Kiel: 'Kiel', Emden: 'Emden', Brunswick: 'Brunswick', Kassel: 'Cassel', Gotha: 'Gotha',
};
const TARGET: Record<string, string> = {
  'Marshalling yards': 'Gare de triage', 'Rail junction': 'Nœud ferroviaire', 'Rail yards': 'Dépôt ferroviaire',
  'Fighter airfield': 'Terrain de chasse', 'Fighter base': 'Base de chasse',
  'Synthetic oil plant': 'Usine de pétrole synthétique', 'Synthetic fuel works': 'Usine de carburant synthétique', 'Refinery': 'Raffinerie',
  'U-boat base': 'Base de U-boote', 'U-boat yards': 'Chantiers de U-boote',
  'Aircraft assembly plant': "Usine d'assemblage d'avions", 'Fieseler works': 'Usine Fieseler', 'Gothaer Waggonfabrik': 'Gothaer Waggonfabrik',
};
// the same targets with their article, for use inside a sentence
const TARGET_MID: Record<string, string> = {
  'marshalling yards': 'la gare de triage', 'rail junction': 'le nœud ferroviaire', 'rail yards': 'le dépôt ferroviaire',
  'fighter airfield': 'le terrain de chasse', 'fighter base': 'la base de chasse',
  'synthetic oil plant': "l'usine de pétrole synthétique", 'synthetic fuel works': "l'usine de carburant synthétique", 'refinery': 'la raffinerie',
  'u-boat base': 'la base de U-boote', 'u-boat yards': 'les chantiers de U-boote',
  'aircraft assembly plant': "l'usine d'assemblage d'avions", 'fieseler works': "l'usine Fieseler", 'gothaer waggonfabrik': 'la Gothaer Waggonfabrik',
};
const LABEL: Record<string, string> = {
  'Rail yards': 'Dépôts ferroviaires', 'Airfields': 'Terrains', 'Oil': 'Pétrole', 'U-boat pens': 'Abris à U-boote', 'Aircraft factory': "Usine d'avions",
};

const alt = (o: Record<string, string>) => Object.keys(o).map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
const C = `(${alt(CITY)})`;
const N = `(${alt(TARGET)})`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tN = (s: string, tr: (s: string) => string) => TARGET_MID[s.toLowerCase()] ?? tr(s);
const de = (c: string) => (/^[AEIOUÉ]/i.test(c) ? `d'${c}` : `de ${c}`);
const pl = (n: string | number, one: string, many: string) => `${n} ${+n <= 1 ? one : many}`;

const patterns: Pattern[] = [
  // ---------------- SideRaids.ts: generated raid missions ----------------
  [new RegExp(`^Strike on ${C}$`), (m, tr) => `Frappe sur ${tr(m[1])}`],
  [new RegExp(`^(${alt(LABEL)}) — ${C}$`), (m, tr) => `${LABEL[m[1]]} — ${tr(m[2])}`],
  [new RegExp(`^Escort — ${N}, ${C}$`, 'i'), (m, tr) => `Escorte — ${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^${N}, ${C}$`, 'i'), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^A short one today\\. The ${N} at ${C} move every train between the Ruhr and the north German ports: fighters, fuel and flak shells all pass through them\\.$`, 'i'),
    (m, tr) => `Une mission courte aujourd'hui. Par ${tN(m[1], tr)} ${de(tr(m[2]))} passent tous les trains entre la Ruhr et les ports du nord de l'Allemagne : chasseurs, carburant et obus de flak.`],
  [new RegExp(`^The yards at ${C} are a tangle of twisted rail\\. Nothing will move through them for a week\\.$`),
    (m, tr) => `Les voies ${de(tr(m[1]))} ne sont plus qu'un enchevêtrement de rails tordus. Rien n'y passera pendant une semaine.`],
  [new RegExp(`^The Jagdgruppe at ${C} has been hitting our formations over the coast for a month\\. Today we hit it at home: runways, hangars and dispersal pens\\.$`),
    (m, tr) => `La Jagdgruppe ${de(tr(m[1]))} frappe nos formations au-dessus de la côte depuis un mois. Aujourd'hui, on la frappe chez elle : pistes, hangars et alvéoles de dispersion.`],
  [new RegExp(`^${C} is cratered from end to end\\. The Jagdgruppe there will be flying from somewhere else for a while\\.$`),
    (m, tr) => `${tr(m[1])} est criblé de cratères d'un bout à l'autre. La Jagdgruppe devra décoller d'ailleurs pendant un moment.`],
  [new RegExp(`^The target is the ${N} at ${C}\\. Germany has almost no natural oil: every drop of fuel for her fighters is cooked out of coal in plants like this one\\.$`, 'i'),
    (m, tr) => `L'objectif : ${tN(m[1], tr)} ${de(tr(m[2]))}. L'Allemagne n'a presque pas de pétrole naturel : chaque goutte de carburant de ses chasseurs est tirée du charbon dans des usines comme celle-ci.`],
  [new RegExp(`^Black smoke over ${C} is climbing past twenty thousand feet\\. The Luftwaffe will be counting its fuel by the litre\\.$`),
    (m, tr) => `La fumée noire au-dessus ${de(tr(m[1]))} monte au-delà de vingt mille pieds. La Luftwaffe va compter son carburant au litre près.`],
  [new RegExp(`^The Navy has asked for this one\\. The ${N} at ${C} turns out the boats that hunt our convoys in the Atlantic, and those convoys carry our new aircraft and crews\\.$`, 'i'),
    (m, tr) => `C'est la Marine qui a demandé celle-ci. ${cap(tN(m[1], tr))} ${de(tr(m[2]))} produit les sous-marins qui traquent nos convois dans l'Atlantique, et ces convois amènent nos nouveaux avions et équipages.`],
  [new RegExp(`^The slipways at ${C} took a pounding\\. The next convoy will have a quieter crossing, and the group will see the benefit\\.$`),
    (m, tr) => `Les cales de lancement ${de(tr(m[1]))} ont été pilonnées. Le prochain convoi traversera plus tranquillement, et le groupe en verra les bénéfices.`],
  [new RegExp(`^The ${N} at ${C} builds fighters, and every one it finishes will be shooting at us within a month\\. This is a deep one, and it will be defended like Berlin\\.$`, 'i'),
    (m, tr) => `${cap(tN(m[1], tr))} ${de(tr(m[2]))} construit des chasseurs, et chacun d'eux nous tirera dessus d'ici un mois. C'est une mission en profondeur, et la cible sera défendue comme Berlin.`],
  [new RegExp(`^The assembly halls at ${C} are burning\\. That is a month of fighters the Luftwaffe will never get\\.$`),
    (m, tr) => `Les halls d'assemblage ${de(tr(m[1]))} brûlent. C'est un mois de chasseurs que la Luftwaffe n'aura jamais.`],
  [new RegExp(`^Bandits climbing out of ${C}! Blue flight, go get them\\.$`), (m, tr) => `Bandits en montée depuis ${tr(m[1])} ! Patrouille bleue, allez-y.`],
  [new RegExp(`^Fighters coming up from ${C}\\. Here they come!$`), (m, tr) => `Chasseurs en montée depuis ${tr(m[1])}. Les voilà !`],

  // ---------------- CampaignState.ts: intelligence report (saved in English) ----------------
  [/^Mission (complete|failed) · (.+)$/, (m, tr) => `${m[1] === 'complete' ? 'Mission accomplie' : 'Mission échouée'} · ${tr(m[2])}`],
  [/^Luftwaffe strength (up|down|holds) (?:at (\d+)%|(\d+)% → (\d+)%)\. (.+)$/, (m, tr) => {
    const head = m[1] === 'holds' ? `Force de la Luftwaffe stable à ${m[2]}%.` : `Force de la Luftwaffe en ${m[1] === 'up' ? 'hausse' : 'baisse'} : ${m[3]}% → ${m[4]}%.`;
    return `${head} ${tr(m[5])}`;
  }],
  [/^Losses over (.+) are thinning the Jagdgruppen\.$/, (m, tr) => `Les pertes au-dessus ${de(tr(m[1]))} déciment les Jagdgruppen.`.replace('de les ', 'des ').replace('de le ', 'du ')],
  [/^Squadron (\d+) → (\d+) ships\. (?:(\d+) Fortress(?:es)? lost|No Fortresses lost); (\d+) replacement crews arrived(?:, (\d+) of them early thanks to the convoys)?\.(?: The next formation will be (\d+)% of full size\.)?$/, (m) => {
    let s = `Escadrille : ${m[1]} → ${pl(m[2], 'appareil', 'appareils')}. `;
    s += m[3] ? `${pl(m[3], 'Forteresse perdue', 'Forteresses perdues')} ; ` : 'Aucune Forteresse perdue ; ';
    s += `${pl(m[4], 'équipage de remplacement arrivé', 'équipages de remplacement arrivés')}${m[5] ? `, dont ${m[5]} en avance grâce aux convois` : ''}.`;
    if (m[6]) s += ` La prochaine formation sera à ${m[6]}% de son effectif.`;
    return s;
  }],
  [/^Crew morale (?:steady at (\d+)%|(\d+)% → (\d+)%)\. (.+?)(?: Merit x([\d.]+)\.)?$/, (m, tr) => {
    const head = m[1] ? `Moral des équipages stable à ${m[1]}%.` : `Moral des équipages : ${m[2]}% → ${m[3]}%.`;
    return `${head} ${tr(m[4])}${m[5] ? ` Mérite x${m[5]}.` : ''}`;
  }],
  [/^Escort availability (\d+)% → (\d+)%\.(?: (.+))?$/, (m, tr) => `Disponibilité de l'escorte : ${m[1]}% → ${m[2]}%.${m[3] ? ` ${tr(m[3])}` : ''}`],
  [/^Mustangs join the gunner missions at (\d+)%\.$/, 'Les Mustang rejoignent les missions de mitrailleur à $1%.'],
  [/^Next operation: Mission (\d+), (.+) \((.+)\)\. Enemy fighters x([\d.]+)\.$/, (m, tr) => `Prochaine opération : mission ${m[1]}, « ${tr(m[2])} » (${tr(m[3])}). Chasseurs ennemis x${m[4]}.`],
  // tour summary log: "6 kills · 2 lost"
  [/^(\d+) kills$/, (m) => pl(m[1], 'victoire', 'victoires')],
  [/^(\d+) lost$/, (m) => pl(m[1], 'Forteresse perdue', 'Forteresses perdues')],
  [/^Raid bonus: \+(\d+) merit\.$/, 'Bonus de raid : +$1 de mérite.'],
  [/^Your (\d+) completed missions? (?:have|has) been entered in the group's records\. The strategic picture below reflects them\.$/,
    (m) => (+m[1] <= 1
      ? `Votre mission accomplie a été inscrite dans les registres du groupe. La situation stratégique ci-dessous en tient compte.`
      : `Vos ${m[1]} missions accomplies ont été inscrites dans les registres du groupe. La situation stratégique ci-dessous en tient compte.`)],
];

const table: PhraseTable = {
  phrases: {
    ...CITY,
    ...TARGET,
    ...LABEL,
    'the Netherlands': 'les Pays-Bas',
    'the Channel': 'la Manche',

    // ---------------- SideRaids.ts: raid template texts ----------------
    'Snarls German supply: Luftwaffe −3, morale +3': 'Désorganise le ravitaillement allemand : Luftwaffe −3, moral +3',
    'Catches fighters on the ground: Luftwaffe −8, escort +12': 'Surprend les chasseurs au sol : Luftwaffe −8, escorte +12',
    'Starves the fighters of fuel: Luftwaffe −6, morale +2': 'Prive les chasseurs de carburant : Luftwaffe −6, moral +2',
    'Convoys get through: +3 replacement ships, morale +4': 'Les convois passent : +3 appareils de remplacement, moral +4',
    'Cuts fighter production: Luftwaffe −7, escort +6': 'Réduit la production de chasseurs : Luftwaffe −7, escorte +6',
    'The defences are light, and Group calls it a chance to blood the new crews. Do not believe the words "milk run". The day fighters based nearby will come up to meet us.':
      "Les défenses sont légères, et le Groupe y voit l'occasion d'aguerrir les nouveaux équipages. Ne croyez pas aux mots « promenade de santé ». Les chasseurs de jour basés à proximité viendront à notre rencontre.",
    'Every fighter we catch on the ground is one that will not be waiting for us over Germany, and with the coastal fields out of action the Mustangs can push further inland. Expect the whole Gruppe to scramble the moment we cross the coast.':
      "Chaque chasseur détruit au sol est un chasseur de moins qui nous attendra au-dessus de l'Allemagne, et sans les terrains côtiers les Mustang pourront pousser plus loin à l'intérieur. Attendez-vous à ce que toute la Gruppe décolle dès que nous franchirons la côte.",
    'No fuel means no training flights, and no training means green pilots. The Germans know it, so the plant is ringed with heavy flak, and twin-engine destroyers will be up with rockets. Keep them off the formation through the bomb run.':
      "Sans carburant, pas de vols d'entraînement, et sans entraînement, des pilotes novices. Les Allemands le savent : l'usine est ceinturée de flak lourde, et des chasseurs lourds bimoteurs monteront avec leurs roquettes. Tenez-les à l'écart de la formation pendant toute l'approche de bombardement.",
    'Every convoy that gets through brings replacements to the group sooner. The route runs low over the North Sea; expect fighters from the coastal fields and Ju 88s from the Frisian Islands.':
      "Chaque convoi qui passe amène plus tôt des renforts au groupe. La route passe à basse altitude au-dessus de la mer du Nord ; attendez-vous à des chasseurs des terrains côtiers et à des Ju 88 venus des îles de la Frise.",
    'The Sturmgruppen and the rocket-carrying destroyers will be up in force. Hold the formation tight and keep firing; the bombardiers need a steady run of four minutes over the aiming point.':
      "Les Sturmgruppen et les chasseurs lourds lance-roquettes seront là en force. Gardez la formation serrée et continuez à tirer ; les bombardiers ont besoin de quatre minutes de vol stable sur le point de visée.",
    'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.':
      "Vous assurez l'escorte rapprochée en P-51D. Restez avec les bombardiers jusqu'à ce qu'ils aient quitté l'objectif, puis vous pourrez descendre chasser.",
    'This is an optional operation. Group will not hold it against any crew that stands down, but what we hit today changes what is waiting for us on the next big one.':
      "Cette opération est facultative. Le Groupe n'en voudra à aucun équipage qui reste au sol, mais ce que nous frappons aujourd'hui change ce qui nous attend lors de la prochaine grande opération.",
    'Bomb the rail yards': 'Bombardez le dépôt ferroviaire',
    'Wreck the airfield': 'Détruisez le terrain',
    'Bomb the oil plant through the flak': "Bombardez l'usine de pétrole malgré la flak",
    'Hit the U-boat slipways': 'Frappez les cales des U-boote',
    'Destroy the aircraft factory': "Détruisez l'usine d'avions",
    'Protect the bombers over the airfield': 'Protégez les bombardiers au-dessus du terrain',

    // ---------------- CampaignState.ts: report reasons and notes ----------------
    'With the rail yards cut, fuel and spares are not reaching the fighter fields.': "Le dépôt ferroviaire coupé, carburant et pièces n'atteignent plus les terrains de chasse.",
    'Fighters were caught on the ground and the field is out of action.': 'Des chasseurs ont été détruits au sol et le terrain est hors service.',
    'Fuel is short: training flights are grounded and fewer fighters can be put up.': "Le carburant manque : les vols d'entraînement sont suspendus et moins de chasseurs peuvent décoller.",
    'A month of fighter production has gone up in smoke.': 'Un mois de production de chasseurs est parti en fumée.',
    'The Jagdgruppen are claiming a victory, and their confidence and strength recover.': 'Les Jagdgruppen revendiquent une victoire, et retrouvent confiance et force.',
    'This target did not touch the fighter arm.': "Cet objectif n'a pas touché la chasse allemande.",
    'The crews are cheered by the result.': 'Les équipages sont ragaillardis par le résultat.',
    'The crews are holding up.': 'Les équipages tiennent bon.',
    'Empty bunks in the huts weigh on the crews.': 'Les couchettes vides dans les baraques pèsent sur les équipages.',
    'A bad day; the crews are subdued.': 'Mauvaise journée ; les équipages sont abattus.',
    'Steady.': 'Stable.',
    'Fighter Command confirms: P-51 Mustangs will now join the bombers on gunner missions.': 'Le Fighter Command confirme : les P-51 Mustang accompagneront désormais les bombardiers lors des missions de mitrailleur.',
    'The Mustangs will reach us sooner.': 'Les Mustang nous rejoindront plus tôt.',
    'The tour is complete. The campaign summary is ready.': 'La période de service est terminée. Le bilan de campagne est prêt.',
    'A replay of a finished operation. The strategic picture is unchanged.': "Rejeu d'une opération terminée. La situation stratégique est inchangée.",
    'Campaign records transferred': 'Registres de campagne transférés',

    // ---------------- CampaignMap.ts: chart ----------------
    '{n}°N': '{n}° N',
    '{n}°W': '{n}° O',
    '{n}°E': '{n}° E',
    'N (compass)': 'N',
    'LUFTWAFFE DAY FIGHTERS · {n}%': 'CHASSE DE JOUR DE LA LUFTWAFFE · {n}%',
    'ESCORT RADIUS · {n}%': "RAYON D'ESCORTE · {n}%",
    'Mission {n}: {title}': 'Mission {n} : {title}',
    '{place} · NEXT': '{place} · SUIVANTE',
    'DEENETHORPE · 401ST BG': 'DEENETHORPE · 401E BG',
    'Next story operation': "Prochaine opération de l'histoire",
    'Flown · ○ to come': 'Effectuée · ○ à venir',
    'Side raid on offer': 'Raid secondaire proposé',
    'Escort radius / raid route': "Rayon d'escorte / route du raid",
    'Campaign map: England, the North Sea and Germany': "Carte de campagne : l'Angleterre, la mer du Nord et l'Allemagne",
    'NORTH SEA & NORTHWEST EUROPE · 1943–44': "MER DU NORD ET EUROPE DU NORD-OUEST · 1943–44",

    // ---------------- CampaignMap.ts: gauges and intelligence ----------------
    'Strategic situation': 'Situation stratégique',
    'Luftwaffe strength': 'Force de la Luftwaffe',
    'Squadron strength': "Effectif de l'escadrille",
    'Crew morale': 'Moral des équipages',
    'Escort availability': "Disponibilité de l'escorte",
    'Enemy fighters x{a} · skill x{b}': 'Chasseurs ennemis x{a} · habileté x{b}',
    'Full-size formations': 'Formations au complet',
    'Formations at {n}% — replacements arriving': 'Formations à {n}% — renforts en route',
    'Merit x{n}': 'Mérite x{n}',
    'P-51s join the gunner missions': 'Les P-51 rejoignent les missions de mitrailleur',
    'P-51s join gunner missions at {n}%': 'Les P-51 rejoignent les missions de mitrailleur à {n}%',
    'Intelligence report': 'Rapport de renseignement',
    'No operations flown yet. Group expects heavy fighter opposition over the German coast.': "Aucune opération effectuée. Le Groupe s'attend à une forte opposition de la chasse au-dessus de la côte allemande.",

    // ---------------- CampaignMap.ts: operation cards ----------------
    'P-51D escort': 'Escorte P-51D',
    'Low sun': 'Soleil bas',
    'Formation {n} ships': 'Formation de {n} appareils',
    'Fighters x{n}': 'Chasseurs x{n}',
    'P-51s at {t}': 'P-51 à {t}',
    'MISSION {n} OF {total}': 'MISSION {n} SUR {total}',
    'Brief the crew': "Briefer l'équipage",
    'Tour complete': 'Période de service terminée',
    'Twenty-five missions': 'Vingt-cinq missions',
    "The Sky Queen's crew is going home.": "L'équipage du Sky Queen rentre au pays.",
    'Campaign summary': 'Bilan de campagne',
    'Begin a new tour': 'Commencer une nouvelle période',
    'Confirm: new tour (medals and Armory kept)': "Confirmer : nouvelle période (médailles et Armurerie conservées)",
    'Raid flown — target destroyed': 'Raid effectué — objectif détruit',
    'Raid flown — target missed': 'Raid effectué — objectif manqué',
    'The window has passed': "L'occasion est passée",
    'Fly this raid': 'Effectuer ce raid',
    '{fx} · +{n} merit': '{fx} · +{n} de mérite',
    'The tour is over. Side raids are closed.': 'La période de service est terminée. Les raids secondaires sont fermés.',
    'Side raids open after your first mission. Fly Mission 1 to begin the tour.': 'Les raids secondaires ouvrent après votre première mission. Effectuez la mission 1 pour commencer la période de service.',
    'One raid per lull between operations.': 'Un raid par accalmie entre deux opérations.',
    'Optional: fly one raid before Mission {n}, or go straight on. What you hit changes the odds on the next big one.':
      'Facultatif : effectuez un raid avant la mission {n}, ou continuez directement. Ce que vous frappez change les chances de la prochaine grande opération.',
    '1 medal': '1 médaille',
    '{n} medals': '{n} médailles',
    '401ST BOMB SQUADRON · OPERATIONS ROOM': '401E ESCADRILLE DE BOMBARDEMENT · SALLE DES OPÉRATIONS',
    ' · TOUR {n}': ' · PÉRIODE {n}',
    'Campaign': 'Campagne',
    'Campaign date': 'Date de campagne',
    '{done}/{total} operations': '{done}/{total} opérations',
    '1 side raid': '1 raid secondaire',
    '{n} side raids': '{n} raids secondaires',
    'Next operation': 'Prochaine opération',
    'Tour of duty': 'Période de service',
    'Side raids': 'Raids secondaires',
    '· before Mission {n}': '· avant la mission {n}',
    'Tour timeline': 'Chronologie de la période',

    // ---------------- CampaignMap.ts: tour summary ----------------
    'The German day-fighter arm is a shadow of the force that met you over Emden. You helped break it.': "La chasse de jour allemande n'est plus que l'ombre de la force qui vous a accueilli au-dessus d'Emden. Vous avez contribué à la briser.",
    'The Luftwaffe is still flying, but it is bleeding pilots it cannot replace. The air war has turned.': "La Luftwaffe vole encore, mais elle perd des pilotes qu'elle ne peut pas remplacer. La guerre aérienne a basculé.",
    'The Luftwaffe is battered but unbroken. The crews who follow you will still have a fight on their hands.': "La Luftwaffe est meurtrie mais pas brisée. Les équipages qui vous succéderont auront encore fort à faire.",
    'Your {n} successful side raids kept the pressure on between the big operations.': 'Vos {n} raids secondaires réussis ont maintenu la pression entre les grandes opérations.',
    '1 side raid hit home between the big operations.': 'Un raid secondaire a fait mouche entre les grandes opérations.',
    '{n} side raids hit home between the big operations.': '{n} raids secondaires ont fait mouche entre les grandes opérations.',
    'You flew the story operations alone, without side raids.': "Vous avez effectué les opérations de l'histoire seules, sans raid secondaire.",
    'The crews finish the tour in fine spirits.': "Les équipages terminent la période de service d'excellente humeur.",
    'The crews are tired, but proud.': 'Les équipages sont fatigués, mais fiers.',
    'The crews are worn to the bone. Too many empty bunks.': 'Les équipages sont épuisés. Trop de couchettes vides.',
    '401ST BOMB SQUADRON · TOUR OF DUTY': '401E ESCADRILLE DE BOMBARDEMENT · PÉRIODE DE SERVICE',
    'Tour in progress': 'Période de service en cours',
    'Story operations': "Opérations de l'histoire",
    'Sorties flown': 'Sorties effectuées',
    'Confirmed kills': 'Victoires confirmées',
    'Fortresses lost': 'Forteresses perdues',
    'Medals on record': 'Médailles obtenues',
    'Squadron': 'Escadrille',
    'Escort': 'Escorte',
    'Operations log': 'Journal des opérations',
    'No sorties recorded.': 'Aucune sortie enregistrée.',
    'Campaign map': 'Carte de campagne',
    'Main menu': 'Menu principal',

    // ---------------- CampaignMap.ts: briefing sheet ----------------
    'SIDE RAID · OPTIONAL OPERATION': 'RAID SECONDAIRE · OPÉRATION FACULTATIVE',
    'Campaign: Luftwaffe {n}%': 'Campagne : Luftwaffe {n}%',
    'Morale {n}% · merit x{m}': 'Moral {n}% · mérite x{m}',
    'On success: {fx} · +{n} merit': 'En cas de succès : {fx} · +{n} de mérite',
  },
  patterns,
};
export default table;
