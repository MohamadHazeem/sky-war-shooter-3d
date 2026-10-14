// Skill tree screen: a cyanotype blueprint page from a gunnery technical manual. Three branch
// columns of node cards joined by drafting lines; owned nodes are stamped QUALIFIED, nodes
// you can afford are drawn solid, the rest dashed or faded. Hover / focus shows a tooltip;
// a node is bought with two clicks (arm, then confirm) so a stray click never spends a point.
//
// showSkillTree(): full-screen layer opened from the title menu ("Skills").
// mountSkillSection(): the same tree as a section of the hangar (CrateUI.mountHangarExtras).
import type { Progression } from '../game/Upgrades';
import {
  BRANCHES, SKILLS, TREE_COST, nextPointAt, skillDef, skillPointsFor, careerXp, type SkillDef, type SkillId, type NodeState,
} from '../game/Skills';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { achievements } from '../game/Achievements';
import { BRANCH_SIZE, fullestBranch } from '../game/Feats';
import { tx, isAr, num } from '../i18n';
import './skills.css';

export interface TreeCtx { prog: Progression; xp(): number; onChange?(kind: 'buy' | 'respec'): void }

const ROW = 118;            // px between tiers
const TOP = 54;             // centre of the first row
const COL_X: Record<-1 | 0 | 1, number> = { [-1]: 25, 0: 50, 1: 75 };
// Arabic mirrors the branch columns (cards and drafting lines alike): the tree reads from the right
const colX = (c: -1 | 0 | 1) => COL_X[(isAr() ? -c : c) as -1 | 0 | 1];
const HEIGHT = TOP + 3 * ROW + 56;
const STATE_LABEL: Record<NodeState, string> = { owned: 'QUALIFIED', available: 'AVAILABLE', short: 'NOT ENOUGH POINTS', locked: 'LOCKED' };

const fmt = num;
const pts = (n: number) => tx(`${n} pt${n === 1 ? '' : 's'}`);
const stateLabel = (s: NodeState) => tx(STATE_LABEL[s]);
// drawing code of a card: branch letter, row, and the side of the sheet it is drawn on
const code = (d: SkillDef) => { const c = isAr() ? -d.col : d.col; return `${d.branch[0].toUpperCase()}-${d.tier + 1}${c < 0 ? 'L' : c > 0 ? 'R' : ''}`; };

// ---------------- full screen ----------------

export function showSkillTree(h: { prog: Progression; xp(): number; back(): void }) {
  const el = showLayer('sk-screen');
  el.innerHTML = `<div class="screen-center"><div class="sk-bp sk-sheet">
    <div class="sk-hdr"><span>${tx('WAR DEPARTMENT · ARMY AIR FORCES')}</span><span>${tx('TECHNICAL MANUAL TM 1-SK · AERIAL GUNNERY QUALIFICATION')}</span></div>
    <div class="sk-titlerow">
      <h2>${tx('Skills')}</h2>
      <div class="sk-sub">${tx('Long-term qualifications. Points come with every promotion and every {n} XP past Major.', { n: fmt(3000) })}</div>
    </div>
    <div class="sk-host"></div>
    <div class="sk-foot"><button class="btn ghost" data-back>${tx('Back')}</button></div>
    <div class="sk-plate">${tx('DRAWING NO. SK-1944 · SHEET 1 OF 1 · SCALE NONE')}</div>
  </div></div>`;
  const host = el.querySelector<HTMLElement>('.sk-host')!;
  renderTree(host, { prog: h.prog, xp: h.xp });
  const back = () => { hideTip(); h.back(); };
  el.querySelector('[data-back]')!.addEventListener('click', back);
  onBackKey(el, back);
}

// ---------------- hangar section ----------------

let hangarScroll = -1;

export function mountSkillSection(wrap: HTMLElement, prog: Progression, rerender: () => void) {
  const anchor = wrap.querySelector<HTMLElement>(':scope > .row:last-of-type');
  const sec = document.createElement('div');
  sec.className = 'sk-hangar';
  sec.innerHTML = `<div class="hsec">${tx('SKILLS · LONG-TERM QUALIFICATIONS')}</div><div class="sk-bp sk-inline"><div class="sk-host"></div></div>`;
  wrap.insertBefore(sec, anchor);
  renderTree(sec.querySelector<HTMLElement>('.sk-host')!, {
    prog, xp: careerXp,
    // a respec spends merit: redraw the hangar (merit counter, affordable cards), keep the scroll
    onChange: (kind) => { if (kind === 'respec') { hangarScroll = wrap.scrollTop; rerender(); } },
  }, true);
  if (hangarScroll >= 0) { wrap.scrollTop = hangarScroll; hangarScroll = -1; }
}

