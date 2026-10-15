// The Mods screen (Phase 11 goal 38; Hangar → Aircraft & Armory → Mods): add mod files (picker,
// drag and drop or pasted text), switch installed mods on and off, remove them, fly their
// missions, install the bundled examples and download a template. Logic: game/Mods.ts (schema,
// storage) and game/ModRuntime.ts (applying). Every text from a mod is escaped here.
import { MOD_FORMAT, installPack, modTemplate, packCounts, parseMod, type InstalledMod, type ModIssue } from '../game/Mods';
import { activeModMissions, imageFailed, installedMods, onModsChanged, setInstalled } from '../game/ModRuntime';
import { buildUserMission, describeSpec, missionTitle } from '../game/MissionEditor';
import type { Mission } from '../game/Missions';
import { assetUrl } from '../core/Assets';
import { esc, onBackKey, showLayer } from './serviceCommon';
import { injectCss as injectBattleCss } from './CustomBattleScreen';
import { tx } from '../i18n';

export interface ModsOpts { start(m: Mission): void; back(): void }
interface Example { id: string; file: string; name: string; description: string }

const LAYER = 'mods-screen';
let message = '';                 // the last add / remove result (HTML, already escaped)
let examples: Example[] | null = null;
let unlisten: (() => void) | null = null;

function injectCss() {
  injectBattleCss();
  if (document.getElementById('mods-css')) return;
  const st = document.createElement('style');
  st.id = 'mods-css';
  st.textContent = `
/* the sticky Back sits in an opaque full-width strip, so cards scroll under it (as on the Survival sheet) */
#${LAYER} .box > .btn.menu-back { background: var(--panel-solid, #202720); box-shadow: 0 0 0 100vmax #2b2c27; clip-path: inset(-40px -100vmax -12px -100vmax); z-index: 3; }
#${LAYER} .box > .btn.menu-back + .kicker { margin-top: 14px; }
.mods-add { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 14px 0 6px; }
.mods-drop { border: 2px dashed var(--line); padding: 14px; text-align: center; color: var(--ink-dim); font-size: 14px; margin: 6px 0; }
.mods-drop.over { border-color: var(--khaki); color: var(--ink); background: rgba(185,167,111,0.08); }
.mods-msg:empty { display: none; }
.mods-msg { border-inline-start: 3px solid var(--good); background: rgba(0,0,0,0.25); padding: 10px 12px; margin: 10px 0; font-size: 14px; line-height: 1.5; }
.mods-msg.bad { border-color: var(--bad); }
.mods-msg ul { margin: 6px 0 0; padding-inline-start: 18px; color: var(--ink-dim); font-size: 13px; }
.mods-msg code, .mods-help code { font-family: 'IBM Plex Mono', monospace; font-size: 12px; direction: ltr; unicode-bidi: isolate; }
.mods-paste textarea { width: 100%; min-height: 120px; box-sizing: border-box; background: rgba(0,0,0,0.3); color: var(--ink); border: 1px solid var(--line); font: 12px/1.4 'IBM Plex Mono', monospace; padding: 8px; direction: ltr; }
.mods-h { margin: 22px 0 8px; }
.mods-list { display: flex; flex-direction: column; gap: 10px; }
.mod-card { border: 1px solid var(--line); border-inline-start: 4px solid var(--khaki); background: rgba(0,0,0,0.22); padding: 12px 14px; }
.mod-card.off { border-inline-start-color: var(--line); opacity: 0.85; }
.mod-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.mod-head .t { font-size: 18px; color: var(--ink); flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.mod-head small { color: var(--ink-dim); font-size: 13px; margin-inline-start: 6px; }
.mod-card p { margin: 6px 0; font-size: 14px; overflow-wrap: anywhere; }
.mod-tags { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--khaki); letter-spacing: .5px; }
:lang(ar) .mod-tags { font-family: inherit; font-size: 13px; letter-spacing: 0; }
.mod-sw { min-height: 40px; min-width: 76px; padding: 6px 12px; font: inherit; font-size: 14px; letter-spacing: 1px; cursor: pointer; border: 1px solid var(--line); background: rgba(0,0,0,0.3); color: var(--ink-dim); }
.mod-sw[aria-checked=true] { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
.mod-sw:focus-visible, .mod-act button:focus-visible, .mod-m button:focus-visible { outline: 2px solid #ead99e; outline-offset: 2px; }
.mod-ms { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.mod-m { display: flex; gap: 10px; align-items: center; border-top: 1px solid var(--line); padding-top: 6px; }
.mod-m div { flex: 1 1 auto; min-width: 0; }
.mod-m b { display: block; font-weight: 400; overflow-wrap: anywhere; }
.mod-m small { color: var(--ink-dim); font-size: 12px; }
.mod-m button, .mod-act button { min-height: 40px; padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; border: 1px solid var(--line); background: rgba(0,0,0,0.3); color: var(--ink); }
.mod-m button.fly { background: var(--khaki); color: #1b1a12; border-color: var(--khaki); }
.mod-act { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.mod-act button.rm:hover, .mod-act button.rm.sure { color: var(--bad); border-color: var(--bad); }
.mod-warn { color: var(--warn); font-size: 13px; margin-top: 6px; }
.mods-help { font-size: 14px; color: var(--ink-dim); line-height: 1.6; }
.mods-help ul { padding-inline-start: 18px; margin: 6px 0; }
`;
  document.head.appendChild(st);
}

