import type { PhraseTable, Pattern } from '../types';

// French for ar/coop.ts (same keys and patterns).

const patterns: Pattern[] = [
  [/^Joining ([A-Z0-9]+)…$/, 'Connexion à $1…'],
  [/^Mission over — (.+)$/, (m, tr) => `Mission terminée — ${tr(m[1])}`],
  [/^PARTNER is on the (.+)$/, (m, tr) => `Votre ÉQUIPIER est au poste ${tr(m[1])}`],
  [/^(.+) — partner$/, (m, tr) => `${tr(m[1])} — équipier`],
];

const table: PhraseTable = {
  phrases: {
    'Up to four gunners crew one B-17, or two pilots fly Mustangs. Share one room code.': 'Jusqu’à quatre mitrailleurs dans un B-17, ou deux pilotes en Mustang. Partagez un code de salon.',
    'Crew connected — pick a seat and ready up': 'Équipage connecté — choisissez un poste et confirmez',
    'Crew member left — AI has the gun': 'Un membre est parti — l’IA prend l’arme',
    'Crew full or unavailable. Try again shortly.': 'Équipage complet ou indisponible. Réessayez bientôt.',
    'That crew slot is occupied.': 'Cette place est occupée.',
    'That gun is crewed': 'Ce poste est occupé',
    'Open crew slot · AI covering': 'Place libre · l’IA assure',
    'Ready': 'Prêt',
    'Not ready': 'Pas prêt',
    'Ping target': 'Signaler la cible',

    'Blue One': 'Bleu Un',
    'Leave co-op': 'Quitter la coop',
    'B-17 crew or P-51 escort · online': 'Équipage de B-17 ou escorte P-51 · en ligne',
    'Crew a B-17 or fly two Mustangs. The host picks the mission; your partner joins with a code.': 'Armez un B-17 ou pilotez deux Mustang. L’hôte choisit la mission ; votre équipier rejoint avec un code.',
    'Co-op mode': 'Mode coop',
    'B-17 crew (gunners)': 'Équipage de B-17 (mitrailleurs)',
    'P-51 escort (pilots)': 'Escorte P-51 (pilotes)',
    'Custom Battle — saved escort settings': 'Bataille personnalisée — réglages d’escorte enregistrés',
    'Partner connected — ready to fly': 'Équipier connecté — prêts à voler',
    'Co-op Survival — Pilots': 'Survie coop — Pilotes',
    'Pause is disabled in co-op': 'La pause est désactivée en coop',
    'You are down — spectating your partner until the next round': 'Vous êtes abattu — vous suivez votre équipier jusqu’à la prochaine manche',
    'Form up on your partner': 'Rejoignez votre équipier en formation',
    '{name} destroyed {target}': '{name} a détruit {target}',
    'm': 'm',

    'Your callsign': 'Votre indicatif',
    'Crew score': 'Score de l’équipage',
    'CREW LEADERBOARD': 'CLASSEMENT DES ÉQUIPAGES',
    'Return to co-op lobby': 'Retour au salon coop',
    'Waiting for your partner to return…': 'En attente du retour de votre équipier…',
    'Shared crew score and personal rewards. Relay support is used when available.': 'Score d’équipage commun et récompenses personnelles. Un relais est utilisé s’il est disponible.',
    'Could not connect to the host. Try another network or try again.': 'Connexion à l’hôte impossible. Essayez un autre réseau ou réessayez.',
    '{name} (partner) destroyed {target}': '{name} (équipier) a détruit {target}',

    'Co-op (beta)': 'Coop (bêta)',
    'two gunners, one B-17 · online': 'deux mitrailleurs, un B-17 · en ligne',
    'ONLINE · PEER TO PEER': 'EN LIGNE · PAIR À PAIR',
    'Two gunners crew the same Fortress in Survival. One player hosts and runs the battle; the other joins with a code.':
      'Deux mitrailleurs à bord de la même Forteresse en Survie. Un joueur héberge et gère la bataille ; l’autre rejoint avec un code.',
    'Host a game': 'Héberger une partie',
    'Join a game': 'Rejoindre une partie',
    'CODE': 'CODE',
    'Join code': 'Code de partie',
    'Join': 'Rejoindre',
    'Prototype. Peer-to-peer with no relay server, so some networks (strict firewalls, some corporate, campus and mobile networks) cannot connect.':
      'Prototype. Pair à pair sans serveur relais : certains réseaux (pare-feu stricts, certains réseaux d’entreprise, de campus ou mobiles) ne peuvent pas se connecter.',

    'CO-OP (BETA)': 'COOP (BÊTA)',
    'Stand by': 'Patientez',
    'Cancel': 'Annuler',
    'CO-OP (BETA) · SURVIVAL · B-17 GUNNERS': 'COOP (BÊTA) · SURVIE · MITRAILLEURS B-17',
    'Join code — give it to your partner': 'Code de partie — donnez-le à votre équipier',
    'Joined game': 'Partie rejointe',
    'Your gun position': 'Votre poste de tir',
    'Start mission': 'Lancer la mission',
    'Leave': 'Quitter',
    'You run the battle: if your partner drops out you carry on alone.': 'Vous gérez la bataille : si votre équipier se déconnecte, vous continuez seul.',
    'The host starts the mission. If the host leaves, the game ends.': 'L’hôte lance la mission. Si l’hôte part, la partie se termine.',
    'PARTNER': 'ÉQUIPIER',
    'partner': 'équipier',

    'Connection: waiting for a reply': 'Connexion : en attente de réponse',
    'Connection: {ms} ms round trip': 'Connexion : {ms} ms aller-retour',

    'Creating a game…': 'Création de la partie…',
    'Waiting for your partner to join…': 'En attente de votre équipier…',
    'Could not create a game. Check your connection and try again.': 'Impossible de créer une partie. Vérifiez votre connexion et réessayez.',
    'A join code is 6 letters and digits.': 'Un code de partie compte 6 lettres et chiffres.',
    'Connecting to the host…': 'Connexion à l’hôte…',
    'Could not connect to the host. Your networks may not allow a direct connection (there is no relay server).':
      'Connexion à l’hôte impossible. Vos réseaux n’autorisent peut-être pas de connexion directe (il n’y a pas de serveur relais).',
    'Could not reach the game server. Check your connection.': 'Serveur de jeu injoignable. Vérifiez votre connexion.',
    'That room has expired or does not exist.': 'Ce salon a expiré ou n’existe pas.',
    'No game with that code. Check it and try again.': 'Aucune partie avec ce code. Vérifiez-le et réessayez.',
    'That game already has two gunners.': 'Cette partie a déjà deux mitrailleurs.',
    'Could not join that game (it may have just been taken or expired).': 'Impossible de rejoindre cette partie (elle vient peut-être d’être prise ou a expiré).',
    'Partner connected — pick your guns and start': 'Équipier connecté — choisissez vos postes et lancez',
    'Connected — waiting for the host to start': 'Connecté — en attente du lancement par l’hôte',

    'Your partner left — carrying on alone': 'Votre équipier est parti — vous continuez seul',
    'Lost your partner — carrying on alone': 'Équipier perdu — vous continuez seul',
    'Partner disconnected': 'Équipier déconnecté',
    'Your partner left.': 'Votre équipier est parti.',
    'The connection to your partner was lost.': 'La connexion avec votre équipier a été perdue.',
    'The host left the game. Co-op session ended.': 'L’hôte a quitté la partie. Session coop terminée.',
    'Lost the connection to the host. Co-op session ended.': 'Connexion à l’hôte perdue. Session coop terminée.',

    'Your partner took that gun': 'Votre équipier a pris ce poste',
    'Waiting for the host…': 'En attente de l’hôte…',
    'The mission is over.': 'La mission est terminée.',
    'MISSION OVER': 'MISSION TERMINÉE',
    'The Fortress is lost': 'La Forteresse est perdue',
    'Co-op Survival — Gunners': 'Survie coop — Mitrailleurs',
  },
  patterns,
};
export default table;
