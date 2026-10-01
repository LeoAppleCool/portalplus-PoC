// PortalPlus Helper, part 2: linking fields by clicking, panel, export/import, notifications.

  // ---------- Linking fields by clicking ----------
  const PICK_EVENTS = [['mouseover', onPickOver], ['mousedown', onPickDown], ['click', onPickClick], ['keydown', onPickKey]];
  function startPick() {
    closePanel();
    stopPick();
    pick = { from: null };
    hint('Step 1 of 2: Click the field to copy ', h('b', null, 'from'), '.');
    for (const [type, fn] of PICK_EVENTS) document.addEventListener(type, fn, true);
  }
  function stopPick() {
    if (!pick) return;
    pick = null;
    for (const [type, fn] of PICK_EVENTS) document.removeEventListener(type, fn, true);
    document.querySelectorAll('.pph-pick-hover, .pph-pick-from').forEach(x => x.classList.remove('pph-pick-hover', 'pph-pick-from'));
    const el = document.getElementById('pph-hint');
    if (el) el.remove();
  }
  function fieldFrom(target) {
    if (!(target instanceof Element) || target.closest('.pph-ui')) return null;
    const lab = target.closest('label');
    const el = target.closest(FIELD_SEL) || (lab && lab.control);
    return el && isField(el) ? el : null;
  }
  function onPickOver(e) {
    const el = fieldFrom(e.target);
    document.querySelectorAll('.pph-pick-hover').forEach(x => x !== el && x.classList.remove('pph-pick-hover'));
    if (el) el.classList.add('pph-pick-hover');
  }
  function onPickDown(e) {
    const el = fieldFrom(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (!pick.from || !pick.from.isConnected) {
      pick.from = el;
      el.classList.add('pph-pick-from');
      hint(`Step 2 of 2: Now click the field that “${labelOf(el)}” should be copied `, h('b', null, 'into'), '.');
      return;
    }
    if (el === pick.from) return toast('Please pick a different field as the target.');
    const from = pick.from;
    stopPick();
    addLink(from, el);
  }
  function onPickClick(e) { if (fieldFrom(e.target)) { e.preventDefault(); e.stopPropagation(); } }
  function onPickKey(e) { if (e.key === 'Escape') { e.preventDefault(); stopPick(); toast('Linking cancelled.'); } }
  function addLink(from, to) {
    const link = { from: refOf(from), to: refOf(to) };
    if (hasLink(link)) return toast('This link already exists.');
    cfg.links.push(link);
    saveConfig();
    lastSeen.set(from, from.value);
    propagate(from, true);               // copy a value that is already there right away
    refreshMarks();
    toast(`Linked: “${link.from.label}” → “${link.to.label}”`);
  }

  // ---------- Panel ----------
  function togglePanel() { if (panel) closePanel(); else openPanel(); }
  function closePanel() { if (panel) panel.remove(); panel = null; }
  function openPanel() {
    closePanel();
    const list = h('div');
    if (!cfg.links.length) list.append(h('p', { class: 'pph-muted' }, 'None yet. Choose which field gets copied into another one automatically.'));
    cfg.links.forEach((l, i) => {
      const s = resolve(l.from), t = resolve(l.to), here = !!(s && t);
      list.append(h('div', { class: 'pph-row' + (here ? ' pph-here' : ''), title: here ? 'Both fields are visible right now' : 'Not on this page right now' },
        h('span', { class: 'pph-dot' }),
        h('span', { class: 'pph-names' }, `${l.from.label} → ${l.to.label}`),
        here ? h('button', { type: 'button', class: 'pph-icon', title: 'Copy again now', onclick: () => resync(s, t) }, '↻') : null,
        h('button', { type: 'button', class: 'pph-icon', title: 'Delete link', onclick: () => { cfg.links.splice(i, 1); saveConfig(); refreshMarks(); openPanel(); } }, '✕')));
    });
    const box = h('input', { type: 'checkbox', onchange: e => { cfg.dateButtons = e.target.checked; saveConfig(); scan(); } });
    box.checked = cfg.dateButtons;
    panel = h('div', { class: 'pph-ui pph-panel', role: 'dialog', 'aria-label': 'PortalPlus Helper' },
      h('div', { class: 'pph-head' }, h('strong', null, 'PortalPlus Helper'), h('span', { class: 'pph-muted' }, 'v' + VERSION),
        h('button', { type: 'button', class: 'pph-icon pph-x', title: 'Close', onclick: closePanel }, '✕')),
      h('label', { class: 'pph-check' }, box, '“Today” buttons next to date fields'),
      h('div', { class: 'pph-sub' }, 'Linked fields'),
      list,
      h('div', { class: 'pph-actions' },
        h('button', { type: 'button', class: 'pph-btn pph-primary', onclick: startPick }, '+ Link fields'),
        h('button', { type: 'button', class: 'pph-btn', title: 'Copy the links as a code, e.g. for a school PC', onclick: exportLinks }, 'Export'),
        h('button', { type: 'button', class: 'pph-btn', title: 'Paste a code from another PC', onclick: importLinks }, 'Import')),
      h('p', { class: 'pph-muted pph-legend' }, h('i', { class: 'pph-sw' }), 'copied automatically', h('br'),
        h('i', { class: 'pph-sw pph-sw-amber' }), 'own value, stays – clear the target field to re-link it'));
    document.body.append(panel);
  }
  function exportLinks() {
    if (!cfg.links.length) return toast('There are no links yet.');
    const bytes = new TextEncoder().encode(JSON.stringify(cfg.links));
    const code = 'PPH1.' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const show = () => prompt('Copy this code and paste it under “Import” in the helper on the other PC:', code);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(() => toast('Code copied – paste it under “Import” in the helper on the other PC.'), show);
    } else show();
  }
  function importLinks() {
    const code = (prompt('Paste the export code:') || '').trim();
    if (!code) return;
    let added = 0;
    try {
      if (!code.startsWith('PPH1.')) throw new Error('not a helper code');
      const links = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.slice(5)), c => c.charCodeAt(0))));
      for (const l of links) if (validLink(l) && !hasLink(l)) { cfg.links.push(copyLink(l)); added++; }
    } catch (e) { return toast('This code is invalid.'); }
    saveConfig();
    refreshMarks();
    openPanel();
    toast(added ? `${added} link(s) imported.` : 'No new links in this code.');
  }

  // ---------- Notifications ----------
  function toast(msg) {
    let t = document.getElementById('pph-toast');
    if (!t) { t = h('div', { id: 'pph-toast', class: 'pph-ui pph-toast', role: 'status' }); document.body.append(t); void t.offsetWidth; }
    t.textContent = msg;
    t.classList.add('pph-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('pph-show'), 3000);
  }
  function hint(...parts) {
    let el = document.getElementById('pph-hint');
    if (!el) { el = h('div', { id: 'pph-hint', class: 'pph-ui pph-hint', role: 'status' }); document.body.append(el); }
    el.replaceChildren(h('span', null, ...parts), h('button', { type: 'button', class: 'pph-btn', onclick: stopPick }, 'Cancel'));
  }
  function flash(el) {
    if (el.classList.contains('pph-flash')) return;
    el.classList.add('pph-flash');
    setTimeout(() => el.classList.remove('pph-flash'), 800);
  }

  // Start at the very end so both parts are fully loaded
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