const count = (n: number, one: string, many: string) => tx(n === 1 ? one : many, { n });

function tags(m: InstalledMod) {
  const c = packCounts(m.pack);
  return [
    c.missions && count(c.missions, '1 mission', '{n} missions'),
    c.paints && count(c.paints, '1 paint scheme', '{n} paint schemes'),
    c.noseArt && count(c.noseArt, '1 nose art', '{n} nose art designs'),
    c.crew && count(c.crew, '1 crew name', '{n} crew names'),
  ].filter(Boolean).join(' · ');
}

const issueText = (i: ModIssue) => tx(i.key, i.vars);
const issues = (list: ModIssue[], max = 8) => `<ul>${list.slice(0, max).map((i) => `<li>${esc(issueText(i))}</li>`).join('')}${list.length > max ? `<li>${esc(tx('…and {n} more', { n: list.length - max }))}</li>` : ''}</ul>`;

// Read one file's text and install it; returns the message HTML and whether it worked
function addText(text: string, source: string): { html: string; ok: boolean } {
  const r = parseMod(text);
  const label = `<b><bdi>${esc(source)}</bdi></b>`;
  if (!r.ok) return { ok: false, html: `${tx('Could not add {file}:', { file: label })}${issues(r.errors)}` };
  const res = installPack([...installedMods()], r.pack, source);
  if (!res.ok) return { ok: false, html: `${tx('Could not add {file}:', { file: label })}${issues([res.error])}` };
  if (!setInstalled(res.list)) return { ok: false, html: `${tx('Could not add {file}:', { file: label })}${issues([{ key: 'Not enough room for this mod. Remove a mod with large images first.' }])}` };
  const name = `<b><bdi>${esc(r.pack.name)}</bdi></b>`;
  return { ok: true, html: tx(res.replaced ? 'Updated {name}.' : 'Added {name}. It is switched on.', { name }) + (r.warnings.length ? issues(r.warnings, 4) : '') };
}

