import type { PhraseTable } from '../types';
const table: PhraseTable = {
  phrases: {
    'NORTH SEA & NORTHWEST EUROPE · 1944–45': 'بحر الشمال وشمال غرب أوروبا · ١٩٤٤–٤٥',
    'Extended operation {n}': 'العملية الممتدة {n}',
    '{n} operations completed': 'العمليات المكتملة: {n}',
    'Frankfurt': 'فرانكفورت',
    'Berlin': 'برلين',
    'Bremen': 'بريمن',
    'Volunteer for a second tour': 'تطوّع لجولة خدمة ثانية',
    'Second tour': 'جولة الخدمة الثانية',
    'Second Tour Medal': 'وسام جولة الخدمة الثانية',
    'Complete twenty-five second-tour operations.': 'أكمل خمساً وعشرين عملية في جولة الخدمة الثانية.',
    'Extended service': 'خدمة ممتدة',
    'Tour score: {n}': 'نقاط جولة الخدمة: {n}',
    'Cities': 'المدن',
    'Industrial district': 'المنطقة الصناعية',
    'industrial district': 'المنطقة الصناعية',
    'Bomb the industrial district': 'اقصف المنطقة الصناعية',
    'Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'خمسة وعشرون انتصاراً تمنحك وسام جولة الخدمة الثانية؛ وتستمر العمليات بعد ذلك.',
    'Each successful operation changes enemy strength, replacements and morale. Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'تغيّر كل عملية ناجحة قوة العدو والتعزيزات والمعنويات. خمسة وعشرون انتصاراً تمنحك وسام جولة الخدمة الثانية؛ وتستمر العمليات بعد ذلك.',
    'Armoured Sturmböcke are joining the defence. Expect close attacks from astern.': 'تنضم طائرات شتورمبوك المدرّعة إلى الدفاع. توقّع هجمات قريبة من الخلف.',
    'Me 262 jets are operational; later sorties also face Me 163 rocket fighters.': 'دخلت نفاثات Me 262 الخدمة؛ وتواجه الطلعات اللاحقة مقاتلات Me 163 الصاروخية أيضاً.',
    'A battle group guards this target. Destroy it in the final round.': 'تحرس مجموعة قتالية هذا الهدف. دمّرها في الجولة الأخيرة.',
    'Extended service: a fictional continuation of the air war through late 1945.': 'خدمة ممتدة: استمرار خيالي للحرب الجوية حتى أواخر عام 1945.',
  },
  patterns: [
    [/^Second tour — (.+) — (.+)$/, (m, tr) => `جولة الخدمة الثانية — ${tr(m[1])} — ${tr(m[2])}`],
    [/^Second tour operation (\d+): strike the (.+) at (.+)\.$/, (m, tr) => `العملية ${m[1]} من جولة الخدمة الثانية: اضرب ${tr(m[2])} في ${tr(m[3])}.`],
    [/^Industrial district, (.+)$/, (m, tr) => `المنطقة الصناعية، ${tr(m[1])}`],
    [/^The industrial district at (.+) has been hit\.$/, (m, tr) => `أُصيبت المنطقة الصناعية في ${tr(m[1])}.`],
  ],
};
export default table;
