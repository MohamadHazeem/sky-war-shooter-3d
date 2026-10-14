import type { PhraseTable } from '../types';
// Phase 10 · Enemy AI 2.0 (src/world/PilotMind.ts): crew calls, ace styles and signature moves
const table: PhraseTable = { phrases: {
  // signature moves: first sighting, then recognised
  'He\'s corkscrewing through his run! Wait for him to level out, then hit him!': 'إنه يلتف كالبريمة أثناء انقضاضه! انتظر حتى يستقيم ثم أصبه!',
  'That\'s his corkscrew! Hold fire till he levels out!': 'هذه حركته اللولبية! أمسك النار حتى يستقيم!',
  'He rolled over and split-S\'d under the box! He goes out low!': 'انقلب وغاص بحركة سبليت إس تحت التشكيل! إنه يخرج من الأسفل!',
  'Here comes his split-S! Ball turret, catch him going down!': 'ها هي حركة سبليت إس! يا البرج الكروي، اصطده وهو يهبط!',
  'He pulled straight up after his pass! He hangs up there at the top!': 'صعد عمودياً بعد مروره! إنه يتعلق هناك في الأعلى!',
  'He\'ll zoom up again! Top turret, wait for him at the top!': 'سيصعد عمودياً مرة أخرى! يا برج السطح، انتظره في القمة!',
  'He wingovered straight back in! He comes at the same gun again!': 'استدار بحدة وعاد مباشرة! إنه يهاجم الرشاش نفسه مرة أخرى!',
  'Same trick — he\'ll wingover and come right back! Stay on him!': 'الحيلة نفسها — سيستدير ويعود فوراً! ابقَ عليه!',
  'He snuck up low at six! Watch under the tail!': 'تسلل من الأسفل عند الساعة السادسة! راقبوا تحت الذيل!',
  'His low-six trick again! Tail and ball, watch under us!': 'حيلته من الأسفل عند السادسة مرة أخرى! يا الذيل والبرج الكروي، راقبا أسفلنا!',
  // a weak gun on the player's ship
  'He\'s going for our tail — the tail gunner\'s hit! Somebody cover six!': 'إنه يقصد ذيلنا — رامي الذيل مصاب! فليغطِّ أحدكم الساعة السادسة!',
  'He\'s lining up on the left waist — that gun\'s hurt! Cover nine o\'clock!': 'إنه يصطف على الجانب الأيسر — ذلك الرشاش مصاب! غطّوا الساعة التاسعة!',
  'He\'s lining up on the right waist — that gun\'s hurt! Cover three o\'clock!': 'إنه يصطف على الجانب الأيمن — ذلك الرشاش مصاب! غطّوا الساعة الثالثة!',
  'He\'s diving on the top turret — the engineer\'s hit! Cover the top!': 'إنه ينقض على برج السطح — المهندس مصاب! غطّوا الأعلى!',
  'He\'s coming up under us — the ball turret\'s hurt! Cover the belly!': 'إنه يصعد من تحتنا — البرج الكروي مصاب! غطّوا البطن!',
  // wounded fighters, evasions, Rotte passes
  'That one\'s hit — he\'s limping home, trailing smoke!': 'تلك أصيبت — إنها تعرج عائدة إلى قاعدتها تجر الدخان!',
  'He\'s smoking but he\'s coming back in — finish him!': 'إنه يدخّن لكنه يعود للهجوم — أجهز عليه!',
  'You drove him off — he broke away!': 'لقد أبعدته — انسحب من الهجوم!',
  'Pair coming in, one behind the other! Stay on the gun!': 'زوج قادم، واحد خلف الآخر! ابقَ على الرشاش!',
  // the Experte's dossier card
  'Corkscrew run': 'انقضاض لولبي',
  'Split-S under the box': 'سبليت إس تحت التشكيل',
  'Zoom climb after the pass': 'صعود عمودي بعد المرور',
  'Wingover straight back in': 'استدارة حادة والعودة مباشرة',
  'Low six, up under the tail': 'من الأسفل عند السادسة، صعوداً تحت الذيل',
  'Aggressive': 'عدواني',
  'Cunning': 'ماكر',
  'Cautious': 'حذر',
  'Signature: {move}': 'حركته المميزة: {move}',
  'Signature move: not yet seen': 'حركته المميزة: لم تُرصد بعد',
} };
export default table;
