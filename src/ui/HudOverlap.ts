export interface HudRect { id: string; left: number; top: number; right: number; bottom: number }
export function findHudOverlaps(rects: readonly HudRect[], width: number, height: number) {
  const issues: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    if (a.left < -1 || a.top < -1 || a.right > width + 1 || a.bottom > height + 1) issues.push(`${a.id}: outside viewport`);
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${a.id} overlaps ${b.id}`);
    }
  }
  return issues;
}
/** Dev-only invocation: measures panel leaves, not intentionally nested containers/scene markers. */
export function checkHudOverlaps() {
  const rects: HudRect[] = [];
  const selectors = '#hud .hud-tl, #hud .hud-tr, #hBL, #hBR, #feed, #subs, #tip, #controlsHint, #hudToast, #abilityBar, #objCard, #evPrompt, #spPanel, #nemCard, #limpHome, #streakMeter, #banner, #touchHud button, #touchHud .th-thr';
  for (const el of document.querySelectorAll<HTMLElement>(selectors)) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) rects.push({ id: el.id || el.className || el.dataset.t || el.tagName, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  // Canvas radar is a panel too; world-space markers and the intentional sight/threat arcs are not.
  if (document.body.dataset.hudDetail === 'full' && document.querySelector('#hud.show')) {
    const r = Math.max(38, Math.min(64, Math.min(innerWidth, innerHeight) * .08));
    const x = innerHeight <= 500 ? innerWidth - 120 : innerWidth - 22 - r;
    const y = innerHeight <= 500 ? innerHeight - 120 : innerHeight - 22 - r - 24;
    rects.push({ id: 'radar', left: x - r, right: x + r, top: y - r, bottom: y + r + 24 });
  }
  return { viewport: [innerWidth, innerHeight], rects, issues: findHudOverlaps(rects, innerWidth, innerHeight) };
}