async function addFiles(files: FileList | File[], redraw: () => void) {
  const out: { html: string; ok: boolean }[] = [];
  for (const f of Array.from(files).slice(0, 12)) {
    if (f.size > 1_000_000) { out.push({ ok: false, html: `${tx('Could not add {file}:', { file: `<b><bdi>${esc(f.name)}</bdi></b>` })}${issues([{ key: 'The file is too large (at most {kb} KB).', vars: { kb: 1000 } }])}` }); continue; }
    out.push(addText(await f.text(), f.name));
  }
  message = out.map((o) => `<div class="mods-msg ${o.ok ? '' : 'bad'}">${o.html}</div>`).join('');
  redraw();
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadExamples(): Promise<Example[]> {
  if (examples) return examples;
  try {
    const r = await fetch(assetUrl('mods/index.json'));
    const list = (await r.json()) as unknown;
    examples = Array.isArray(list) ? list.filter((e): e is Example => !!e && typeof e.id === 'string' && typeof e.file === 'string' && /^[a-z0-9-]+\.json$/.test(e.file)).slice(0, 8) : [];
  } catch { examples = []; }
  return examples;
}

export function showModsScreen(o: ModsOpts) {
  injectCss();
  const el = showLayer(LAYER);
  const redraw = () => { if (el.classList.contains('show')) draw(true); };
  unlisten?.();
  unlisten = onModsChanged(redraw);
  // keep: stay at the same scroll position (a switch flipped, an image decoded); else show the message at the top
  const draw = (keep = false) => {
    const list = installedMods();
    const missions = activeModMissions();
    const scroll = keep ? el.querySelector('.box')?.scrollTop ?? 0 : 0;
    el.innerHTML = `<div class="screen-center"><div class="box panel menu-sheet">
      <button class="btn ghost menu-back" data-back>${tx('Back')}</button>
      <div class="kicker">${tx('COMMUNITY CONTENT')}</div><h2>${tx('Mods')}</h2>
      <p>${tx('Add missions, paint schemes, nose art and crew names made by other players. A mod is a JSON file: it holds data only and never runs code.')}</p>
      <div class="mods-add"><button class="btn" data-pick>${tx('Add mod file')}</button><input type="file" accept=".json,application/json" multiple hidden data-file/></div>
      <div class="mods-drop" data-drop>${tx('…or drop .json mod files here')}</div>
      <div data-msg role="status" aria-live="polite">${message}</div>
      <details class="settings-group mods-paste"><summary>${tx('Paste mod text')}</summary>
        <textarea data-paste spellcheck="false" aria-label="${esc(tx('Mod text (JSON)'))}" placeholder='{ "format": "${MOD_FORMAT}", … }'></textarea>
        <div class="mod-act"><button data-paste-add>${tx('Add')}</button></div></details>
      <div class="cb-l mods-h">${tx('Installed mods')}</div>
      <div class="mods-list">${list.length ? list.map((m) => card(m, missions.filter((x) => x.packId === m.pack.id).map((x) => x.mission))).join('') : `<p class="cb-note">${tx('No mods yet. Add a mod file, or install one of the examples below.')}</p>`}</div>
      <div class="cb-l mods-h">${tx('Example mods')}</div>
      <div class="mods-list" data-examples><p class="cb-note">${tx('Loading…')}</p></div>
      <details class="settings-group mods-help"><summary>${tx('How to make a mod')}</summary>
        <p>${tx('Start from the template, change it in any text editor, then add the file here. A mod can hold:')}</p>
        <ul><li>${tx('Missions: the same choices as the Mission Editor, or a mission code from it.')}</li>
        <li>${tx('Paint schemes: a top and an underside colour, and an optional tileable camouflage image.')}</li>
        <li>${tx('Nose art: an image, with your bomber\'s name painted under it.')}</li>
        <li>${tx('Crew names: new first names, surnames and nicknames for your crew.')}</li></ul>
        <p>${tx('Images must be embedded in the file as PNG, JPEG or WebP (data URLs) of at most 1024 pixels a side. Web addresses are not allowed.')}</p>
        <div class="mod-act"><button data-template>${tx('Download template')}</button></div></details>
      <p class="cb-note">${tx('Paint schemes and nose art from mods appear in Hangar → Customize. Mod missions are not posted to the online leaderboards.')}</p>
    </div></div>`;
    el.querySelector<HTMLElement>('.box')!.scrollTop = scroll;
    wire();
    void loadExamples().then((ex) => drawExamples(ex));
  };

  const card = (m: InstalledMod, ms: InstalledMod['pack']['missions']) => {
    const p = m.pack;
    const bad = [...p.paints.flatMap((x) => (x.pattern ? [x.pattern] : [])), ...p.noseArt.map((x) => x.image)].filter(imageFailed).length;
    return `<div class="mod-card ${m.enabled ? '' : 'off'}" data-id="${esc(p.id)}">
      <div class="mod-head"><div class="t"><bdi>${esc(tx(p.name))}</bdi>${p.author ? `<small>${tx('by {who}', { who: `<bdi>${esc(p.author)}</bdi>` })}</small>` : ''}</div>
        <button class="mod-sw" role="switch" aria-checked="${m.enabled}" data-sw aria-label="${esc(tx('Use {name}', { name: p.name }))}">${tx(m.enabled ? 'On' : 'Off')}</button></div>
      ${p.description ? `<p><bdi>${esc(tx(p.description))}</bdi></p>` : ''}
      <div class="mod-tags">${esc(tags(m))}</div>
      ${bad ? `<div class="mod-warn">${esc(count(bad, 'One image could not be read and is not used.', '{n} images could not be read and are not used.'))}</div>` : ''}
      ${m.enabled && ms.length ? `<div class="mod-ms">${ms.map((x) => `<div class="mod-m"><div><b><bdi>${esc(x.spec.name || tx(missionTitle(x.spec)))}</bdi></b><small>${esc(describeSpec(x.spec).slice(0, 3).map((s) => tx(s)).join(' · '))}</small></div><button class="fly" data-fly="${esc(x.id)}">${tx('Fly')}</button></div>`).join('')}</div>` : ''}
      <div class="mod-act"><button class="rm" data-rm>${tx('Remove')}</button></div>
    </div>`;
  };

  const drawExamples = (ex: Example[]) => {
    const host = el.querySelector<HTMLElement>('[data-examples]');
    if (!host) return;
    const have = new Set(installedMods().map((m) => m.pack.id));
    host.innerHTML = ex.length ? ex.map((e) => `<div class="mod-card off"><div class="mod-head"><div class="t"><bdi>${esc(tx(e.name))}</bdi></div>
      <button class="mod-sw" data-ex="${esc(e.file)}" ${have.has(e.id) ? 'disabled' : ''}>${tx(have.has(e.id) ? 'Installed' : 'Install')}</button></div>
      <p>${esc(tx(e.description))}</p></div>`).join('') : `<p class="cb-note">${tx('No examples available offline.')}</p>`;
    host.querySelectorAll<HTMLButtonElement>('[data-ex]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const text = await (await fetch(assetUrl('mods/' + b.dataset.ex!))).text();
        const r = addText(text, b.dataset.ex!);
        message = `<div class="mods-msg ${r.ok ? '' : 'bad'}">${r.html}</div>`;
      } catch { message = `<div class="mods-msg bad">${tx('Could not load the example. Check your connection.')}</div>`; }
      draw();
    }));
  };

  const wire = () => {
    el.querySelector('[data-back]')!.addEventListener('click', () => { unlisten?.(); unlisten = null; message = ''; o.back(); });
    const input = el.querySelector<HTMLInputElement>('[data-file]')!;
    el.querySelector('[data-pick]')!.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files?.length) void addFiles(input.files, draw); });
    const drop = el.querySelector<HTMLElement>('[data-drop]')!;
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files, draw); });
    el.querySelector('[data-paste-add]')!.addEventListener('click', () => {
      const ta = el.querySelector<HTMLTextAreaElement>('[data-paste]')!;
      const r = addText(ta.value, tx('Pasted mod'));
      message = `<div class="mods-msg ${r.ok ? '' : 'bad'}">${r.html}</div>`;
      draw();
      if (!r.ok) { const d = el.querySelector<HTMLDetailsElement>('.mods-paste'); if (d) { d.open = true; d.querySelector<HTMLTextAreaElement>('textarea')!.value = ta.value; } }
    });
    el.querySelector('[data-template]')!.addEventListener('click', () => download('my-first-mod.json', JSON.stringify(modTemplate(), null, 2)));
    el.querySelectorAll<HTMLElement>('.mod-card[data-id]').forEach((c) => {
      const id = c.dataset.id!;
      c.querySelector('[data-sw]')!.addEventListener('click', () => {
        message = '';
        setInstalled(installedMods().map((m) => (m.pack.id === id ? { ...m, enabled: !m.enabled } : m)));   // redraws (onModsChanged), keeping the scroll
        el.querySelector<HTMLElement>(`.mod-card[data-id="${CSS.escape(id)}"] [data-sw]`)?.focus();
      });
      const rm = c.querySelector<HTMLButtonElement>('[data-rm]')!;
      rm.addEventListener('click', () => {
        if (!rm.classList.contains('sure')) { rm.classList.add('sure'); rm.textContent = tx('Remove this mod?'); return; }
        const name = installedMods().find((m) => m.pack.id === id)?.pack.name ?? '';
        message = `<div class="mods-msg">${tx('Removed {name}.', { name: `<b><bdi>${esc(name)}</bdi></b>` })}</div>`;
        setInstalled(installedMods().filter((m) => m.pack.id !== id));
      });
      c.querySelectorAll<HTMLButtonElement>('[data-fly]').forEach((b) => b.addEventListener('click', () => {
        const x = activeModMissions().find((m) => m.packId === id && m.mission.id === b.dataset.fly);
        if (x) { unlisten?.(); unlisten = null; message = ''; o.start(buildUserMission(x.mission.spec)); }
      }));
    });
  };

  draw();
  onBackKey(el, () => { unlisten?.(); unlisten = null; message = ''; o.back(); });
}