// ---------------- the tree ----------------

export function renderTree(host: HTMLElement, ctx: TreeCtx, compact = false) {
  let branch = BRANCHES[0].id;
  let armed: SkillId | null = null;
  let respecArmed = false;

  const draw = () => {
    hideTip();   // a tooltip left over from another tree (or before this redraw)
    const book = ctx.prog.skills, xp = ctx.xp();
    const avail = book.available(xp), spent = book.spent(), earned = skillPointsFor(xp);
    const cost = book.respecCost();
    const next = nextPointAt(xp);
    host.innerHTML = `
      <div class="sk-counter">
        <div class="sk-pts"><b>${avail}</b><span>${tx(avail === 1 ? 'SKILL POINT<br/>AVAILABLE' : 'SKILL POINTS<br/>AVAILABLE')}</span></div>
        <div class="sk-ledger">
          <div>${tx('Earned <b>{e}</b> · spent <b>{s}</b> of {t}', { e: earned, s: spent, t: TREE_COST })}</div>
          <div>${tx('Next point at <b>{n} XP</b> ({m} to go)', { n: fmt(next), m: fmt(Math.max(0, next - xp)) })}</div>
        </div>
        <button class="sk-respec ${respecArmed ? 'armed' : ''}" data-respec ${cost <= 0 || ctx.prog.points < cost ? 'disabled' : ''}
          title="${tx('Refund every skill point. Costs merit.')}">${cost <= 0 ? tx('Respec') : tx(respecArmed ? 'Confirm respec · {n} merit' : 'Respec · {n} merit', { n: fmt(cost) })}</button>
      </div>
      ${!compact ? `<label class="skill-branch-picker">${tx('Skill branch')} <select data-branch-pick>${BRANCHES.map(b => `<option value="${b.id}" ${b.id === branch ? 'selected' : ''}>${tx(b.name)}</option>`).join('')}</select></label>` : ''}
      <div class="sk-branches ${compact ? 'compact' : ''}">${BRANCHES.filter(b => compact || b.id === branch).map((b) => branchHtml(b, ctx, xp, armed)).join('')}</div>
      <div class="sk-legend"><span class="lg owned">${tx('Qualified')}</span><span class="lg available">${tx('Available')}</span><span class="lg short">${tx('Short of points')}</span><span class="lg locked">${tx('Locked')}</span>
        <span class="sk-hint">${tx('Hover a card for details · click twice to qualify')}</span></div>`;
    wire();
  };

  const wire = () => {
    const picker = host.querySelector<HTMLSelectElement>('[data-branch-pick]');
    if (picker) picker.onchange = () => { branch = picker.value as typeof branch; armed = null; draw(); };
    host.querySelectorAll<HTMLButtonElement>('.sk-node').forEach((n) => {
      const id = n.dataset.id as SkillId;
      n.addEventListener('mouseenter', () => showTip(n, id, ctx));
      n.addEventListener('focus', () => showTip(n, id, ctx));
      n.addEventListener('mouseleave', hideTip);
      n.addEventListener('blur', hideTip);
      n.addEventListener('click', () => {
        const book = ctx.prog.skills, xp = ctx.xp();
        respecArmed = false;
        if (!book.canBuy(id, xp)) { armed = null; n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake'); return; }
        if (armed !== id) { armed = id; draw(); focusNode(id); return; }
        armed = null;
        book.buy(id, xp);
        if (fullestBranch(book.owned) >= BRANCH_SIZE) achievements.unlock('specialist'); // achievement hook (Feats.ts)
        hideTip();
        draw();
        host.querySelector(`.sk-node[data-id="${id}"]`)?.classList.add('just');
        ctx.onChange?.('buy');
      });
    });
    host.querySelector<HTMLButtonElement>('[data-respec]')?.addEventListener('click', () => {
      armed = null;
      if (!respecArmed) { respecArmed = true; draw(); return; }
      respecArmed = false;
      const ok = ctx.prog.skills.respec(ctx.prog);
      draw();
      if (ok) ctx.onChange?.('respec');
    });
  };

  const focusNode = (id: SkillId) => {
    const n = host.querySelector<HTMLElement>(`.sk-node[data-id="${id}"]`);
    if (n) { n.focus({ preventScroll: true }); showTip(n, id, ctx); }
  };

  draw();
}

function branchHtml(b: (typeof BRANCHES)[number], ctx: TreeCtx, xp: number, armed: SkillId | null): string {
  const book = ctx.prog.skills;
  const nodes = SKILLS.filter((s) => s.branch === b.id);
  const owned = nodes.filter((s) => book.has(s.id)).length;
  // drafting lines: an elbow from the bottom of each prerequisite to the top of the node
  const lines = nodes.flatMap((n) => n.req.map((r) => {
    const p = skillDef(r)!;
    const x1 = colX(p.col), y1 = TOP + p.tier * ROW + 30, x2 = colX(n.col), y2 = TOP + n.tier * ROW - 30, ym = (y1 + y2) / 2;
    const live = book.has(r);
    const cls = book.has(n.id) && live ? 'own' : live ? 'open' : '';
    return `<path class="${cls}" d="M${x1} ${y1} V${ym} H${x2} V${y2}" vector-effect="non-scaling-stroke"/>`;
  })).join('');
  const cards = nodes.map((n) => {
    const st = book.state(n.id, xp);
    const isArmed = armed === n.id && st === 'available';
    const p = pts(n.cost);
    const label = isArmed ? tx('CONFIRM · {pts}', { pts: p }) : st === 'owned' ? tx('QUALIFIED') : st === 'available' ? tx('QUALIFY · {pts}', { pts: p }) : st === 'short' ? tx('NEEDS {pts}', { pts: p }) : tx('LOCKED');
    return `<button class="sk-node ${st} ${n.capstone ? 'cap' : ''} ${isArmed ? 'armed' : ''}" data-id="${n.id}"
        style="left:${colX(n.col)}%;top:${TOP + n.tier * ROW}px" aria-label="${esc(tx('{name}: {desc} {state}, costs {pts}', { name: tx(n.name), desc: tx(n.desc), state: stateLabel(st), pts: p }))}">
      <span class="sk-code">${code(n)}</span><span class="sk-cost">${n.cost}</span>
      <span class="sk-name">${esc(tx(n.name))}</span>
      <span class="sk-state">${label}</span>
      ${st === 'owned' ? `<span class="sk-stamp">${tx('QUALIFIED')}</span>` : ''}
    </button>`;
  }).join('');
  return `<section class="sk-branch" data-branch="${b.id}">
    <header><span class="sk-bcode">${esc(b.code)}</span><h3>${esc(tx(b.name))}</h3><span class="sk-bown">${owned}/${nodes.length}</span><div class="sk-motto">${esc(tx(b.motto))}</div></header>
    <div class="sk-field" style="height:${HEIGHT}px">
      <svg class="sk-lines" viewBox="0 0 100 ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
      ${cards}
    </div>
  </section>`;
}

// ---------------- tooltip ----------------

let tipEl: HTMLElement | null = null;

function showTip(anchor: HTMLElement, id: SkillId, ctx: TreeCtx) {
  const d = skillDef(id);
  if (!d) return;
  const book = ctx.prog.skills, st = book.state(id, ctx.xp());
  if (!tipEl || !tipEl.isConnected) {
    tipEl = document.createElement('div');
    tipEl.className = 'sk-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    addEventListener('keydown', (e) => { if (e.code !== 'Tab') hideTip(); }, true);   // e.g. Space launching the hangar
  }
  const reqs = d.req.map((r) => `<span class="${book.has(r) ? 'ok' : ''}">${esc(tx(skillDef(r)!.name))}</span>`).join(` <i>${tx(d.reqAny ? 'or' : 'and')}</i> `);
  const branch = BRANCHES.find((b) => b.id === d.branch)!;
  tipEl.innerHTML = `<div class="k">${esc(tx(branch.name).toUpperCase())} · ${code(d)}${d.capstone ? ` · ${tx('CAPSTONE')}` : ''}</div>
    <div class="t">${esc(tx(d.name))}</div>
    <div class="d">${esc(tx(d.desc))}</div>
    ${d.req.length ? `<div class="r">${tx('Requires: {list}', { list: reqs })}</div>` : ''}
    <div class="s s-${st}">${stateLabel(st)} · ${pts(d.cost)}${st === 'available' ? ` · ${tx('click twice to qualify')}` : ''}</div>`;
  const r = anchor.getBoundingClientRect();
  tipEl.classList.add('show');
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2, y = r.bottom + 8;
  if (y + th > innerHeight - 8) y = r.top - th - 8;
  x = Math.max(8, Math.min(innerWidth - tw - 8, x));
  tipEl.style.left = `${x}px`;
  tipEl.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() { tipEl?.classList.remove('show'); }
