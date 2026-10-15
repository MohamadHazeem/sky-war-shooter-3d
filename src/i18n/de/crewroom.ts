import type { PhraseTable } from '../types';

// German for ar/crewroom.ts (same keys and patterns).

const table: PhraseTable = {
  phrases: {
    // captions and controls
    'Deenethorpe · Hut 14': "Deenethorpe · Baracke 14",
    'Deenethorpe · The Club': "Deenethorpe · Der Club",
    'RAF Manston · Transit hut': "RAF Manston · Durchgangsbaracke",
    'Night': "Nacht",
    'Evening': "Abend",
    'Crew room': "Mannschaftsraum",
    'Space · next line': "Leertaste · nächste Zeile",
    'Tap · next line': "Tippen · nächste Zeile",
    'Esc · skip': "Esc · überspringen",
    'Skip scene': "Szene überspringen",
    'Tour complete': "Tour abgeschlossen",

    // how the crew speaks of each other ({name} in the hospital lines)
    'the Skipper': "der Skipper",
    'Lieutenant Doyle': "Lieutenant Doyle",
    'Lieutenant Stern': "Lieutenant Stern",
    'Lieutenant Kessler': "Lieutenant Kessler",

    // m1 · Baptism of Fire
    "Well, that's one. First thing tomorrow I'm painting a bomb under the window.": "Tja, das ist einer. Gleich morgen früh male ich eine Bombe unters Fenster.",
    'I counted forty-one holes in her. Forty-one, and not one of them in us.': "Ich hab einundvierzig Löcher in ihr gezählt. Einundvierzig, und kein einziges in uns.",
    'Emden on the first try. I said I would.': "Emden beim ersten Versuch. Hab ich doch gesagt.",
    'Told you. Nobody can find me down in that ball.': "Hab ich doch gesagt. Da unten in der Kugel findet mich keiner.",
    'Nobody wants to, Shorty.': "Will auch keiner, Kurzer.",
    "My hands didn't stop shaking till we crossed the English coast. Is that normal?": "Meine Hände haben gezittert, bis wir über die englische Küste waren. Ist das normal?",
    "It's normal. Mine haven't stopped yet.": "Das ist normal. Meine zittern immer noch.",
    'Get some sleep, all of you. One down. Twenty-four to go.': "Schlaft ein bisschen, alle. Einer geschafft. Noch vierundzwanzig.",

    // m2 · Twelve O'Clock High
    'They came straight at the nose. All I could see was the propeller hub and the guns winking at me.': "Die kamen direkt auf den Bug zu. Ich sah nur die Propellernabe und die Waffen, die mir zublinzelten.",
    'That top turret earned its keep today. Twin fifties, and somebody who knew what to do with them.': "Der Rückenturm hat sich heute bezahlt gemacht. Zwei Fünfziger und einer, der damit umgehen konnte.",
    "Lieutenant, you've been humming the same four bars since we landed.": "Lieutenant, Sie summen seit der Landung dieselben vier Takte.",
    "It helps. Don't ask me why. It helps.": "Es hilft. Frag mich nicht, warum. Es hilft.",
    "Two down. I'm keeping the tally in the back of my navigation log.": "Zwei geschafft. Ich führe die Strichliste hinten in meinem Navigationslogbuch.",
    "Fog's coming in. Maybe they'll stand us down tomorrow.": "Der Nebel kommt. Vielleicht geben sie uns morgen frei.",
    'Maybe. Sleep while you can.': "Vielleicht. Schlaft, solange ihr könnt.",

    // m8 · Black Thursday
    "They came for the Lucky Lady's things an hour ago. Folded the blankets. Took the photographs off the wall.": "Vor einer Stunde haben sie die Sachen von der Lucky Lady geholt. Die Decken gefaltet. Die Fotos von der Wand genommen.",
    "Their tail gunner owed me two dollars. I'd give anything for him to walk in here and not pay it.": "Ihr Heckschütze schuldete mir zwei Dollar. Ich gäbe alles, wenn er hier reinkäme und sie nicht bezahlt.",
    'Sixty Fortresses. Six hundred men. I keep doing the arithmetic, and it keeps coming out the same.': "Sechzig Fortresses. Sechshundert Mann. Ich rechne es immer wieder nach, und es kommt immer dasselbe raus.",
    "From the ball I could see the chutes. I tried to count them. I couldn't keep up.": "Aus der Kugel konnte ich die Schirme sehen. Ich hab versucht, sie zu zählen. Ich kam nicht hinterher.",
    "I lit a candle for them in the chapel. I didn't know what else to do.": "Ich hab in der Kapelle eine Kerze für sie angezündet. Ich wusste nicht, was ich sonst tun sollte.",
    "Still got the rabbit's foot. I don't know if that makes me lucky, or them not.": "Ich hab die Hasenpfote noch. Ich weiß nicht, ob das heißt, dass ich Glück hatte, oder sie keins.",
    "We came home. Tomorrow we'll think about why. Tonight, try to sleep.": "Wir sind heimgekommen. Morgen denken wir darüber nach, warum. Heute Nacht versucht zu schlafen.",

    // m9 · Into the Front
    "There he is. The Mustang that stayed with us all the way to Kiel. Sit down, sir. Dinner's on me.": "Da ist er. Die Mustang, die bis Kiel bei uns geblieben ist. Setzen Sie sich, Sir. Das Essen geht auf mich.",
    'For a month, Hawkeye. You said a month. The whole ship heard you on the interphone.': "Einen Monat lang, Falkenauge. Du hast einen Monat gesagt. Die ganze Maschine hat's über die Bordsprechanlage gehört.",
    'I know what I said. Worth every penny.': "Ich weiß, was ich gesagt hab. Jeden Cent wert.",
    "We couldn't see our own wingtips in that front. When the Germans came through the gaps, you were already there.": "In der Front sahen wir nicht mal unsere eigenen Flächenspitzen. Als die Deutschen durch die Lücken kamen, waren Sie schon da.",
    "The first time anyone's gone all the way with us. It changes the arithmetic.": "Das erste Mal, dass uns jemand den ganzen Weg begleitet. Das ändert die Rechnung.",
    'To the little friends.': "Auf die kleinen Freunde.",
    'To the little friends. May they never run short of fuel.': "Auf die kleinen Freunde. Möge ihnen nie der Sprit ausgehen.",
    "Same time tomorrow, sir? I'll bring my wallet.": "Morgen um dieselbe Zeit, Sir? Ich bringe meine Brieftasche mit.",

    // m3 · Flak Alley
    "Two hundred guns down there, and I still put the bombs right on the aiming point. I've never seen flak like it.": "Zweihundert Geschütze da unten, und trotzdem lagen die Bomben genau auf dem Zielpunkt. So eine Flak hab ich noch nie gesehen.",
    'Merry Christmas, Ray. Five days late.': "Frohe Weihnachten, Ray. Fünf Tage zu spät.",
    "Every gun had its Saint Christopher today, and every one of us came home. I'm not saying it's the medals. I'm not saying it isn't.": "Jedes MG hatte heute seinen heiligen Christophorus, und jeder von uns ist heimgekommen. Ich sag nicht, dass es an den Medaillen liegt. Ich sag auch nicht, dass nicht.",
    "On Christmas Eve I kept thinking about the Lucky Lady's boys. They'd have liked the snow.": "An Heiligabend musste ich ständig an die Jungs von der Lucky Lady denken. Der Schnee hätte ihnen gefallen.",
    'Tomorrow is the last day of the year. Nineteen forty-four, gentlemen.': "Morgen ist der letzte Tag des Jahres. Neunzehnhundertvierundvierzig, meine Herren.",
    'Next Christmas at home. Everybody say it.': "Nächste Weihnachten zu Hause. Alle sagen es.",
    'Next Christmas at home.': "Nächste Weihnachten zu Hause.",

    // m10 · Last Light
    "I kissed that runway, and I'd do it again. The RAF boys think I've gone flak happy.": "Ich hab die Landebahn geküsst, und ich würd's wieder tun. Die RAF-Jungs halten mich für flakverrückt.",
    "They took Frank to the hospital. The surgeon says he'll keep the leg.": "Sie haben Frank ins Lazarett gebracht. Der Chirurg sagt, er behält das Bein.",
    "I told you. I wasn't putting an old lady in the Channel on her thirteenth.": "Hab ich doch gesagt. Ich setz doch keine alte Dame bei ihrem dreizehnten in den Kanal.",
    'When the Spitfires showed up off the coast, I could have cried. Maybe I did.': "Als die Spitfires vor der Küste auftauchten, hätte ich heulen können. Vielleicht hab ich's getan.",
    'Somebody write to Frank tonight. Tell him the old lady made it.': "Einer schreibt heute Abend an Frank. Sagt ihm, die alte Dame hat's geschafft.",
    "I'll write it. I'll make it long. He hates long letters.": "Ich schreib ihn. Und zwar lang. Er hasst lange Briefe.",
    'Lights out. We fly home in the morning.': "Licht aus. Morgen früh fliegen wir heim.",

    // m4 · Little Friends
    "Leipzig and back, and not one of them got through to us. I said there was a steak in it, didn't I?": "Leipzig und zurück, und kein einziger ist zu uns durchgekommen. Ich hab doch ein Steak versprochen, oder?",
    "He's been saving his coupons for a week. Don't ask him where he found a steak in England.": "Er spart seit einer Woche seine Marken. Frag ihn nicht, wo er in England ein Steak aufgetrieben hat.",
    "Big Week, they're calling it. The whole Eighth went out today, all of us after the aircraft factories.": "„Big Week“ nennen sie das. Die ganze Eighth war heute draußen, alle hinter den Flugzeugfabriken her.",
    'When that Fortress fell out of formation, I thought she was finished. Then you came down on the wolves.': "Als die Fortress aus der Formation fiel, dachte ich, die ist erledigt. Dann sind Sie auf die Wölfe heruntergestoßen.",
    'Frank wrote from the hospital. He says the nurses are lovely and the food is a crime.': "Frank hat aus dem Lazarett geschrieben. Er sagt, die Schwestern sind reizend und das Essen ist ein Verbrechen.",
    "There's a rumour we're going back to Schweinfurt. Nobody say it out loud.": "Es geht das Gerücht, wir fliegen wieder nach Schweinfurt. Keiner sagt es laut.",
    'Eat your steak, sir. You earned it.': "Essen Sie Ihr Steak, Sir. Sie haben es sich verdient.",

    // m5 · Sturmgruppe
    'Schweinfurt. There, I said it. Somebody had to.': "Schweinfurt. So, jetzt hab ich's gesagt. Einer musste es ja.",
    "A hundred yards. I could see the rounds sparking off their windscreens, and they still didn't break.": "Hundert Yards. Ich sah die Geschosse an ihren Frontscheiben Funken schlagen, und sie drehten trotzdem nicht ab.",
    "I've got my piece of Frankfurt on my key ring. It came up through the floor and found my leg. I'm keeping it.": "Ich hab mein Stück Frankfurt am Schlüsselbund. Es kam durch den Boden und hat mein Bein gefunden. Das behalte ich.",
    "Sixty ships stayed behind the last time. Today we brought ours home. That's enough for me.": "Letztes Mal sind sechzig Maschinen dageblieben. Heute haben wir unsere heimgebracht. Das reicht mir.",
    "Nineteen missions. Six to go. I don't like saying the number out loud either.": "Neunzehn Einsätze. Noch sechs. Ich sag die Zahl auch nicht gern laut.",
    "Same socks tomorrow. Don't anybody say a word.": "Morgen dieselben Socken. Keiner sagt ein Wort.",
    'Long day tomorrow. Lights out in ten minutes.': "Morgen wird ein langer Tag. In zehn Minuten Licht aus.",

    // m11 · Bomb Run
    "Right on the aiming point. I've seen the photographs. The assembly hall is gone.": "Genau auf dem Zielpunkt. Ich hab die Fotos gesehen. Die Montagehalle ist weg.",
    "He's shown everybody the photographs. Twice. He showed the barman.": "Er hat allen die Fotos gezeigt. Zweimal. Sogar dem Barmann.",
    "I waited nineteen missions for that target. I'm entitled.": "Ich hab neunzehn Einsätze auf dieses Ziel gewartet. Das steht mir zu.",
    "Four minutes straight and level through that flak. I said it in September and I'll say it now. I do not like flak.": "Vier Minuten geradeaus und waagerecht durch diese Flak. Ich hab's im September gesagt und sag's jetzt wieder. Ich mag keine Flak.",
    'Noted, Sergeant.': "Zur Kenntnis genommen, Sergeant.",
    "Every Messerschmitt they don't build is one that won't be waiting for the next crew. Remember that.": "Jede Messerschmitt, die sie nicht bauen, wartet nicht auf die nächste Besatzung. Denkt daran.",
    'Buy the man a drink. Even if he is insufferable.': "Gebt dem Mann einen aus. Auch wenn er unausstehlich ist.",
    "I'll take it.": "Nehm ich.",

    // m6 · The Long Way Home
    'Two engines, all the way across Holland. I listened to every cylinder the whole way home.': "Zwei Motoren, quer über ganz Holland. Ich hab auf dem ganzen Heimweg jedem Zylinder zugehört.",
    'Twenty-two missions, and she carried us home again.': "Zweiundzwanzig Einsätze, und sie hat uns wieder heimgebracht.",
    "When the Mustangs came over the horizon, Price started laughing and couldn't stop.": "Als die Mustangs über dem Horizont auftauchten, fing Price an zu lachen und konnte nicht mehr aufhören.",
    "Wasn't laughing. Something in my eye.": "Hab nicht gelacht. Hatte was im Auge.",
    "The ground crew has been out there since we landed. In the rain, with lamps. They say she'll be ready by Wednesday.": "Das Bodenpersonal ist seit unserer Landung da draußen. Im Regen, mit Lampen. Sie sagen, bis Mittwoch ist sie fertig.",
    "Somebody take those boys a thermos of coffee. They've earned it more than we have.": "Einer bringt den Jungs eine Thermoskanne Kaffee. Die haben's mehr verdient als wir.",
    "I'll go. I owe them.": "Ich geh. Ich schulde es ihnen.",
    'We all do.': "Das tun wir alle.",

    // m7 · Big Week
    'Berlin. We went to Berlin and back, and the Mustangs never left us.': "Berlin. Wir waren in Berlin und zurück, und die Mustangs sind nie von unserer Seite gewichen.",
    "I saw a Fortress with a crown on her nose get a lot of extra cover today. Somebody told you, didn't they?": "Ich hab heute eine Fortress mit einer Krone am Bug gesehen, die eine Menge Extraschutz bekam. Das hat Ihnen jemand gesteckt, oder?",
    "I painted that crown. I'm taking the credit for the whole escort.": "Die Krone hab ich gemalt. Den ganzen Begleitschutz verbuche ich für mich.",
    "They say the Luftwaffe lost more today than it can replace. You could feel it. They didn't press like they used to.": "Es heißt, die Luftwaffe hat heute mehr verloren, als sie ersetzen kann. Man hat's gespürt. Sie griffen nicht mehr so verbissen an wie früher.",
    "The ground crew put her back together in two days. She flew today with every man who wouldn't leave her.": "Das Bodenpersonal hat sie in zwei Tagen wieder zusammengesetzt. Heute flog sie mit jedem Mann, der sie nicht verlassen wollte.",
    "I've stopped pretending I don't count the missions. We're close now.": "Ich tu nicht mehr so, als würde ich die Einsätze nicht zählen. Wir sind jetzt nah dran.",
    'To the little friends. Again.': "Auf die kleinen Freunde. Noch einmal.",
    'And put it on my tab.': "Und schreibt's auf meine Rechnung.",

    // m12 · Maximum Effort: the end of the tour
    "I rubbed out the pencil. It's in paint now. Twenty-five bombs under the window.": "Ich hab den Bleistift wegradiert. Jetzt ist es in Farbe. Fünfundzwanzig Bomben unterm Fenster.",
    'In paint. Now it counts.': "In Farbe. Jetzt zählt es.",
    'I went out to her after we landed and put my hand on number three engine. Still warm. I said thank you.': "Nach der Landung bin ich zu ihr raus und hab die Hand auf Motor drei gelegt. Noch warm. Ich hab danke gesagt.",
    "I'm going to miss the ball. Don't tell anybody I said that.": "Die Kugel wird mir fehlen. Erzählt keinem, dass ich das gesagt hab.",
    "I'm burning these socks. Out behind the hut, a proper funeral.": "Ich verbrenne diese Socken. Hinter der Baracke, ein ordentliches Begräbnis.",
    "Twenty-five missions. I've worked it out a dozen ways, and it never adds up to why we came home and the others didn't.": "Fünfundzwanzig Einsätze. Ich hab's auf ein Dutzend Arten durchgerechnet, und es ergibt nie, warum wir heimgekommen sind und die anderen nicht.",
    "I want to say something about the Lucky Lady's boys. And the new crews who never finished their first week.": "Ich will etwas über die Jungs von der Lucky Lady sagen. Und über die neuen Besatzungen, die ihre erste Woche nie beendet haben.",
    'We knew some of their names. Not all of them. We carry them home anyway.': "Wir kannten einige ihrer Namen. Nicht alle. Wir nehmen sie trotzdem mit nach Hause.",
    'Twenty-five missions and never a scratch. I think about that more than I should.': "Fünfundzwanzig Einsätze und nie ein Kratzer. Daran denke ich öfter, als ich sollte.",
    "First thing, I'm going to stand in the middle of the cornfield and look at the sky. Just look at it.": "Als Erstes stell ich mich mitten ins Maisfeld und schau in den Himmel. Einfach nur schauen.",
    "The ranch will still be there. Cattle don't know there was a war.": "Die Ranch wird noch da sein. Das Vieh weiß nicht, dass Krieg war.",
    "Brooklyn. My mother's going to cook for three days, and I'm going to let her.": "Brooklyn. Meine Mutter wird drei Tage lang kochen, und ich lass sie.",
    "Boston. I'm singing at my sister's wedding, and this time I'll know all the words.": "Boston. Ich singe auf der Hochzeit meiner Schwester, und diesmal kann ich den ganzen Text.",
    'Philadelphia. A classroom full of kids who think arithmetic is boring. God bless every one of them.': "Philadelphia. Ein Klassenzimmer voller Kinder, die Rechnen langweilig finden. Gott segne jedes einzelne.",
    "San Antonio. I'm going to fix my father's truck, and nobody is going to shoot at me while I do it.": "San Antonio. Ich repariere den Lastwagen meines Vaters, und keiner schießt dabei auf mich.",
    "I'm going to sleep for a week. Then I'll think about it.": "Ich schlafe eine Woche lang. Dann denk ich drüber nach.",
    'Kansas. Low and slow over the wheat, and nobody shooting.': "Kansas. Tief und langsam über dem Weizen, und keiner schießt.",
    'It was an honour to fly with every one of you. Thank you.': "Es war mir eine Ehre, mit jedem von euch zu fliegen. Danke.",
    'Somebody wind up the gramophone.': "Einer zieht das Grammofon auf.",
    "Twenty-five. Let's go home.": "Fünfundzwanzig. Gehen wir nach Hause.",

    // the outcome block: wounds
    "Doc says {name} will be in the hospital a week or two. I'll take him his mail.": "Der Doc sagt, {name} bleibt ein, zwei Wochen im Lazarett. Ich bring ihm seine Post.",
    '{name} is in the next bed over. He asked us to keep his place by the stove.': "{name} liegt im Bett nebenan. Er hat uns gebeten, ihm seinen Platz am Ofen freizuhalten.",
    "We'll go over and see him in the morning.": "Morgen früh gehen wir rüber und besuchen ihn.",
    "We'll go over and see them both in the morning.": "Morgen früh gehen wir rüber und besuchen beide.",
    'How are you holding up, {nick}?': "Wie hältst du dich, {nick}?",
    "Doc put a few stitches in it. I'll be flying the next one.": "Der Doc hat ein paar Stiche gesetzt. Den nächsten flieg ich mit.",
    // losses
    'Every ship in the group came home today. I counted them twice.': "Heute ist jede Maschine der Group heimgekommen. Ich hab zweimal gezählt.",
    "One ship didn't come back today. Ten men.": "Eine Maschine ist heute nicht zurückgekommen. Zehn Mann.",
    'Two ships went down today. Twenty men.': "Heute sind zwei Maschinen runtergegangen. Zwanzig Mann.",
    "{n} ships didn't come back today. I wrote down every name I knew.": "{n} Maschinen sind heute nicht zurückgekommen. Ich hab jeden Namen aufgeschrieben, den ich kannte.",
    'They came for the bunks across the aisle an hour ago. Folded the blankets. Took the photographs down.': "Vor einer Stunde haben sie die Pritschen gegenüber geräumt. Die Decken gefaltet. Die Fotos abgenommen.",
    'Nobody sleeps in those bunks tonight. Leave them be.': "Heute Nacht schläft keiner in diesen Pritschen. Lasst sie, wie sie sind.",
    // the Experten
    "{ace} won't be back. I watched him go down.": "{ace} kommt nicht wieder. Ich hab ihn runtergehen sehen.",
    "{ace} got away from us again. He'll be back.": "{ace} ist uns wieder entwischt. Er kommt wieder.",
    "That was your shooting. Don't go looking for a parade. There was a man in that cockpit, too.": "Das war dein Treffer. Erwarte keine Parade. In dem Cockpit saß auch ein Mensch.",
    // the strategic picture
    'Intelligence says the Luftwaffe is running short of pilots. You can see it. The new ones break off early.': "Laut Aufklärung gehen der Luftwaffe die Piloten aus. Man sieht es. Die Neuen drehen früh ab.",
    "Intelligence says they're stronger than they were a month ago. More of them every time we go.": "Laut Aufklärung sind sie stärker als vor einem Monat. Jedes Mal, wenn wir fliegen, sind es mehr.",
    'Then we fly a tighter formation.': "Dann fliegen wir eben eine dichtere Formation.",
    'Intelligence calls it even. They lose fighters, they build more. So do we.': "Die Aufklärung nennt es ausgeglichen. Sie verlieren Jäger, sie bauen neue. Wir auch.",
    // the player's day
    "Didn't get one today? Don't let it eat at you. Every burst you fired kept one of them off us.": "Heute keinen erwischt? Lass dich davon nicht auffressen. Jeder Feuerstoß von dir hat uns einen vom Leib gehalten.",
    'You got one today. Some fellows fly ten missions and never see one fall.': "Du hast heute einen erwischt. Manche fliegen zehn Einsätze und sehen nie einen fallen.",
    "The low squadron saw you knock them down, one after another. They're asking who was on that gun.": "Die untere Staffel hat gesehen, wie du sie einen nach dem anderen runtergeholt hast. Sie fragen, wer an dem MG saß.",
    "Five or more in one day. They're putting your name in for the Cross, and I'm telling everybody I know you.": "Fünf oder mehr an einem Tag. Sie schlagen dich für das Cross vor, und ich erzähl allen, dass ich dich kenne.",
    'I checked the claims board. {kills} confirmed, and you hit with {acc} percent of your rounds.': "Ich hab die Abschusstafel geprüft. {kills} bestätigt, und {acc} Prozent deiner Schüsse haben getroffen.",
    "You shoot like a man who's paying for his own shells.": "Du schießt wie einer, der seine Munition selbst bezahlt.",
    'The armourers say you nearly burned out a barrel. Short bursts. Let the gun cool between them.': "Die Waffenwarte sagen, du hättest fast einen Lauf durchgebrannt. Kurze Feuerstöße. Lass das MG dazwischen abkühlen.",
    "You didn't get one? Doesn't matter. Every time one of them saw you coming, he broke off.": "Keinen erwischt? Egal. Jedes Mal, wenn dich einer kommen sah, drehte er ab.",
    'I watched you from the tail. You came down on them like a hawk on a chicken run.': "Ich hab dich vom Heck aus beobachtet. Du bist auf sie runtergestoßen wie ein Habicht auf den Hühnerhof.",
    'Five or more, the way Dawson tells it. Somebody paint a row of crosses under that canopy.': "Fünf oder mehr, wenn man Dawson glaubt. Einer malt eine Reihe Kreuze unter die Kanzel.",
    'By my count you got {kills} of them, and every one was heading for a bomber.': "Nach meiner Zählung hast du {kills} erwischt, und jeder davon hielt auf einen Bomber zu.",
    // a replacement, the tour
    "{rookie} flew in {who}'s place today. Not bad for a first mission.": "{rookie} ist heute für {who} geflogen. Nicht schlecht für einen ersten Einsatz.",
    "Over the whole tour, we claimed {kills} fighters. The group lost {lost} Fortresses. I'll remember the second number longer.": "Über die ganze Tour haben wir {kills} Jäger als abgeschossen gemeldet. Die Group hat {lost} Fortresses verloren. Die zweite Zahl werde ich länger behalten.",
  },
};

export default table;
