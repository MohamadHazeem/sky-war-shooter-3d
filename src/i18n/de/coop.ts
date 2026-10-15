import type { PhraseTable, Pattern } from '../types';

// German for ar/coop.ts (same keys and patterns).

const patterns: Pattern[] = [
  [/^Joining ([A-Z0-9]+)…$/, 'Trete $1 bei…'],
  [/^Mission over — (.+)$/, (m, tr) => `Mission beendet — ${tr(m[1])}`],
  [/^PARTNER is on the (.+)$/, (m, tr) => `Dein PARTNER ist am Stand ${tr(m[1])}`],
  [/^(.+) — partner$/, (m, tr) => `${tr(m[1])} — Partner`],
];

const table: PhraseTable = {
  phrases: {
    'Up to four gunners crew one B-17, or two pilots fly Mustangs. Share one room code.': 'Bis zu vier Schützen in einer B-17 oder zwei Piloten in Mustangs. Teilt einen Raumcode.',
    'Crew connected — pick a seat and ready up': 'Besatzung verbunden — wähl einen Stand und melde dich bereit',
    'Crew member left — AI has the gun': 'Ein Besatzungsmitglied ist weg — die KI übernimmt das MG',
    'Crew full or unavailable. Try again shortly.': 'Besatzung voll oder nicht verfügbar. Versuch es gleich noch einmal.',
    'That crew slot is occupied.': 'Dieser Platz ist besetzt.',
    'That gun is crewed': 'Dieser Stand ist besetzt',
    'Open crew slot · AI covering': 'Freier Platz · KI übernimmt',
    'Ready': 'Bereit',
    'Not ready': 'Nicht bereit',
    'Ping target': 'Ziel markieren',

    'Blue One': 'Blau Eins',
    'Leave co-op': 'Koop verlassen',
    'B-17 crew or P-51 escort · online': 'B-17-Besatzung oder P-51-Begleitschutz · online',
    'Crew a B-17 or fly two Mustangs. The host picks the mission; your partner joins with a code.': 'Bemannt eine B-17 oder fliegt zwei Mustangs. Der Host wählt die Mission, dein Partner tritt mit einem Code bei.',
    'Co-op mode': 'Koop-Modus',
    'B-17 crew (gunners)': 'B-17-Besatzung (Schützen)',
    'P-51 escort (pilots)': 'P-51-Begleitschutz (Piloten)',
    'Custom Battle — saved escort settings': 'Eigene Schlacht — gespeicherte Begleitschutz-Einstellungen',
    'Partner connected — ready to fly': 'Partner verbunden — startklar',
    'Co-op Survival — Pilots': 'Koop-Überleben — Piloten',
    'Pause is disabled in co-op': 'Im Koop gibt es keine Pause',
    'You are down — spectating your partner until the next round': 'Du bist abgeschossen — du schaust deinem Partner bis zur nächsten Runde zu',
    'Form up on your partner': 'Schließ zu deinem Partner auf',
    '{name} destroyed {target}': '{name} hat {target} zerstört',
    'm': 'm',

    'Your callsign': 'Dein Rufzeichen',
    'Crew score': 'Besatzungspunkte',
    'CREW LEADERBOARD': 'BESATZUNGS-BESTENLISTE',
    'Return to co-op lobby': 'Zurück zur Koop-Lobby',
    'Waiting for your partner to return…': 'Warte auf die Rückkehr deines Partners…',
    'Shared crew score and personal rewards. Relay support is used when available.': 'Gemeinsame Besatzungspunkte und persönliche Belohnungen. Ein Relay wird genutzt, wenn verfügbar.',
    'Could not connect to the host. Try another network or try again.': 'Keine Verbindung zum Host. Probier ein anderes Netzwerk oder versuch es erneut.',
    '{name} (partner) destroyed {target}': '{name} (Partner) hat {target} zerstört',

    'Co-op (beta)': 'Koop (Beta)',
    'two gunners, one B-17 · online': 'zwei Schützen, eine B-17 · online',
    'ONLINE · PEER TO PEER': 'ONLINE · PEER-TO-PEER',
    'Two gunners crew the same Fortress in Survival. One player hosts and runs the battle; the other joins with a code.':
      'Zwei Schützen bemannen dieselbe Fortress im Überlebensmodus. Einer hostet und leitet die Schlacht, der andere tritt mit einem Code bei.',
    'Host a game': 'Spiel hosten',
    'Join a game': 'Spiel beitreten',
    'CODE': 'CODE',
    'Join code': 'Beitrittscode',
    'Join': 'Beitreten',
    'Prototype. Peer-to-peer with no relay server, so some networks (strict firewalls, some corporate, campus and mobile networks) cannot connect.':
      'Prototyp. Peer-to-Peer ohne Relay-Server, daher können manche Netzwerke (strenge Firewalls, manche Firmen-, Uni- und Mobilnetze) keine Verbindung aufbauen.',

    'CO-OP (BETA)': 'KOOP (BETA)',
    'Stand by': 'Bitte warten',
    'Cancel': 'Abbrechen',
    'CO-OP (BETA) · SURVIVAL · B-17 GUNNERS': 'KOOP (BETA) · ÜBERLEBEN · B-17-SCHÜTZEN',
    'Join code — give it to your partner': 'Beitrittscode — gib ihn deinem Partner',
    'Joined game': 'Spiel beigetreten',
    'Your gun position': 'Dein Schützenstand',
    'Start mission': 'Mission starten',
    'Leave': 'Verlassen',
    'You run the battle: if your partner drops out you carry on alone.': 'Du leitest die Schlacht: Fällt dein Partner aus, machst du allein weiter.',
    'The host starts the mission. If the host leaves, the game ends.': 'Der Host startet die Mission. Verlässt der Host das Spiel, endet es.',
    'PARTNER': 'PARTNER',
    'partner': 'Partner',

    'Connection: waiting for a reply': 'Verbindung: warte auf Antwort',
    'Connection: {ms} ms round trip': 'Verbindung: {ms} ms Umlaufzeit',

    'Creating a game…': 'Spiel wird erstellt…',
    'Waiting for your partner to join…': 'Warte, bis dein Partner beitritt…',
    'Could not create a game. Check your connection and try again.': 'Spiel konnte nicht erstellt werden. Prüf deine Verbindung und versuch es erneut.',
    'A join code is 6 letters and digits.': 'Ein Beitrittscode hat 6 Buchstaben und Ziffern.',
    'Connecting to the host…': 'Verbinde mit dem Host…',
    'Could not connect to the host. Your networks may not allow a direct connection (there is no relay server).':
      'Keine Verbindung zum Host. Eure Netzwerke erlauben vielleicht keine Direktverbindung (es gibt keinen Relay-Server).',
    'Could not reach the game server. Check your connection.': 'Spielserver nicht erreichbar. Prüf deine Verbindung.',
    'That room has expired or does not exist.': 'Dieser Raum ist abgelaufen oder existiert nicht.',
    'No game with that code. Check it and try again.': 'Kein Spiel mit diesem Code. Prüf ihn und versuch es erneut.',
    'That game already has two gunners.': 'Dieses Spiel hat schon zwei Schützen.',
    'Could not join that game (it may have just been taken or expired).': 'Beitritt nicht möglich (das Spiel wurde vielleicht gerade belegt oder ist abgelaufen).',
    'Partner connected — pick your guns and start': 'Partner verbunden — wählt eure Stände und startet',
    'Connected — waiting for the host to start': 'Verbunden — warte auf den Start durch den Host',

    'Your partner left — carrying on alone': 'Dein Partner ist weg — du machst allein weiter',
    'Lost your partner — carrying on alone': 'Partner verloren — du machst allein weiter',
    'Partner disconnected': 'Partner getrennt',
    'Your partner left.': 'Dein Partner hat das Spiel verlassen.',
    'The connection to your partner was lost.': 'Die Verbindung zu deinem Partner ist abgebrochen.',
    'The host left the game. Co-op session ended.': 'Der Host hat das Spiel verlassen. Koop-Sitzung beendet.',
    'Lost the connection to the host. Co-op session ended.': 'Verbindung zum Host verloren. Koop-Sitzung beendet.',

    'Your partner took that gun': 'Dein Partner hat diesen Stand übernommen',
    'Waiting for the host…': 'Warte auf den Host…',
    'The mission is over.': 'Die Mission ist beendet.',
    'MISSION OVER': 'MISSION BEENDET',
    'The Fortress is lost': 'Die Fortress ist verloren',
    'Co-op Survival — Gunners': 'Koop-Überleben — Schützen',
  },
  patterns,
};
export default table;
