// PortalPlus Helper, part 1: field detection, copying between linked fields, “Today” buttons, start-up.
// scripts/build.mjs combines this file with ui.js and helper.css into one script (→ dist/).
  if (window.__ppHelfer) { window.__ppHelfer.togglePanel(); return; }

  const VERSION = '1.1';
  const STORE_KEY = 'ppHelfer.v1'; // name kept from 1.0 so saved links survive updates
  const CSS = '@CSS@';
  const FIELD_SEL = 'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox])' +
    ':not([type=radio]):not([type=file]):not([type=image]):not([type=password]):not([type=range]):not([type=color]),textarea,select';
  window.__ppHelfer = { version: VERSION, togglePanel };

  const cfg = loadConfig();
  const lastWritten = new WeakMap(); // target field → value the helper last wrote into it
  const lastSeen = new WeakMap();    // source field → last known value
  const buttons = new Map();         // date field → its “Today” button
  const origStyle = new WeakMap();
  const kindCache = new WeakMap();
  const tries = new WeakMap();
  const marked = new Set();
  let index = null, panel = null, pick = null, depth = 0;
  let scanTimer = 0, marksTimer = 0, toastTimer = 0;

  // ---------- Settings ----------
  function loadConfig() {
    const base = { dateButtons: true, links: [] };
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s.dateButtons === 'boolean') base.dateButtons = s.dateButtons;
      if (s && Array.isArray(s.links)) base.links = s.links.filter(validLink).map(copyLink);
    } catch (e) { /* storage blocked or corrupt → defaults */ }
    return base;
  }
  function saveConfig() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { toast('Saving failed – the browser blocks storage.'); }
  }
  function validRef(r) {
    return !!r && typeof r.scope === 'string' && typeof r.own === 'string' && Number.isInteger(r.idx) && r.idx >= 0 && typeof r.label === 'string';
  }
  function validLink(l) { return !!l && validRef(l.from) && validRef(l.to); }
  function copyRef(r) { return { scope: r.scope, own: r.own, idx: r.idx, label: r.label.slice(0, 80) }; }
  function copyLink(l) { return { from: copyRef(l.from), to: copyRef(l.to) }; }
  function sameRef(a, b) { return a.scope === b.scope && a.own === b.own && a.idx === b.idx; }
  function hasLink(l) { return cfg.links.some(x => sameRef(x.from, l.from) && sameRef(x.to, l.to)); }

  // ---------- Small utilities ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function clean(s) { return (s || '').replace(/\s+/g, ' ').replace(/[\s:*]+$/, '').trim(); }
  function words(s) { return (s || '').replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2').replace(/[_\-[\].]+/g, ' '); }
  function stableId(id) { return !!id && !/\d{3,}/.test(id) && !/^ui-id-/.test(id); }
  function isField(el) { return el instanceof HTMLElement && el.matches(FIELD_SEL) && !el.closest('.pph-ui'); }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function origTitle(el) { return el.hasAttribute('data-pph-title') ? el.getAttribute('data-pph-title') : el.getAttribute('title'); }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids.filter(k => k != null));
    return el;
  }
  function textOf(node) {
    const c = node.cloneNode(true);
    c.querySelectorAll('.pph-ui, input, select, textarea, button, script, style').forEach(n => n.remove());
    return clean(c.textContent);
  }

  // ---------- Field labels & date detection ----------
  function labelOf(el, strict) {
    if (el.labels && el.labels.length) { const t = textOf(el.labels[0]); if (t) return t; }
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    let node = el;
    for (let i = 0; i < 4; i++) {        // nearest surrounding element that contains only this one field
      node = node.parentElement;
      if (!node || node === document.body || node.querySelectorAll(FIELD_SEL).length > 1) break;
      const t = textOf(node.querySelector('label, .col-form-label, .form-label, legend') || node);
      if (t.length <= 60 && /[a-zäöüß]{2}/i.test(t)) return t;
    }
    const cell = el.closest('td');
    if (cell) {                          // tables: column header, otherwise the cell to the left
      const table = cell.closest('table');
      const row = table && table.tHead && table.tHead.rows[0];
      const th = row && row.cells[cell.cellIndex];
      if (th && textOf(th)) return textOf(th);
      const prev = cell.previousElementSibling;
      if (prev && !prev.querySelector(FIELD_SEL) && textOf(prev)) return textOf(prev);
    }
    if (strict) return '';
    const id = el.getAttribute('id');
    return clean(el.getAttribute('placeholder') || origTitle(el) || el.getAttribute('name') || (stableId(id) ? id : '')) || 'Field';
  }
  function dateKind(el) {
    if (el.tagName !== 'INPUT' || el.disabled) return null;
    const type = el.type;
    if (type === 'date' || type === 'month') return 'date';
    if (type === 'datetime-local') return 'datetime';
    if (type === 'time') return 'time';
    if (type !== 'text' && type !== 'search') return null;
    const picker = el.classList.contains('hasDatepicker');
    if (el.readOnly && !picker) return null;
    const hay = words([el.getAttribute('name'), el.getAttribute('id'), el.className, labelOf(el, true)].join(' '));
    const ph = el.getAttribute('placeholder') || '';
    // The portal is German: “Datum” = date, “Termin” = appointment/deadline, “Uhrzeit” = time of day, “TT.MM.” = DD.MM.
    const isDate = picker || /datum|\bdate\b|datepicker|termin(?!al)/i.test(hay) || /(tt|dd)\.mm\./i.test(ph) ||
      /^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{4}-\d{2}-\d{2}$/.test(el.value.trim());
    const isTime = /uhrzeit|\btime\b/i.test(hay) || /^hh:mm$/i.test(ph);
    return isDate && isTime ? 'datetime' : isDate ? 'date' : isTime ? 'time' : null;
  }
  function kindOf(el) {
    const sig = [el.className, el.type, el.readOnly, el.disabled, /^\d/.test(el.value)].join('|');
    const c = kindCache.get(el);
    if (c && c.sig === sig) return c.kind;
    const kind = dateKind(el);
    kindCache.set(el, { sig, kind });
    return kind;
  }

  // ---------- Filling in “today” ----------
  function nowValue(el, kind) {
    const d = new Date();
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (el.type === 'date') return iso;
    if (el.type === 'month') return iso.slice(0, 7);
    if (el.type === 'datetime-local') return iso + 'T' + time;
    if (el.type === 'time' || kind === 'time') return time;
    const hint = (el.value || el.getAttribute('placeholder') || '').trim();
    let date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; // German default: DD.MM.YYYY
    if (/^(\d{4}|jjjj|yyyy)-/i.test(hint)) date = iso;
    else if (/^(\d{1,2}|tt|dd)\.(\d{1,2}|mm)\.(\d{2}|jj|yy)(\s|$)/i.test(hint)) date = date.slice(0, 6) + date.slice(8);
    return kind === 'datetime' ? date + ' ' + time : date;
  }
  function setValue(el, v, commit) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    fire(el, 'input');
    if (commit) fire(el, 'change');
  }
  function fillNow(el, kind) {
    const $ = window.jQuery;
    if (kind === 'date' && $ && $.datepicker && el.classList.contains('hasDatepicker')) {
      try {
        $(el).datepicker('setDate', new Date()); // use the page's own date format
        fire(el, 'input');
        $.datepicker._selectDate(el);            // like a click in the calendar: runs the page's onSelect or change
        flash(el);
        return;
      } catch (e) { /* fall back to the normal way below */ }
    }
    setValue(el, nowValue(el, kind), true);
    flash(el);
  }

  // ---------- Copying between linked fields ----------
  function isBlank(t) {
    if (t.tagName !== 'SELECT') return t.value === '';
    const o = t.options[t.selectedIndex];
    // “bitte wählen” = German “please choose” placeholder option
    return !o || o.value === '' || (t.selectedIndex === 0 && /bitte|w[äa]hlen|^[\s\-–]*$/i.test(o.text));
  }
  function optionFor(sel, value, text) {
    const opts = [...sel.options];
    const o = opts.find(x => x.value === value) || opts.find(x => clean(x.text) === clean(text));
    return o ? o.value : null;
  }
  function convert(src, t, raw) {
    if (src.tagName === 'SELECT') {
      const o = [...src.options].find(x => x.value === raw);
      const text = o && o.value !== '' && !/bitte|w[äa]hlen/i.test(o.text) ? clean(o.text) : '';
      return t.tagName === 'SELECT' ? optionFor(t, raw, text) : text;
    }
    if (t.tagName === 'SELECT') return optionFor(t, raw, raw);
    let v = raw, m;
    if (t.type === 'date' && (m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/))) v = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    else if (src.type === 'date' && t.type !== 'date' && (m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) v = `${m[3]}.${m[2]}.${m[1]}`;
    else if (t.type === 'number' && /^-?[\d.]*,\d+$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); // 1.234,50 → 1234.50
    return t.maxLength > 0 ? v.slice(0, t.maxLength) : v;
  }
  function targetsOf(src) {
    const out = [];
    for (const l of cfg.links) {
      if (resolve(l.from) !== src) continue;
      const t = resolve(l.to);
      if (t && t !== src && !out.includes(t)) out.push(t);
    }
    return out;
  }
  function propagate(src, commit) {
    const prev = lastSeen.get(src);
    lastSeen.set(src, src.value);
    if (depth > 3 || !cfg.links.length) return;
    const targets = targetsOf(src);
    if (!targets.length) return;
    depth++;
    try {
      for (const t of targets) {
        const v = convert(src, t, src.value);
        if (v === null) continue;
        const cur = t.value;
        const was = lastWritten.has(t) ? lastWritten.get(t) : prev === undefined ? undefined : convert(src, t, prev);
        if (cur === v) { lastWritten.set(t, cur); if (commit) fire(t, 'change'); continue; }
        if (!isBlank(t) && cur !== was) continue; // target has its own value → don't overwrite it
        setValue(t, v, commit);
        lastWritten.set(t, t.value);
        flash(t);
      }
    } finally { depth--; }
    scheduleMarks();
  }
  function poll() {                      // catches changes that fire no event (e.g. a date picker with its own onSelect)
    for (const l of cfg.links) {
      const s = resolve(l.from);
      if (!s) continue;
      if (!lastSeen.has(s)) lastSeen.set(s, s.value);
      else if (lastSeen.get(s) !== s.value) propagate(s, true);
    }
  }
  function resync(s, t) {
    const v = convert(s, t, s.value);
    if (v === null) return toast('The value doesn’t fit the target field.');
    setValue(t, v, true);
    lastWritten.set(t, t.value);
    flash(t);
    refreshMarks();
  }
  function onEvent(e) {
    const el = e.target;
    if (!isField(el)) return;
    if (e.type === 'focusin') { if (!lastSeen.has(el)) lastSeen.set(el, el.value); return; }
    propagate(el, e.type === 'change');
    if (marked.has(el)) scheduleMarks();
  }

  // ---------- Finding fields again (also after the portal has reloaded a form) ----------
  function fieldKey(el) {
    const name = el.getAttribute('name'), id = el.getAttribute('id');
    const own = el.tagName.toLowerCase() + '|' + (name ? 'n:' + name : stableId(id) ? 'i:' + id : 'l:' + labelOf(el));
    let scope = '';
    const form = el.form, fid = form && form.getAttribute('id');
    if (form && (stableId(fid) || form.getAttribute('name'))) scope = 'f:' + (stableId(fid) ? fid : form.getAttribute('name'));
    else for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (stableId(n.getAttribute('id'))) { scope = 'c:' + n.getAttribute('id'); break; }
    }
    return { scope, own };
  }
  function getIndex() {
    if (index) return index;
    index = new Map();
    for (const el of document.querySelectorAll(FIELD_SEL)) {
      if (el.closest('.pph-ui')) continue;
      const k = fieldKey(el), key = k.scope + '#' + k.own;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(el);
    }
    return index;
  }
  function refOf(el) {
    index = null;
    const k = fieldKey(el);
    const list = getIndex().get(k.scope + '#' + k.own) || [];
    return { scope: k.scope, own: k.own, idx: Math.max(0, list.indexOf(el)), label: labelOf(el) };
  }
  function resolve(ref) {
    let el = (getIndex().get(ref.scope + '#' + ref.own) || [])[ref.idx];
    if (el && !el.isConnected) { index = null; el = (getIndex().get(ref.scope + '#' + ref.own) || [])[ref.idx]; }
    return el || null;
  }

  // ---------- Marking target fields ----------
  function scheduleMarks() { clearTimeout(marksTimer); marksTimer = setTimeout(refreshMarks, 60); }
  function refreshMarks() {
    const state = new Map();
    for (const l of cfg.links) {
      const s = resolve(l.from), t = resolve(l.to);
      if (!s || !t || s === t) continue;
      const v = convert(s, t, s.value);
      const ok = isBlank(t) || t.value === v || t.value === lastWritten.get(t);
      const before = state.get(t);
      state.set(t, { ok: ok && (!before || before.ok), from: l.from.label });
    }
    for (const el of marked) if (!state.has(el)) unmark(el);
    for (const [t, st] of state) {
      if (!t.hasAttribute('data-pph-title')) t.setAttribute('data-pph-title', t.getAttribute('title') || '');
      t.classList.toggle('pph-linked', st.ok);
      t.classList.toggle('pph-detached', !st.ok);
      t.setAttribute('title', st.ok
        ? `Copied automatically from “${st.from}”.`
        : `Has its own value and is no longer overwritten from “${st.from}”. Clear the field to re-link it.`);
      marked.add(t);
    }
  }
  function unmark(el) {
    el.classList.remove('pph-linked', 'pph-detached');
    const orig = el.getAttribute('data-pph-title');
    if (orig) el.setAttribute('title', orig); else el.removeAttribute('title');
    el.removeAttribute('data-pph-title');
    marked.delete(el);
  }

  // ---------- “Today” buttons ----------
  function decorate(el, kind) {
    const inGroup = el.parentElement.classList.contains('input-group');
    const compact = !inGroup && el.offsetWidth < 150;
    const text = compact ? (kind === 'date' ? '📅' : '🕒') : kind === 'date' ? 'Today' : 'Now';
    const b = h('span', {
      class: 'pph-ui ' + (inGroup ? 'pph-today-group btn btn-outline-secondary' : 'pph-today' + (compact ? ' pph-compact' : '')),
      role: 'button',
      title: kind === 'time' ? 'Insert the current time' : kind === 'datetime' ? 'Insert the current date and time' : 'Insert today’s date',
      onmousedown: e => e.preventDefault(),
      onclick: e => { e.preventDefault(); e.stopPropagation(); fillNow(el, kind); },
    }, text);
    if (!inGroup) {
      if (getComputedStyle(el).display === 'block') { // make the field a little narrower so the button fits next to it
        origStyle.set(el, [el.style.display, el.style.width, el.style.verticalAlign]);
        const fills = el.offsetWidth >= contentWidth(el.parentElement) - 2;
        el.style.display = 'inline-block';
        el.style.verticalAlign = 'middle';
        if (fills) el.style.width = compact ? 'calc(100% - 2.25rem)' : 'calc(100% - 3.75rem)';
      }
      b.style.height = el.offsetHeight + 'px';
    }
    el.after(b);
    buttons.set(el, b);
  }
  function contentWidth(p) {
    const cs = getComputedStyle(p);
    return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  function undecorate(el) {
    const b = buttons.get(el);
    if (b) b.remove();
    buttons.delete(el);
    const s = origStyle.get(el);
    if (s) { [el.style.display, el.style.width, el.style.verticalAlign] = s; origStyle.delete(el); }
  }
  function scheduleScan() { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 120); }
  function scan() {
    for (const [el, b] of buttons) {
      if (!cfg.dateButtons || !el.isConnected) undecorate(el);
      else if (!b.isConnected) { undecorate(el); tries.set(el, (tries.get(el) || 0) + 1); } // the portal removed the button
    }
    const live = new Set(buttons.values());
    document.querySelectorAll('.pph-today, .pph-today-group').forEach(b => live.has(b) || b.remove()); // e.g. rows the portal copied
    document.querySelectorAll('.pph-linked, .pph-detached').forEach(el => marked.has(el) || unmark(el));
    if (cfg.dateButtons) {
      for (const el of document.querySelectorAll('input')) {
        if (buttons.has(el) || (tries.get(el) || 0) > 3 || !el.parentElement || el.closest('.pph-ui') || !el.getClientRects().length) continue;
        const kind = kindOf(el);
        if (kind) decorate(el, kind);
      }
    }
    refreshMarks();
  }

  // ---------- Start-up ----------
  function init() {
    document.head.append(h('style', { id: 'pph-style' }, CSS));
    document.body.append(h('button', { type: 'button', class: 'pph-ui pph-fab', title: 'PortalPlus Helper', onclick: togglePanel }, 'Helper'));
    for (const type of ['input', 'change', 'focusin']) document.addEventListener(type, onEvent, true);
    // Events fired with jQuery’s .trigger() (e.g. by the date picker) never reach addEventListener
    if (window.jQuery) window.jQuery(document).on('input.pph change.pph', e => { if (e.isTrigger) onEvent(e); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !pick) closePanel(); });
    new MutationObserver(() => { index = null; scheduleScan(); }).observe(document.body, { childList: true, subtree: true });
    setInterval(poll, 500);
    setInterval(scan, 2000);
    scan();
  }
