// PortalPlus-Helfer, Teil 2: Verknüpfen per Klick, Bedienfeld, Export/Import, Hinweise.

  // ---------- Verknüpfen per Klick ----------
  const PICK_EVENTS = [['mouseover', onPickOver], ['mousedown', onPickDown], ['click', onPickClick], ['keydown', onPickKey]];
  function startPick() {
    closePanel();
    stopPick();
    pick = { from: null };
    hint('Schritt 1 von 2: Klicke auf das Feld, ', h('b', null, 'aus dem'), ' übernommen werden soll.');
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
      hint('Schritt 2 von 2: Klicke jetzt auf das Feld, ', h('b', null, 'in das'), ` »${labelOf(el)}« automatisch übernommen werden soll.`);
      return;
    }
    if (el === pick.from) return toast('Bitte ein anderes Feld als Ziel wählen.');
    const from = pick.from;
    stopPick();
    addLink(from, el);
  }
  function onPickClick(e) { if (fieldFrom(e.target)) { e.preventDefault(); e.stopPropagation(); } }
  function onPickKey(e) { if (e.key === 'Escape') { e.preventDefault(); stopPick(); toast('Verknüpfen abgebrochen.'); } }
  function addLink(from, to) {
    const link = { from: refOf(from), to: refOf(to) };
    if (hasLink(link)) return toast('Diese Verknüpfung gibt es schon.');
    cfg.links.push(link);
    saveConfig();
    lastSeen.set(from, from.value);
    propagate(from, true);               // bereits eingetragenen Wert gleich übernehmen
    refreshMarks();
    toast(`Verknüpft: »${link.from.label}« → »${link.to.label}«`);
  }

  // ---------- Bedienfeld ----------
  function togglePanel() { if (panel) closePanel(); else openPanel(); }
  function closePanel() { if (panel) panel.remove(); panel = null; }
  function openPanel() {
    closePanel();
    const list = h('div');
    if (!cfg.links.length) list.append(h('p', { class: 'pph-muted' }, 'Noch keine. Lege fest, welches Feld automatisch in ein anderes übernommen wird.'));
    cfg.links.forEach((l, i) => {
      const s = resolve(l.from), t = resolve(l.to), here = !!(s && t);
      list.append(h('div', { class: 'pph-row' + (here ? ' pph-here' : ''), title: here ? 'Beide Felder sind gerade sichtbar' : 'Gerade nicht auf dieser Seite' },
        h('span', { class: 'pph-dot' }),
        h('span', { class: 'pph-names' }, `${l.from.label} → ${l.to.label}`),
        here ? h('button', { type: 'button', class: 'pph-icon', title: 'Jetzt neu übernehmen', onclick: () => resync(s, t) }, '↻') : null,
        h('button', { type: 'button', class: 'pph-icon', title: 'Verknüpfung löschen', onclick: () => { cfg.links.splice(i, 1); saveConfig(); refreshMarks(); openPanel(); } }, '✕')));
    });
    const box = h('input', { type: 'checkbox', onchange: e => { cfg.dateButtons = e.target.checked; saveConfig(); scan(); } });
    box.checked = cfg.dateButtons;
    panel = h('div', { class: 'pph-ui pph-panel', role: 'dialog', 'aria-label': 'PortalPlus-Helfer' },
      h('div', { class: 'pph-head' }, h('strong', null, 'PortalPlus-Helfer'), h('span', { class: 'pph-muted' }, 'v' + VERSION),
        h('button', { type: 'button', class: 'pph-icon pph-x', title: 'Schließen', onclick: closePanel }, '✕')),
      h('label', { class: 'pph-check' }, box, '„Heute“-Buttons an Datumsfeldern'),
      h('div', { class: 'pph-sub' }, 'Verknüpfte Felder'),
      list,
      h('div', { class: 'pph-actions' },
        h('button', { type: 'button', class: 'pph-btn pph-primary', onclick: startPick }, '+ Felder verknüpfen'),
        h('button', { type: 'button', class: 'pph-btn', title: 'Verknüpfungen als Code kopieren, z. B. für den Schul-PC', onclick: exportLinks }, 'Export'),
        h('button', { type: 'button', class: 'pph-btn', title: 'Code von einem anderen PC einfügen', onclick: importLinks }, 'Import')),
      h('p', { class: 'pph-muted pph-legend' }, h('i', { class: 'pph-sw' }), 'wird automatisch übernommen', h('br'),
        h('i', { class: 'pph-sw pph-sw-amber' }), 'eigener Wert, bleibt so – Zielfeld leeren = wieder koppeln'));
    document.body.append(panel);
  }
  function exportLinks() {
    if (!cfg.links.length) return toast('Es gibt noch keine Verknüpfungen.');
    const bytes = new TextEncoder().encode(JSON.stringify(cfg.links));
    const code = 'PPH1.' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    const show = () => prompt('Diesen Code kopieren und am anderen PC im Helfer unter »Import« einfügen:', code);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(() => toast('Code kopiert – am anderen PC im Helfer unter »Import« einfügen.'), show);
    } else show();
  }
  function importLinks() {
    const code = (prompt('Export-Code einfügen:') || '').trim();
    if (!code) return;
    let added = 0;
    try {
      if (!code.startsWith('PPH1.')) throw new Error('kein Helfer-Code');
      const links = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.slice(5)), c => c.charCodeAt(0))));
      for (const l of links) if (validLink(l) && !hasLink(l)) { cfg.links.push(copyLink(l)); added++; }
    } catch (e) { return toast('Dieser Code ist ungültig.'); }
    saveConfig();
    refreshMarks();
    openPanel();
    toast(added ? `${added} Verknüpfung(en) übernommen.` : 'Keine neuen Verknüpfungen im Code.');
  }

  // ---------- Hinweise ----------
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
    el.replaceChildren(h('span', null, ...parts), h('button', { type: 'button', class: 'pph-btn', onclick: stopPick }, 'Abbrechen'));
  }
  function flash(el) {
    if (el.classList.contains('pph-flash')) return;
    el.classList.add('pph-flash');
    setTimeout(() => el.classList.remove('pph-flash'), 800);
  }

  // Start ganz am Ende, damit beide Teile vollständig geladen sind
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
