const { createClient } = window.supabase;

/* ================= Konfiguration ================= */
const SUPABASE_URL = 'https://wxpbqenqxnivytmjxcwp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cGJxZW5xeG5pdnl0bWp4Y3dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Mzk4OTEsImV4cCI6MjEwOTAxNTg5MX0.IPokxWwdhWmm98ORYdopQX-swF9I62XzTyC5gXvn5X4';
const LOGIN_DOMAIN = 'mitglied.sp-forum.invalid';
const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 20;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const state = {
  session: null,
  me: null,          // eigenes Profil
  ranks: [],
  rankById: new Map(),
  prefixes: [],
  prefixById: new Map(),
  settings: { site_name: 'Forum', site_tagline: '' },
  unread: 0,
  online: [],
  notifChannel: null,
  presence: null,
};

/* ================= Helfer ================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = () => document.getElementById('app');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
  if (diff < 86400 && new Date().getDate() === date.getDate()) {
    return 'heute, ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
    date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function fmtDay(d) {
  return d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
}
function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), isErr ? 5000 : 2800);
}
function errMsg(error) {
  const m = error?.message || String(error || 'Unbekannter Fehler');
  if (/row-level security|permission denied|violates row-level/i.test(m)) return 'Dafür fehlt dir die Berechtigung.';
  if (/Invalid login credentials/i.test(m)) return 'Benutzername oder Passwort falsch.';
  if (/foreign key/i.test(m)) return 'Das geht nicht, weil es noch verwendet wird.';
  if (/char_length|check constraint/i.test(m)) return 'Eingabe zu kurz oder zu lang.';
  return m;
}
async function fnError(error) {
  try { const j = await error.context.json(); if (j?.error) return j.error; } catch (_) { /* ignorieren */ }
  return errMsg(error);
}
const icons = {
  bubble: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"></path></svg>',
  lock: '<svg aria-hidden="true" class="lock-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 018 0v4"></path></svg>',
  pin: '<svg aria-hidden="true" class="lock-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5M5 17h14l-2-4V5H7v8z"></path></svg>',
  eye: '<svg aria-hidden="true" class="lock-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  bell: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10 21h4"></path></svg>',
  search: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#97adb1" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>',
  chev: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"></path></svg>',
};
/* Forum-Icons: werden anhand des Forennamens gewählt */
const ICON_PATHS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"></path><path d="M16 8a5 5 0 0 1 0 8"></path><path d="M19 5a9 9 0 0 1 0 14"></path>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M9 14l2 2 4-4"></path>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>',
  gavel: '<path d="M14 13l-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10"></path><path d="M16 16l6-6"></path><path d="M8 8l6-6"></path><path d="M9 7l8 8"></path><path d="M21 11l-8-8"></path>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
  help: '<circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path>',
  bubble: '<path d="M4 5h16v11H8l-4 4z"></path>',
};
function forumIcon(name) {
  const n = String(name || '').toLowerCase();
  const k = /regel/.test(n) ? 'book'
    : /ankünd|ankuend|news|neuigkeit|update/.test(n) ? 'megaphone'
    : /bewerb/.test(n) ? 'clipboard'
    : /beschwer/.test(n) ? 'gavel'
    : /entbann|bann|sperr/.test(n) ? 'unlock'
    : /staat|polizei|lspd|lsmd|ems|rettung|fbi|justiz|regierung/.test(n) ? 'shield'
    : /gang|famil|ghetto|crew/.test(n) ? 'users'
    : /privat|firma|unternehm|organisation|business/.test(n) ? 'briefcase'
    : /support|hilfe|frage/.test(n) ? 'help'
    : 'bubble';
  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[k]}</svg>`;
}
function storeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function storeSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) { /* egal */ } }

/* ---- Rechte ---- */
const myRank = () => (state.me ? state.rankById.get(state.me.rank_id) : null);
const myPos = () => (state.me ? (myRank()?.position ?? 0) : 0);
const isBanned = () => !!state.me?.banned;
const isMod = () => !!(state.me && !isBanned() && (myRank()?.can_moderate || myRank()?.can_manage));
const isManager = () => !!(state.me && !isBanned() && myRank()?.can_manage);
const canPost = (f) => !!(state.me && !isBanned() && f.view_rank <= myPos() && f.post_rank <= myPos());

/* ---- Darstellung ---- */
function rankOf(p) { return p ? state.rankById.get(p.rank_id) : null; }
function nameHtml(p, link = true) {
  if (!p) return '<span class="muted">Gelöschtes Mitglied</span>';
  const r = rankOf(p);
  const inner = `<span class="uname" style="color:${esc(r?.color || '#eef6f7')}">${esc(p.username)}</span>`;
  return link ? `<a href="#/u/${encodeURIComponent(p.username)}">${inner}</a>` : inner;
}
function rankBadge(p) {
  const r = rankOf(p);
  return r ? `<span class="rank-badge" style="color:${esc(r.color)}">${esc(r.name)}</span>` : '';
}
function avatar(p, size = 36) {
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (p?.avatar_url) return `<img class="avatar" src="${esc(p.avatar_url)}" alt="" style="${st}">`;
  const letter = p?.username ? p.username[0].toUpperCase() : '?';
  return `<span class="avatar" style="${st}" aria-hidden="true">${esc(letter)}</span>`;
}
function prefixHtml(id, lg = false) {
  const p = state.prefixById.get(id);
  if (!p) return '';
  return `<span class="prefix${lg ? ' lg' : ''}" style="background:${esc(p.bg)};color:${esc(p.fg)}">${esc(p.name)}</span>`;
}
const SIZES = { 1: 'Klein', 2: 'Normal', 3: 'Groß', 4: 'Sehr groß', 5: 'Riesig' };
const COLORS = ['#ff5c5c', '#ff9a3c', '#f5a524', '#ffe066', '#6fe0a6', '#5fb8ff', '#b28cff', '#ff7ac6', '#ffffff', '#8b95a5'];
function renderBody(src) {
  let html = esc(src);
  // Link-Ziele erst sicher parken, damit die automatische Link-Erkennung sie nicht doppelt umbaut
  const hrefs = [];
  const park = (url) => { hrefs.push(url); return `\u0001${hrefs.length - 1}\u0001`; };
  const okUrl = (u) => /^https?:\/\/[^\s<>"\u0001]+$/i.test(u);
  html = html.replace(/\[url=([^\]\n]{1,500})\]([\s\S]{0,500}?)\[\/url\]/gi, (m, u, txt) =>
    okUrl(u) ? `<a href="${park(u)}" target="_blank" rel="noopener noreferrer">${txt || park(u)}</a>` : m);
  html = html.replace(/\[url\]([^\[\n]{1,500})\[\/url\]/gi, (m, u) =>
    okUrl(u) ? `<a href="${park(u)}" target="_blank" rel="noopener noreferrer">${park(u)}</a>` : m);
  // Markdown-Kurzformen (auch für Formular-Überschriften)
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  // automatische Links für freistehende Adressen
  html = html.split(/(<a [^>]*>[\s\S]*?<\/a>)/).map((part, i) => (i % 2 ? part
    : part.replace(/(https?:\/\/[^\s<"\[\]\u0001]+)/g, (u) => `<a href="${park(u)}" target="_blank" rel="noopener noreferrer">${park(u)}</a>`))).join('');
  // BBCode, mehrfach für Verschachtelung
  for (let i = 0; i < 4; i++) {
    html = html
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
      .replace(/\[size=([1-5])\]([\s\S]*?)\[\/size\]/gi, '<span class="fs-$1">$2</span>')
      .replace(/\[color=(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
      .replace(/\[center\]\n?([\s\S]*?)\n?\[\/center\]/gi, '<span class="al-center">$1</span>')
      .replace(/\[quote=([^\]\n]{1,40})\]\n?([\s\S]*?)\n?\[\/quote\]\n?/g, (_, who, txt) => `<blockquote><cite>${who} schrieb:</cite>${txt}</blockquote>`);
  }
  html = html.replace(/\u0001(\d+)\u0001/g, (_, n) => hrefs[Number(n)]);
  return html.split(/\n{2,}/).map((para) => `<div class="para">${para.replace(/\n/g, '<br>')}</div>`).join('');
}

/* ---- Editor mit Formatierungsleiste ---- */
document.addEventListener('click', (e) => {
  $$('[data-ed-palette]').forEach((pal) => { if (!pal.parentElement.contains(e.target)) pal.classList.add('hidden'); });
});
const EDITOR_HINT = 'Text markieren und oben formatieren. Links werden auch automatisch erkannt.';
function editorBar(id) {
  return `<div class="ed-bar" role="toolbar" aria-label="Formatierung" data-ed="${id}">
    <button type="button" class="ed-btn" data-ed-wrap="b" title="Fett" aria-label="Fett"><b>B</b></button>
    <button type="button" class="ed-btn" data-ed-wrap="i" title="Kursiv" aria-label="Kursiv"><i>I</i></button>
    <button type="button" class="ed-btn" data-ed-wrap="u" title="Unterstrichen" aria-label="Unterstrichen"><u>U</u></button>
    <button type="button" class="ed-btn" data-ed-wrap="s" title="Durchgestrichen" aria-label="Durchgestrichen"><s>S</s></button>
    <span class="ed-sep" aria-hidden="true"></span>
    <select class="ed-select" data-ed-size aria-label="Schriftgröße">
      <option value="">Größe</option>
      ${Object.entries(SIZES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
    </select>
    <span class="ed-color-wrap">
      <button type="button" class="ed-btn" data-ed-colors title="Schriftfarbe" aria-label="Schriftfarbe" aria-haspopup="true">
        <span class="ed-color-a">A</span><span class="ed-color-line" data-ed-last-color></span>
      </button>
      <span class="ed-palette hidden" data-ed-palette>
        ${COLORS.map((c) => `<button type="button" class="ed-swatch" style="background:${c}" data-ed-color="${c}" aria-label="Farbe ${c}"></button>`).join('')}
        <label class="ed-custom" title="Eigene Farbe"><input type="color" data-ed-custom value="#2ee6d6" aria-label="Eigene Farbe"></label>
      </span>
    </span>
    <span class="ed-sep" aria-hidden="true"></span>
    <button type="button" class="ed-btn" data-ed-link title="Link einfügen" aria-label="Link einfügen">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"></path></svg>
    </button>
    <button type="button" class="ed-btn" data-ed-wrap="center" title="Zentrieren" aria-label="Zentrieren">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M5 18h14"></path></svg>
    </button>
    <span class="ed-spacer"></span>
    <button type="button" class="ed-btn ed-preview-btn" data-ed-preview aria-pressed="false">Vorschau</button>
  </div>`;
}
function editorHtml(id, attrs = '', value = '') {
  return `<div class="ed">${editorBar(id)}<textarea id="${id}" class="ed-text" ${attrs}>${esc(value)}</textarea><div class="ed-prev post-body hidden" data-ed-prev="${id}"></div></div>`;
}
function wrapSel(ta, open, close, placeholder = '') {
  const s0 = ta.selectionStart, s1 = ta.selectionEnd;
  const sel = ta.value.slice(s0, s1) || placeholder;
  ta.value = ta.value.slice(0, s0) + open + sel + close + ta.value.slice(s1);
  ta.focus();
  ta.selectionStart = s0 + open.length;
  ta.selectionEnd = s0 + open.length + sel.length;
  ta.dispatchEvent(new Event('input'));
}
function bindEditors(root = document) {
  $$('.ed-bar', root).forEach((bar) => {
    if (bar.dataset.bound) return;
    bar.dataset.bound = '1';
    const ta = document.getElementById(bar.dataset.ed);
    const prev = $(`[data-ed-prev="${bar.dataset.ed}"]`, bar.parentElement);
    $$('[data-ed-wrap]', bar).forEach((b) => b.onclick = () => wrapSel(ta, `[${b.dataset.edWrap}]`, `[/${b.dataset.edWrap}]`));
    const size = $('[data-ed-size]', bar);
    size.onchange = () => { if (size.value) wrapSel(ta, `[size=${size.value}]`, '[/size]'); size.value = ''; };
    const pal = $('[data-ed-palette]', bar);
    const line = $('[data-ed-last-color]', bar);
    const applyColor = (c) => { wrapSel(ta, `[color=${c}]`, '[/color]'); line.style.background = c; pal.classList.add('hidden'); };
    $('[data-ed-colors]', bar).onclick = (e) => { e.stopPropagation(); pal.classList.toggle('hidden'); };
    $$('[data-ed-color]', bar).forEach((b) => b.onclick = () => applyColor(b.dataset.edColor));
    const custom = $('[data-ed-custom]', bar);
    custom.onchange = () => applyColor(custom.value);
    $('[data-ed-link]', bar).onclick = () => {
      const s0 = ta.selectionStart, s1 = ta.selectionEnd;
      const selected = ta.value.slice(s0, s1);
      openModal({
        title: 'Link einfügen',
        confirmText: 'Einfügen',
        body: `<div class="field"><label for="lk-text">Angezeigter Text</label><input id="lk-text" maxlength="200" value="${esc(selected)}" placeholder="z. B. Unser Regelwerk"></div>
          <div class="field"><label for="lk-url">Adresse</label><input id="lk-url" maxlength="500" placeholder="https://…"><span class="hint">Muss mit http:// oder https:// beginnen.</span></div>`,
        onConfirm: (m) => {
          let url = $('#lk-url', m).value.trim();
          if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
          if (!/^https?:\/\/[^\s<>"\]\[]+$/i.test(url)) { toast('Bitte eine gültige Adresse eingeben.', true); return false; }
          const text = $('#lk-text', m).value.trim().replace(/\[\/?url[^\]]*\]/gi, '');
          const insert = text ? `[url=${url}]${text}[/url]` : `[url]${url}[/url]`;
          ta.value = ta.value.slice(0, s0) + insert + ta.value.slice(s1);
          ta.focus();
          ta.selectionStart = ta.selectionEnd = s0 + insert.length;
        },
      });
    };
    const pbtn = $('[data-ed-preview]', bar);
    pbtn.onclick = () => {
      const on = prev.classList.contains('hidden');
      if (on) prev.innerHTML = ta.value.trim() ? renderBody(ta.value) : '<span class="muted">Noch nichts geschrieben.</span>';
      prev.classList.toggle('hidden', !on);
      ta.classList.toggle('hidden', on);
      pbtn.setAttribute('aria-pressed', String(on));
      pbtn.textContent = on ? 'Bearbeiten' : 'Vorschau';
      $$('.ed-btn:not([data-ed-preview]), .ed-select', bar).forEach((x) => { x.disabled = on; });
    };
    ta.addEventListener('invalid', () => { if (ta.classList.contains('hidden')) pbtn.click(); });
    ta.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); wrapSel(ta, `[${k}]`, `[/${k}]`); }
    });
  });
}
function stripQuotes(s) { return s.replace(/\[quote=[^\]]*\][\s\S]*?\[\/quote\]\n?/g, '').trim(); }

function pager(base, page, total, per) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return '';
  let out = '<nav class="pager" aria-label="Seiten">';
  for (let i = 1; i <= pages; i++) {
    if (pages > 9 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) {
      if (i === 3 || i === pages - 2) out += '<span class="muted">…</span>';
      continue;
    }
    out += i === page ? `<span class="cur" aria-current="page">${i}</span>` : `<a href="${base}/${i}">${i}</a>`;
  }
  return out + '</nav>';
}

/* ---- Modal ---- */
function openModal({ title, body, confirmText = 'Speichern', danger = false, onConfirm, cancelText = 'Abbrechen' }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-bg">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 class="box-head" id="modal-title">${esc(title)}</h2>
        <div class="box-body">${body}</div>
        <div class="modal-foot">
          <button type="button" class="btn" data-x="cancel">${esc(cancelText)}</button>
          ${onConfirm ? `<button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-x="ok">${esc(confirmText)}</button>` : ''}
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  const bg = $('.modal-bg', root);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  $('[data-x=cancel]', root).onclick = close;
  const ok = $('[data-x=ok]', root);
  if (ok) {
    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const res = await onConfirm($('.modal', root));
        if (res !== false) close(); else ok.disabled = false;
      } catch (e) { toast(errMsg(e), true); ok.disabled = false; }
    };
  }
  const first = $('input, select, textarea', root);
  if (first) first.focus();
  return { root: $('.modal', root), close };
}
function confirmBox(title, text, confirmText = 'Löschen') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, body: `<p style="margin:0">${esc(text)}</p>`, confirmText, danger: true,
      onConfirm: () => { done = true; resolve(true); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.root)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe($('#modal-root'), { childList: true });
  });
}

/* ================= Daten laden ================= */
async function loadBase() {
  const [r, p, s] = await Promise.all([
    sb.from('ranks').select('*').order('position', { ascending: false }),
    sb.from('prefixes').select('*').order('position'),
    sb.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  state.ranks = r.data || [];
  state.rankById = new Map(state.ranks.map((x) => [x.id, x]));
  state.prefixes = p.data || [];
  state.prefixById = new Map(state.prefixes.map((x) => [x.id, x]));
  if (s.data) state.settings = s.data;
  applySettings();
}
function applySettings() {
  const n = state.settings.site_name || 'Forum';
  document.title = n + ' – Forum';
  const words = n.trim().split(/\s+/);
  $('#brand-name').innerHTML = words.length > 1
    ? `${esc(words[0])} <span class="accent">${esc(words.slice(1).join(' '))}</span>`
    : esc(n);
  $('#foot-name').textContent = '© ' + new Date().getFullYear() + ' ' + n;
  const letters = n.replace(/[^A-Za-z0-9ÄÖÜäöü]/g, '').slice(0, 2).toUpperCase() || 'F';
  $('#brand-mark').textContent = letters;
}
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  state.session = session;
  state.me = null;
  if (session) {
    const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    state.me = data;
  }
}
async function loadUnread() {
  if (!state.me) { state.unread = 0; return; }
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', state.me.id).eq('read', false);
  state.unread = count || 0;
  const b = $('#bell-count');
  if (b) { b.textContent = state.unread > 99 ? '99+' : state.unread; b.classList.toggle('hidden', !state.unread); }
}
async function profilesByIds(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const { data } = await sb.from('profiles').select('id, username, avatar_url, rank_id').in('id', uniq);
  return new Map((data || []).map((p) => [p.id, p]));
}

/* ================= Realtime ================= */
function setupRealtime() {
  if (state.notifChannel) { sb.removeChannel(state.notifChannel); state.notifChannel = null; }
  if (state.me) {
    state.notifChannel = sb.channel('notif-' + state.me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.me.id}` }, () => {
        loadUnread();
        toast('Neue Benachrichtigung');
      })
      .subscribe();
  }
  if (state.presence) { sb.removeChannel(state.presence); state.presence = null; }
  const key = state.me ? state.me.id : 'gast-' + Math.random().toString(36).slice(2);
  state.presence = sb.channel('online', { config: { presence: { key } } });
  state.presence
    .on('presence', { event: 'sync' }, () => {
      const st = state.presence.presenceState();
      const ids = [...new Set(Object.values(st).map((a) => a[0]?.id).filter(Boolean))];
      profilesByIds(ids).then((m) => { state.online = [...m.values()]; renderOnline(); });
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && state.me) {
        await state.presence.track({ id: state.me.id });
      }
    });
}
function renderOnline() {
  const el = $('#online-list');
  if (!el) return;
  const list = [...state.online].sort((a, b) => (rankOf(b)?.position || 0) - (rankOf(a)?.position || 0));
  el.innerHTML = list.length
    ? list.map((p) => nameHtml(p)).join('<span class="muted">, </span> ')
    : '<span class="muted">Gerade ist niemand angemeldet online.</span>';
}

/* ================= Kopfzeile ================= */
function renderHeader() {
  const box = $('#userbox');
  $('#nav-admin').classList.toggle('hidden', !isManager());
  const searchHtml = `
    <form class="search" id="search-form" role="search">
      ${icons.search}
      <input name="q" placeholder="Suchen …" aria-label="Themen suchen">
    </form>`;
  if (!state.me) {
    box.innerHTML = `${searchHtml}
      <a class="btn" href="#/login">Anmelden</a>
      <a class="btn primary" href="#/registrieren">Registrieren</a>`;
  } else {
    const r = myRank();
    box.innerHTML = `${searchHtml}
      <button class="iconbtn" id="bell" aria-label="Benachrichtigungen" aria-haspopup="true">
        ${icons.bell}<span class="badge-count ${state.unread ? '' : 'hidden'}" id="bell-count">${state.unread}</span>
      </button>
      <button class="me-link" id="me-btn" aria-haspopup="true">
        ${avatar(state.me, 36)}
        <span class="names"><span class="uname" style="color:${esc(r?.color || '#fff')}">${esc(state.me.username)}</span><span class="small muted">${esc(r?.name || '')}</span></span>
      </button>
      <div class="dropdown hidden" id="dd"></div>`;
    $('#bell').onclick = (e) => { e.stopPropagation(); toggleNotifDropdown(); };
    $('#me-btn').onclick = (e) => { e.stopPropagation(); toggleMeDropdown(); };
  }
  $('#search-form').onsubmit = (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) location.hash = '#/suche/' + encodeURIComponent(q);
  };
}
document.addEventListener('click', (e) => {
  const dd = $('#dd');
  if (dd && !dd.contains(e.target)) dd.classList.add('hidden');
});
function toggleMeDropdown() {
  const dd = $('#dd');
  if (!dd.classList.contains('hidden') && dd.dataset.kind === 'me') { dd.classList.add('hidden'); return; }
  dd.dataset.kind = 'me';
  dd.style.width = '240px';
  dd.innerHTML = `<div class="menu">
      <a href="#/u/${encodeURIComponent(state.me.username)}">Mein Profil</a>
      <a href="#/einstellungen">Einstellungen</a>
      <a href="#/benachrichtigungen">Alle Benachrichtigungen</a>
      ${isManager() ? '<a href="#/admin">Verwaltung</a>' : ''}
      <button type="button" id="logout-btn">Abmelden</button>
    </div>`;
  dd.classList.remove('hidden');
  $('#logout-btn').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; };
  $$('a', dd).forEach((a) => a.addEventListener('click', () => dd.classList.add('hidden')));
}
async function toggleNotifDropdown() {
  const dd = $('#dd');
  if (!dd.classList.contains('hidden') && dd.dataset.kind === 'notif') { dd.classList.add('hidden'); return; }
  dd.dataset.kind = 'notif';
  dd.style.width = '';
  dd.innerHTML = '<div class="loading">Lädt …</div>';
  dd.classList.remove('hidden');
  const { data } = await sb.from('notifications').select('*').eq('user_id', state.me.id).order('created_at', { ascending: false }).limit(10);
  const actors = await profilesByIds((data || []).map((n) => n.actor_id));
  dd.innerHTML = `
    <div class="dd-head"><b style="color:#fff">Benachrichtigungen</b><button type="button" class="btn sm" id="mark-all">Alle gelesen</button></div>
    ${(data || []).length ? data.map((n) => `
      <a class="dd-item ${n.read ? '' : 'unread'}" href="#/t/${n.thread_id}/last" data-id="${n.id}">
        <span>${esc(n.text)}</span>
        <div class="small muted">${n.actor_id ? 'von ' + esc(actors.get(n.actor_id)?.username || '–') + ' · ' : ''}${fmtDate(n.created_at)}</div>
      </a>`).join('') : '<div class="empty">Keine Benachrichtigungen</div>'}
    <div class="menu"><a href="#/benachrichtigungen">Alle anzeigen</a></div>`;
  $('#mark-all').onclick = async (e) => {
    e.stopPropagation();
    await sb.from('notifications').update({ read: true }).eq('user_id', state.me.id).eq('read', false);
    await loadUnread();
    $$('.dd-item.unread', dd).forEach((x) => x.classList.remove('unread'));
  };
  $$('.dd-item', dd).forEach((a) => a.addEventListener('click', async () => {
    dd.classList.add('hidden');
    await sb.from('notifications').update({ read: true }).eq('id', a.dataset.id);
    loadUnread();
  }));
}
function setActiveNav(key) {
  $$('#mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
}

/* ================= Seitenleiste ================= */
function sidebarHtml() {
  const login = state.me ? '' : `
      <section class="box"><form class="box-body side side-login" id="side-login">
        <h2>Anmelden</h2>
        <div class="field"><label for="sl-u">Benutzername</label><input id="sl-u" name="u" required autocomplete="username"></div>
        <div class="field"><label for="sl-p">Passwort</label><input id="sl-p" name="p" type="password" required autocomplete="current-password"></div>
        <button class="btn primary" type="submit">Anmelden</button>
        <p class="small muted" style="margin:12px 0 0;text-align:center">Noch kein Konto? <a href="#/registrieren" style="color:var(--accent);font-weight:600">Jetzt registrieren</a></p>
      </form></section>`;
  return `
    <aside class="side-col">${login}
      <section class="box"><div class="box-body side">
        <h2>Neueste Themen</h2>
        <div id="side-latest" class="loading" style="padding:8px">Lädt …</div>
      </div></section>
      <section class="box"><div class="box-body side">
        <h2>Status-Präfixe</h2>
        <div class="chips">${state.prefixes.map((p) => prefixHtml(p.id, true)).join('')}</div>
      </div></section>
      <section class="box"><div class="box-body side">
        <h2>Mitglieder online</h2>
        <div id="online-list" style="display:flex;flex-wrap:wrap;gap:4px 6px"></div>
        <div class="small muted" style="margin-top:12px">Ränge: ${state.ranks.map((r) => `<span style="color:${esc(r.color)}">${esc(r.name)}</span>`).join(' · ')}</div>
      </div></section>
    </aside>`;
}
async function fillSidebar() {
  renderOnline();
  const lf = $('#side-login');
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault();
    const u = e.target.u.value.trim();
    const btn = $('button', e.target); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: `${u.toLowerCase()}@${LOGIN_DOMAIN}`, password: e.target.p.value });
    btn.disabled = false;
    if (error) return toast(errMsg(error), true);
    toast('Willkommen zurück!');
  };
  const el = $('#side-latest');
  if (!el) return;
  const { data } = await sb.from('threads').select('id, title, prefix_id, last_post_at, last_post_by, forum_id').order('last_post_at', { ascending: false }).limit(6);
  const people = await profilesByIds((data || []).map((t) => t.last_post_by));
  el.classList.remove('loading');
  el.style.padding = '0';
  el.innerHTML = (data || []).length ? `<div style="display:flex;flex-direction:column;gap:14px">${data.map((t) => `
    <div>${prefixHtml(t.prefix_id)}<a href="#/t/${t.id}/last" style="font-weight:600">${esc(t.title)}</a>
      <div class="small muted" style="margin-top:3px">${nameHtml(people.get(t.last_post_by))} · ${fmtDate(t.last_post_at)}</div></div>`).join('')}</div>`
    : '<span class="muted">Noch keine Themen</span>';
}

/* ================= Seiten ================= */
async function pageHome() {
  setActiveNav('home');
  const [cats, forums, stats, last] = await Promise.all([
    sb.from('categories').select('*').order('position'),
    sb.from('forums').select('*').order('position'),
    sb.from('forum_stats').select('*'),
    sb.from('forum_last').select('*'),
  ]);
  const visibleForums = (forums.data || []).filter((f) => f.view_rank <= myPos());
  const statMap = new Map((stats.data || []).map((s) => [s.forum_id, s]));
  const lastMap = new Map((last.data || []).map((s) => [s.forum_id, s]));
  const lastIds = (last.data || []).map((l) => l.thread_id).filter(Boolean);
  const [people, pre] = await Promise.all([
    profilesByIds((last.data || []).map((l) => l.last_post_by)),
    lastIds.length ? sb.from('threads').select('id, prefix_id').in('id', lastIds) : Promise.resolve({ data: [] }),
  ]);
  const prefixOf = new Map((pre.data || []).map((t) => [t.id, t.prefix_id]));
  const closed = new Set((storeGet('closed-cats') || '').split(',').filter(Boolean));
  const name = state.settings.site_name || 'Forum';
  const word = name.trim().split(/\s+/)[0].toUpperCase();

  const sections = (cats.data || []).map((c) => {
    const fs = visibleForums.filter((f) => f.category_id === c.id);
    if (!fs.length) return '';
    const isClosed = closed.has(String(c.id));
    return `<section class="cat ${isClosed ? 'closed' : ''}" data-cat="${c.id}">
      <div class="cat-head">
        <h2>${esc(c.title)}</h2>
        <button type="button" class="cat-toggle" data-cat-toggle="${c.id}" aria-controls="cat-body-${c.id}" aria-expanded="${isClosed ? 'false' : 'true'}" aria-label="${esc(c.title)} ein- oder ausklappen">${icons.chev}</button>
      </div>
      <div class="box cat-body" id="cat-body-${c.id}">
      ${fs.map((f) => {
        const s = statMap.get(f.id) || { threads: 0, posts: 0 };
        const l = lastMap.get(f.id);
        const fresh = l && Date.now() - new Date(l.last_post_at).getTime() < 86400000;
        const who = l ? people.get(l.last_post_by) : null;
        return `<div class="node">
          <span class="node-icon ${fresh ? 'has-new' : ''}">${forumIcon(f.name)}</span>
          <div style="min-width:0">
            <a href="#/f/${f.id}" class="node-title">${esc(f.name)}</a>${fresh ? '<span class="new-badge">NEU</span>' : ''}${f.private_rank != null ? `<span title="Themen sind privat" aria-label="private Themen">${icons.eye}</span>` : ''}${f.view_rank > 1 ? `<span title="Nur für bestimmte Ränge sichtbar" aria-label="eingeschränkt">${icons.lock}</span>` : ''}
            ${f.description ? `<div class="node-desc">${esc(f.description)}</div>` : ''}
          </div>
          <div class="node-nums"><div><b>${s.threads}</b><span>Themen</span></div><div><b>${s.posts}</b><span>Beiträge</span></div></div>
          <div class="node-last">${l ? `${avatar(who, 36)}<div class="meta"><div style="display:flex;align-items:center;gap:6px;min-width:0">${prefixHtml(prefixOf.get(l.thread_id))}<a class="t" href="#/t/${l.thread_id}/last">${esc(l.title)}</a></div><div class="muted">${fmtDate(l.last_post_at)} · ${nameHtml(who)}</div></div>` : '<span class="muted">Noch keine Beiträge</span>'}</div>
        </div>`;
      }).join('')}
      </div>
    </section>`;
  }).join('');

  const heroButtons = state.me
    ? `${!isBanned() ? '<a class="btn primary" href="#/neu">Neues Thema erstellen</a>' : ''}<a class="btn ghost" href="#/neue">Neue Beiträge ansehen</a>`
    : '<a class="btn primary" href="#/registrieren">Jetzt registrieren</a><a class="btn ghost" href="#/login">Anmelden</a>';
  app().innerHTML = `
    <section class="hero">
      <div class="hero-word" aria-hidden="true">${esc(word)}</div>
      <div class="hero-inner">
        <h1>${state.me ? `Willkommen zurück, ${esc(state.me.username)}!` : `Willkommen bei ${esc(name)}!`}</h1>
        <p>${state.me ? (state.settings.site_tagline ? esc(state.settings.site_tagline) : 'Schön, dass du da bist.') : 'Registriere dich, um Themen zu erstellen, Bewerbungen abzugeben und mit der ganzen Community zu schreiben.'}</p>
        <div class="row">${heroButtons}</div>
      </div>
    </section>
    <div class="wrap page">
      <main>
        ${isBanned() ? '<div class="notice err">Dein Konto ist gesperrt. Du kannst lesen, aber nichts schreiben.</div>' : ''}
        <div class="toolbar">
          <div class="links">
            <a href="#/neue">Neue Beiträge</a>
            <button type="button" id="tb-search">Foren durchsuchen</button>
            <a href="#/team">Teamliste</a>
          </div>
          ${state.me && !isBanned() ? '<a class="btn primary" href="#/neu">Neues Thema</a>' : ''}
        </div>
        ${sections || '<div class="box"><div class="empty">Noch keine Bereiche angelegt.</div></div>'}
      </main>
      ${sidebarHtml()}
    </div>`;
  $('#tb-search').onclick = () => { const i = $('#search-form input'); if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); } };
  $$('[data-cat-toggle]').forEach((b) => {
    b.onclick = () => {
      const sec = b.closest('.cat');
      const nowClosed = sec.classList.toggle('closed');
      b.setAttribute('aria-expanded', nowClosed ? 'false' : 'true');
      const id = b.dataset.catToggle;
      if (nowClosed) closed.add(id); else closed.delete(id);
      storeSet('closed-cats', [...closed].join(',') || null);
    };
  });
  fillSidebar();
}
async function pageForum(id, page = 1) {
  setActiveNav('home');
  const { data: f } = await sb.from('forums').select('*, categories(title)').eq('id', id).maybeSingle();
  if (!f || f.view_rank > myPos()) return pageNotFound('Dieses Forum gibt es nicht oder du darfst es nicht sehen.');
  const from = (page - 1) * THREADS_PER_PAGE;
  const filter = sessionStorageGet('prefixFilter-' + id);
  let q = sb.from('threads').select('*', { count: 'exact' }).eq('forum_id', id);
  if (filter) q = q.eq('prefix_id', filter);
  const { data: threads, count } = await q
    .order('pinned', { ascending: false }).order('last_post_at', { ascending: false })
    .range(from, from + THREADS_PER_PAGE - 1);
  const people = await profilesByIds((threads || []).flatMap((t) => [t.author_id, t.last_post_by]));
  const usedPrefixes = state.prefixes;
  app().innerHTML = `
    <div class="wrap page">
      <main>
        <div class="crumbs"><a href="#/">Forum</a><span>›</span><span>${esc(f.categories?.title || '')}</span></div>
        <div class="titlebar">
          <div><h1>${esc(f.name)}</h1><div class="muted">${esc(f.description)}</div></div>
          ${canPost(f) ? `<a class="btn primary" href="#/neu/${f.id}">Neues Thema</a>` : state.me ? '' : '<a class="btn" href="#/login">Zum Schreiben anmelden</a>'}
        </div>
        ${f.private_rank != null ? '<div class="notice info">In diesem Forum sieht jeder nur seine eigenen Themen. Das Team ab dem zuständigen Rang sieht alle.</div>' : ''}
        <div class="chips" aria-label="Nach Status filtern">
          <button type="button" class="prefix lg chip-btn ${filter ? 'off' : ''}" style="background:#22302f;color:#eef6f7" data-pf="">Alle</button>
          ${usedPrefixes.map((p) => `<button type="button" class="prefix lg chip-btn ${filter && filter !== String(p.id) ? 'off' : ''}" style="background:${esc(p.bg)};color:${esc(p.fg)}" data-pf="${p.id}">${esc(p.name)}</button>`).join('')}
        </div>
        <section class="box">
          ${(threads || []).length ? threads.map((t) => `
            <div class="trow ${t.pinned ? 'pinned' : ''}">
              ${avatar(people.get(t.author_id), 36)}
              <div style="min-width:0">
                <div>${prefixHtml(t.prefix_id)}<a class="trow-title" href="#/t/${t.id}">${esc(t.title)}</a>${t.pinned ? icons.pin : ''}${t.locked ? icons.lock : ''}</div>
                <div class="trow-meta">${nameHtml(people.get(t.author_id))} · ${fmtDate(t.created_at)}</div>
              </div>
              <div class="trow-stats"><b>${t.reply_count}</b> Antworten</div>
              <div class="trow-last small muted"><a href="#/t/${t.id}/last">${fmtDate(t.last_post_at)}</a><br>${nameHtml(people.get(t.last_post_by))}</div>
            </div>`).join('') : '<div class="empty">Hier gibt es noch keine Themen.</div>'}
        </section>
        ${pager('#/f/' + id, page, count || 0, THREADS_PER_PAGE)}
      </main>
    </div>`;
  $$('[data-pf]').forEach((b) => b.onclick = () => {
    sessionStorageSet('prefixFilter-' + id, b.dataset.pf);
    pageForum(id, 1);
  });
}
function sessionStorageGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (_) { return ''; } }
function sessionStorageSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (_) { /* egal */ } }

async function pageThread(id, pageArg) {
  setActiveNav('home');
  const { data: t } = await sb.from('threads').select('*, forums(*, categories(title))').eq('id', id).maybeSingle();
  if (!t) return pageNotFound('Dieses Thema gibt es nicht oder du darfst es nicht sehen.');
  const f = t.forums;
  const { count } = await sb.from('posts').select('id', { count: 'exact', head: true }).eq('thread_id', id);
  const pages = Math.max(1, Math.ceil((count || 0) / POSTS_PER_PAGE));
  const page = pageArg === 'last' ? pages : Math.min(Math.max(1, parseInt(pageArg, 10) || 1), pages);
  const from = (page - 1) * POSTS_PER_PAGE;
  const { data: posts } = await sb.from('posts').select('*').eq('thread_id', id).order('created_at').order('id').range(from, from + POSTS_PER_PAGE - 1);
  const { data: firstRows } = await sb.from('posts').select('id').eq('thread_id', id).order('created_at').order('id').limit(1);
  const firstPost = (firstRows || [])[0];
  const ids = [...(posts || []).map((p) => p.author_id), t.author_id];
  const { data: authors } = await sb.from('profiles').select('*').in('id', [...new Set(ids.filter(Boolean))]);
  const people = new Map((authors || []).map((p) => [p.id, p]));
  const mod = isMod();
  const canReply = canPost(f) && (!t.locked || mod);
  let forumsForMove = [];
  if (mod) {
    const { data } = await sb.from('forums').select('id, name').order('category_id').order('position');
    forumsForMove = data || [];
  }
  app().innerHTML = `
    <div class="wrap page full">
      <main>
        <div class="crumbs"><a href="#/">Forum</a><span>›</span><span>${esc(f.categories?.title || '')}</span><span>›</span><a href="#/f/${f.id}">${esc(f.name)}</a></div>
        <div class="titlebar">
          <h1>${prefixHtml(t.prefix_id, true)}${esc(t.title)}${t.pinned ? icons.pin : ''}${t.locked ? icons.lock : ''}</h1>
        </div>
        <div class="small muted">Erstellt von ${nameHtml(people.get(t.author_id))} · ${fmtDate(t.created_at)} · ${t.reply_count} Antworten</div>
        ${pager('#/t/' + id, page, count || 0, POSTS_PER_PAGE)}
        <section class="box">
          ${mod ? `
          <div class="modtools">
            <span class="lbl">Moderation</span>
            <select id="mt-prefix" class="input" aria-label="Status setzen">
              <option value="">Ohne Status</option>
              ${state.prefixes.map((p) => `<option value="${p.id}" ${p.id === t.prefix_id ? 'selected' : ''}>${esc(p.name)}${p.closes ? ' (schließt)' : ''}</option>`).join('')}
            </select>
            <button type="button" class="btn sm" id="mt-lock">${t.locked ? 'Öffnen' : 'Schließen'}</button>
            <button type="button" class="btn sm" id="mt-pin">${t.pinned ? 'Nicht mehr anheften' : 'Anheften'}</button>
            <select id="mt-move" class="input" aria-label="Verschieben nach">
              ${forumsForMove.map((x) => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${x.id === f.id ? 'Verschieben …' : esc(x.name)}</option>`).join('')}
            </select>
            <button type="button" class="btn sm" id="mt-title">Titel ändern</button>
            <button type="button" class="btn sm danger" id="mt-del">Thema löschen</button>
          </div>` : ''}
          ${(posts || []).map((p) => {
            const a = people.get(p.author_id);
            const canEdit = state.me && !isBanned() && (p.author_id === state.me.id || mod);
            const canDel = mod && p.id !== firstPost?.id;
            return `<article class="post" id="p${p.id}">
              <div class="post-author">
                ${avatar(a, 64)}
                <div>${nameHtml(a)}</div>
                <div>${rankBadge(a)}</div>
                ${a ? `<div class="stats">${a.post_count} Beiträge<br>dabei seit ${new Date(a.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}</div>` : ''}
              </div>
              <div class="post-main">
                <div class="post-top"><span>${fmtDate(p.created_at)}${p.edited_at ? ` · bearbeitet ${fmtDate(p.edited_at)}` : ''}</span><a href="#/t/${id}/${page}" class="muted" title="Link zu diesem Beitrag">#${p.id}</a></div>
                <div class="post-body" data-body="${p.id}">${renderBody(p.body)}</div>
                <div class="post-actions">
                  ${canReply ? `<button type="button" class="btn sm" data-quote="${p.id}">Zitieren</button>` : ''}
                  ${canEdit ? `<button type="button" class="btn sm" data-edit="${p.id}">Bearbeiten</button>` : ''}
                  ${canDel ? `<button type="button" class="btn sm danger" data-del="${p.id}">Löschen</button>` : ''}
                </div>
              </div>
            </article>`;
          }).join('')}
        </section>
        ${pager('#/t/' + id, page, count || 0, POSTS_PER_PAGE)}
        ${t.locked ? `<div class="notice warn">Dieses Thema ist geschlossen.${mod ? ' Als Teammitglied kannst du trotzdem antworten.' : ''}</div>` : ''}
        ${canReply ? `
          <section class="box">
            <h2 class="box-head">Antworten</h2>
            <form class="box-body" id="reply-form">
              <div class="field">
                <label for="reply-body">Deine Antwort</label>
                ${editorHtml('reply-body', 'name="body" required maxlength="20000"')}
                <span class="hint">${EDITOR_HINT}</span>
              </div>
              <button class="btn primary" type="submit">Antwort senden</button>
            </form>
          </section>` : !state.me ? '<div class="notice info"><a href="#/login">Melde dich an</a>, um zu antworten.</div>' : ''}
      </main>
    </div>`;

  bindEditors(app());
  const postById = new Map((posts || []).map((p) => [String(p.id), p]));
  $$('[data-quote]').forEach((b) => b.onclick = () => {
    const p = postById.get(b.dataset.quote);
    const ta = $('#reply-body');
    if (ta.classList.contains('hidden')) $('.ed-bar[data-ed="reply-body"] [data-ed-preview]').click();
    const who = people.get(p.author_id)?.username || 'Jemand';
    ta.value += `[quote=${who}]${stripQuotes(p.body)}[/quote]\n`;
    ta.focus();
    ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $$('[data-edit]').forEach((b) => b.onclick = () => {
    const p = postById.get(b.dataset.edit);
    const bodyEl = $(`[data-body="${p.id}"]`);
    bodyEl.innerHTML = `${editorHtml('edit-' + p.id, 'aria-label="Beitrag bearbeiten" style="min-height:180px"', p.body)}
      <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-save>Speichern</button><button type="button" class="btn sm" data-cancel>Abbrechen</button></div>`;
    b.closest('.post-actions').classList.add('hidden');
    bindEditors(bodyEl);
    $('[data-cancel]', bodyEl).onclick = () => route();
    $('[data-save]', bodyEl).onclick = async () => {
      const val = $(`#edit-${p.id}`).value.trim();
      if (!val) return toast('Der Beitrag darf nicht leer sein.', true);
      const { error } = await sb.from('posts').update({ body: val }).eq('id', p.id);
      if (error) return toast(errMsg(error), true);
      toast('Gespeichert');
      route();
    };
  });
  $$('[data-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Beitrag löschen', 'Diesen Beitrag wirklich löschen?'))) return;
    const { error } = await sb.from('posts').delete().eq('id', b.dataset.del);
    if (error) return toast(errMsg(error), true);
    toast('Beitrag gelöscht');
    route();
  });
  const rf = $('#reply-form');
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault();
    const body = rf.body.value.trim();
    if (!body) return;
    const btn = $('button[type=submit]', rf);
    btn.disabled = true;
    const { error } = await sb.from('posts').insert({ thread_id: id, author_id: state.me.id, body });
    btn.disabled = false;
    if (error) return toast(errMsg(error), true);
    await loadMe();
    location.hash = `#/t/${id}/last`;
    if (pageArg === 'last') route();
  };
  if (mod) {
    const upd = async (patch, msg) => {
      const { error } = await sb.from('threads').update(patch).eq('id', id);
      if (error) return toast(errMsg(error), true);
      toast(msg);
      route();
    };
    $('#mt-prefix').onchange = (e) => upd({ prefix_id: e.target.value ? Number(e.target.value) : null }, 'Status geändert');
    $('#mt-lock').onclick = () => upd({ locked: !t.locked }, t.locked ? 'Thema geöffnet' : 'Thema geschlossen');
    $('#mt-pin').onclick = () => upd({ pinned: !t.pinned }, t.pinned ? 'Nicht mehr angeheftet' : 'Angeheftet');
    $('#mt-move').onchange = (e) => { if (Number(e.target.value) !== f.id) upd({ forum_id: Number(e.target.value) }, 'Thema verschoben'); };
    $('#mt-title').onclick = () => openModal({
      title: 'Titel ändern',
      body: `<div class="field"><label for="nt">Neuer Titel</label><input id="nt" maxlength="120" value="${esc(t.title)}"></div>`,
      onConfirm: async (m) => {
        const v = $('#nt', m).value.trim();
        if (v.length < 3) { toast('Mindestens 3 Zeichen', true); return false; }
        await upd({ title: v }, 'Titel geändert');
      },
    });
    $('#mt-del').onclick = async () => {
      if (!(await confirmBox('Thema löschen', 'Das ganze Thema mit allen Beiträgen löschen? Das kann nicht rückgängig gemacht werden.'))) return;
      const { error } = await sb.from('threads').delete().eq('id', id);
      if (error) return toast(errMsg(error), true);
      toast('Thema gelöscht');
      location.hash = '#/f/' + f.id;
    };
  }
}

async function pageNewThread(forumId) {
  setActiveNav('home');
  if (!state.me) return pageLogin('Bitte melde dich zuerst an.');
  if (isBanned()) return pageNotFound('Dein Konto ist gesperrt.');
  if (!forumId) {
    const [cats, forums] = await Promise.all([
      sb.from('categories').select('*').order('position'),
      sb.from('forums').select('*').order('position'),
    ]);
    const list = (cats.data || []).map((c) => {
      const fs = (forums.data || []).filter((f) => f.category_id === c.id && canPost(f));
      if (!fs.length) return '';
      return `<section class="box"><h2 class="box-head">${esc(c.title)}</h2>${fs.map((f) => `
        <div class="node" style="grid-template-columns:44px minmax(0,1fr)"><span class="node-icon">${icons.bubble}</span>
        <div><a class="node-title" href="#/neu/${f.id}">${esc(f.name)}</a><div class="node-desc">${esc(f.description)}</div></div></div>`).join('')}</section>`;
    }).join('');
    app().innerHTML = `<div class="wrap page full"><main><h1 style="margin:0">Wo möchtest du ein Thema erstellen?</h1>${list || '<div class="box"><div class="empty">Du kannst gerade in keinem Forum schreiben.</div></div>'}</main></div>`;
    return;
  }
  const { data: f } = await sb.from('forums').select('*').eq('id', forumId).maybeSingle();
  if (!f || !canPost(f)) return pageNotFound('Hier kannst du kein Thema erstellen.');
  const fields = Array.isArray(f.form_fields) ? f.form_fields : [];
  app().innerHTML = `
    <div class="wrap page full">
      <main>
        <div class="crumbs"><a href="#/">Forum</a><span>›</span><a href="#/f/${f.id}">${esc(f.name)}</a></div>
        <h1 style="margin:0">Neues Thema in „${esc(f.name)}“</h1>
        <form class="box" id="nt-form">
          <div class="box-body">
            <div class="field"><label for="nt-title">Titel <span class="req">*</span></label>
              <input id="nt-title" name="title" required minlength="3" maxlength="120" placeholder="${fields.length ? 'z. B. ' + esc(f.name) + ' – Dein Name' : 'Worum geht es?'}"></div>
            ${isMod() ? `<div class="field"><label for="nt-prefix">Status (nur Team)</label><select id="nt-prefix"><option value="">Standard des Forums</option>${state.prefixes.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
            ${fields.map((fld, i) => `
              <div class="field">
                <label for="ff${i}">${esc(fld.label)} ${fld.required ? '<span class="req">*</span>' : ''}</label>
                ${fld.type === 'textarea'
                  ? editorHtml(`ff${i}`, `data-ff="${i}" ${fld.required ? 'required' : ''} maxlength="4000" style="min-height:110px"`)
                  : `<input id="ff${i}" data-ff="${i}" ${fld.required ? 'required' : ''} maxlength="300">`}
              </div>`).join('')}
            <div class="field">
              <label for="nt-body">${fields.length ? 'Weitere Angaben (optional)' : 'Text <span class="req">*</span>'}</label>
              ${editorHtml('nt-body', `name="body" ${fields.length ? '' : 'required'} maxlength="15000"`)}
              <span class="hint">${EDITOR_HINT}</span>
            </div>
            <div class="row"><button class="btn primary" type="submit">Thema erstellen</button><a class="btn" href="#/f/${f.id}">Abbrechen</a></div>
          </div>
        </form>
      </main>
    </div>`;
  bindEditors(app());
  $('#nt-form').onsubmit = async (e) => {
    e.preventDefault();
    const title = $('#nt-title').value.trim();
    let body = fields.map((fld, i) => {
      const v = $(`[data-ff="${i}"]`).value.trim();
      return v ? `**${fld.label}:**\n${v}` : '';
    }).filter(Boolean).join('\n\n');
    const extra = $('#nt-body').value.trim();
    if (extra) body += (body ? '\n\n' : '') + (fields.length ? '**Weitere Angaben:**\n' : '') + extra;
    if (!body) return toast('Bitte fülle das Formular aus.', true);
    if (body.length > 20000) return toast(`Dein Text ist zu lang (${body.length} von 20.000 Zeichen). Bitte kürzen.`, true);
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    const prefixSel = $('#nt-prefix');
    const { data: tid, error } = await sb.rpc('create_thread', {
      p_forum: f.id, p_title: title, p_body: body, p_prefix: prefixSel && prefixSel.value ? Number(prefixSel.value) : null,
    });
    btn.disabled = false;
    if (error) return toast(errMsg(error), true);
    await loadMe();
    toast('Thema erstellt');
    location.hash = '#/t/' + tid;
  };
}

async function pageNewPosts() {
  setActiveNav('neue');
  const { data } = await sb.from('threads').select('*, forums(name)').order('last_post_at', { ascending: false }).limit(40);
  const people = await profilesByIds((data || []).flatMap((t) => [t.author_id, t.last_post_by]));
  app().innerHTML = `<div class="wrap page full"><main>
    <h1 style="margin:0">Neue Beiträge</h1>
    <section class="box">${threadRows(data, people, true)}</section></main></div>`;
}
function threadRows(data, people, showForum) {
  if (!(data || []).length) return '<div class="empty">Keine Themen gefunden.</div>';
  return data.map((t) => `
    <div class="trow">
      ${avatar(people.get(t.author_id), 36)}
      <div style="min-width:0">
        <div>${prefixHtml(t.prefix_id)}<a class="trow-title" href="#/t/${t.id}/last">${esc(t.title)}</a>${t.locked ? icons.lock : ''}</div>
        <div class="trow-meta">${nameHtml(people.get(t.author_id))}${showForum && t.forums ? ` · in <a href="#/f/${t.forum_id}">${esc(t.forums.name)}</a>` : ''}</div>
      </div>
      <div class="trow-stats"><b>${t.reply_count}</b> Antworten</div>
      <div class="trow-last small muted">${fmtDate(t.last_post_at)}<br>${nameHtml(people.get(t.last_post_by))}</div>
    </div>`).join('');
}
async function pageSearch(q) {
  setActiveNav('');
  const term = q.replace(/[%_\\]/g, (c) => '\\' + c);
  const { data } = await sb.from('threads').select('*, forums(name)').ilike('title', `%${term}%`).order('last_post_at', { ascending: false }).limit(40);
  const people = await profilesByIds((data || []).flatMap((t) => [t.author_id, t.last_post_by]));
  app().innerHTML = `<div class="wrap page full"><main>
    <h1 style="margin:0">Suche: „${esc(q)}“</h1>
    <div class="muted">Durchsucht werden Thementitel.</div>
    <section class="box">${threadRows(data, people, true)}</section></main></div>`;
  const inp = $('#search-form input'); if (inp) inp.value = q;
}

async function pageMembers(page = 1, query = '') {
  setActiveNav('mitglieder');
  const per = 48;
  const from = (page - 1) * per;
  let q = sb.from('profiles').select('*', { count: 'exact' });
  if (query) q = q.ilike('username', `%${query.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
  const { data, count } = await q.order('username').range(from, from + per - 1);
  app().innerHTML = `<div class="wrap page full"><main>
    <div class="titlebar"><h1>Mitglieder <span class="muted" style="font-size:16px">(${count || 0})</span></h1>
      <form class="row" id="mf"><input class="input" name="q" style="width:220px" placeholder="Name suchen" aria-label="Mitglied suchen" value="${esc(query)}"><button class="btn" type="submit">Suchen</button></form></div>
    <section class="box members-grid">${(data || []).map((p) => `
      <div class="member-card">${avatar(p, 44)}<div style="min-width:0">${nameHtml(p)}<div>${rankBadge(p)} ${p.banned ? '<span class="rank-badge" style="color:#ff6b6b">gesperrt</span>' : ''}</div><div class="small muted">${p.post_count} Beiträge</div></div></div>`).join('') || '<div class="empty">Niemand gefunden.</div>'}
    </section>
    ${query ? '' : pager('#/mitglieder', page, count || 0, per)}
  </main></div>`;
  $('#mf').onsubmit = (e) => { e.preventDefault(); pageMembers(1, e.target.q.value.trim()); };
}

async function pageTeam() {
  setActiveNav('team');
  const staff = state.ranks.filter((r) => r.is_staff);
  const { data } = staff.length ? await sb.from('profiles').select('*').in('rank_id', staff.map((r) => r.id)).order('username') : { data: [] };
  app().innerHTML = `<div class="wrap page full"><main>
    <h1 style="margin:0">Das Team</h1>
    ${staff.map((r) => {
      const ms = (data || []).filter((p) => p.rank_id === r.id);
      return `<section class="box"><h2 class="box-head" style="color:${esc(r.color)}">${esc(r.name)} <span class="muted">${ms.length}</span></h2>
        <div class="members-grid">${ms.map((p) => `<div class="member-card">${avatar(p, 44)}<div>${nameHtml(p)}<div class="small muted">${p.post_count} Beiträge</div></div></div>`).join('') || '<div class="empty">Noch niemand</div>'}</div></section>`;
    }).join('')}
  </main></div>`;
}

async function pageProfile(username) {
  setActiveNav('mitglieder');
  const { data: p } = await sb.from('profiles').select('*').eq('username', username).maybeSingle();
  if (!p) return pageNotFound('Dieses Mitglied gibt es nicht.');
  const { data: threads } = await sb.from('threads').select('*, forums(name)').eq('author_id', p.id).order('created_at', { ascending: false }).limit(10);
  const people = await profilesByIds((threads || []).flatMap((t) => [t.author_id, t.last_post_by]));
  const isMe = state.me?.id === p.id;
  const r = rankOf(p);
  const canAdmin = isManager() && !isMe && (r?.position ?? 0) < myPos();
  app().innerHTML = `<div class="wrap page full"><main>
    <section class="box"><div class="box-body" style="display:flex;flex-wrap:wrap;gap:20px;align-items:center">
      ${avatar(p, 96)}
      <div style="flex:1 1 240px">
        <h1 style="margin:0 0 6px">${nameHtml(p, false)}</h1>
        <div>${rankBadge(p)} ${p.banned ? '<span class="rank-badge" style="color:#ff6b6b">gesperrt</span>' : ''}</div>
        <div class="muted" style="margin-top:8px">${p.post_count} Beiträge · dabei seit ${fmtDay(p.created_at)}</div>
      </div>
      ${isMe ? '<a class="btn" href="#/einstellungen">Profil bearbeiten</a>' : ''}
    </div>
    ${p.about ? `<div class="box-body" style="border-top:1px solid var(--line)"><div class="post-body">${renderBody(p.about)}</div></div>` : ''}
    </section>
    ${canAdmin ? `<section class="box"><h2 class="box-head">Verwaltung</h2><div class="box-body">${memberAdminControls(p)}</div></section>` : ''}
    <section class="box"><h2 class="box-head">Themen von ${esc(p.username)}</h2>${threadRows(threads, people, true)}</section>
  </main></div>`;
  if (canAdmin) bindMemberAdmin(p, () => pageProfile(username));
}
function memberAdminControls(p) {
  const assignable = state.ranks.filter((r) => r.position < myPos());
  return `<div class="row">
    <label for="ma-rank-${p.id}" class="small muted">Rang</label>
    <select class="input" style="width:auto" id="ma-rank-${p.id}" data-ma-rank="${p.id}">${assignable.map((r) => `<option value="${r.id}" ${r.id === p.rank_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <button type="button" class="btn sm ${p.banned ? '' : 'danger'}" data-ma-ban="${p.id}">${p.banned ? 'Entsperren' : 'Sperren'}</button>
    <button type="button" class="btn sm" data-ma-pw="${p.id}">Passwort zurücksetzen</button>
    <button type="button" class="btn sm danger" data-ma-del="${p.id}">Konto löschen</button>
  </div>`;
}
function bindMemberAdmin(p, refresh) {
  const rankSel = $(`[data-ma-rank="${p.id}"]`);
  rankSel.onchange = async () => {
    const { error } = await sb.from('profiles').update({ rank_id: Number(rankSel.value) }).eq('id', p.id);
    if (error) { toast(errMsg(error), true); return refresh(); }
    toast(`Rang von ${p.username} geändert`);
    refresh();
  };
  $(`[data-ma-ban="${p.id}"]`).onclick = async () => {
    if (!p.banned && !(await confirmBox('Mitglied sperren', `${p.username} sperren? Das Mitglied kann dann nichts mehr schreiben.`, 'Sperren'))) return;
    const { error } = await sb.from('profiles').update({ banned: !p.banned }).eq('id', p.id);
    if (error) return toast(errMsg(error), true);
    toast(p.banned ? 'Entsperrt' : 'Gesperrt');
    refresh();
  };
  $(`[data-ma-pw="${p.id}"]`).onclick = () => openModal({
    title: `Neues Passwort für ${p.username}`,
    body: `<div class="field"><label for="npw">Neues Passwort</label><input id="npw" type="text" minlength="6" maxlength="72" autocomplete="off"><span class="hint">Mindestens 6 Zeichen. Gib es dem Mitglied danach privat weiter.</span></div>`,
    onConfirm: async (m) => {
      const pw = $('#npw', m).value;
      if (pw.length < 6) { toast('Mindestens 6 Zeichen', true); return false; }
      const { error } = await sb.functions.invoke('admin-user', { body: { action: 'reset_password', user_id: p.id, password: pw } });
      if (error) { toast(await fnError(error), true); return false; }
      toast('Passwort geändert');
    },
  });
  $(`[data-ma-del="${p.id}"]`).onclick = async () => {
    if (!(await confirmBox('Konto löschen', `Konto von ${p.username} endgültig löschen? Beiträge bleiben als „Gelöschtes Mitglied“ stehen.`))) return;
    const { error } = await sb.functions.invoke('admin-user', { body: { action: 'delete_user', user_id: p.id } });
    if (error) return toast(await fnError(error), true);
    toast('Konto gelöscht');
    if (location.hash.startsWith('#/u/')) location.hash = '#/mitglieder'; else refresh();
  };
}

async function pageSettings() {
  setActiveNav('');
  if (!state.me) return pageLogin('Bitte melde dich zuerst an.');
  const p = state.me;
  app().innerHTML = `<div class="wrap page full"><main>
    <h1 style="margin:0">Einstellungen</h1>
    <section class="box"><h2 class="box-head">Profilbild</h2><div class="box-body row" style="gap:20px">
      <span id="av-preview">${avatar(p, 80)}</span>
      <div><input type="file" id="av-file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Profilbild wählen">
      <div class="hint" style="margin-top:6px">PNG, JPG, WEBP oder GIF, höchstens 2 MB.</div>
      ${p.avatar_url ? '<button type="button" class="btn sm" id="av-remove" style="margin-top:8px">Bild entfernen</button>' : ''}</div>
    </div></section>
    <section class="box"><h2 class="box-head">Über mich</h2><form class="box-body" id="about-form">
      <div class="field"><label for="about">Text auf deinem Profil</label>${editorHtml('about', 'maxlength="2000"', p.about || '')}</div>
      <button class="btn primary" type="submit">Speichern</button>
    </form></section>
    <section class="box"><h2 class="box-head">Passwort ändern</h2><form class="box-body" id="pw-form">
      <div class="grid2">
        <div class="field"><label for="pw1">Neues Passwort</label><input id="pw1" type="password" minlength="6" maxlength="72" required autocomplete="new-password"></div>
        <div class="field"><label for="pw2">Wiederholen</label><input id="pw2" type="password" minlength="6" maxlength="72" required autocomplete="new-password"></div>
      </div>
      <button class="btn primary" type="submit">Passwort ändern</button>
    </form></section>
  </main></div>`;
  bindEditors(app());
  $('#av-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('Das Bild ist größer als 2 MB.', true);
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${p.id}/avatar-${Date.now()}.${ext}`;
    const up = await sb.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type });
    if (up.error) return toast(errMsg(up.error), true);
    const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
    const { error } = await sb.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', p.id);
    if (error) return toast(errMsg(error), true);
    await cleanupAvatars(p.id, path);
    await loadMe(); renderHeader(); toast('Profilbild gespeichert'); pageSettings();
  };
  const rm = $('#av-remove');
  if (rm) rm.onclick = async () => {
    await sb.from('profiles').update({ avatar_url: null }).eq('id', p.id);
    await cleanupAvatars(p.id, null);
    await loadMe(); renderHeader(); toast('Profilbild entfernt'); pageSettings();
  };
  $('#about-form').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from('profiles').update({ about: $('#about').value.trim() }).eq('id', p.id);
    if (error) return toast(errMsg(error), true);
    await loadMe(); toast('Gespeichert');
  };
  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const a = $('#pw1').value, b = $('#pw2').value;
    if (a !== b) return toast('Die Passwörter stimmen nicht überein.', true);
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return toast(errMsg(error), true);
    e.target.reset(); toast('Passwort geändert');
  };
}
async function cleanupAvatars(uid, keepPath) {
  const { data } = await sb.storage.from('avatars').list(uid);
  const old = (data || []).map((o) => `${uid}/${o.name}`).filter((x) => x !== keepPath);
  if (old.length) await sb.storage.from('avatars').remove(old);
}

async function pageNotifications() {
  setActiveNav('');
  if (!state.me) return pageLogin('Bitte melde dich zuerst an.');
  const { data } = await sb.from('notifications').select('*').eq('user_id', state.me.id).order('created_at', { ascending: false }).limit(50);
  const actors = await profilesByIds((data || []).map((n) => n.actor_id));
  app().innerHTML = `<div class="wrap page full"><main>
    <div class="titlebar"><h1>Benachrichtigungen</h1><button type="button" class="btn" id="na">Alle als gelesen markieren</button></div>
    <section class="box">${(data || []).map((n) => `
      <div class="trow" style="grid-template-columns:40px minmax(0,1fr) 160px">
        ${avatar(actors.get(n.actor_id), 36)}
        <div><a href="#/t/${n.thread_id}/last" data-nid="${n.id}" style="${n.read ? '' : 'font-weight:700'}">${esc(n.text)}</a><div class="trow-meta">${n.actor_id ? nameHtml(actors.get(n.actor_id)) : ''}</div></div>
        <div class="small muted">${fmtDate(n.created_at)}</div>
      </div>`).join('') || '<div class="empty">Keine Benachrichtigungen</div>'}</section>
  </main></div>`;
  $('#na').onclick = async () => {
    await sb.from('notifications').update({ read: true }).eq('user_id', state.me.id).eq('read', false);
    await loadUnread(); pageNotifications();
  };
  $$('[data-nid]').forEach((a) => a.addEventListener('click', () => {
    sb.from('notifications').update({ read: true }).eq('id', a.dataset.nid).then(loadUnread);
  }));
}

/* ---- Anmelden / Registrieren ---- */
function pageLogin(note = '') {
  setActiveNav('');
  app().innerHTML = `<div class="wrap"><div class="auth-box box">
    <h1 class="box-head" style="font-size:14px">Anmelden</h1>
    <form class="box-body" id="login-form">
      ${note ? `<div class="notice info" style="margin-bottom:16px">${esc(note)}</div>` : ''}
      <div class="field"><label for="lu">Benutzername</label><input id="lu" name="u" required autocomplete="username"></div>
      <div class="field"><label for="lp">Passwort</label><input id="lp" name="p" type="password" required autocomplete="current-password"></div>
      <button class="btn primary" style="width:100%" type="submit">Anmelden</button>
      <p class="small muted" style="margin:14px 0 0">Noch kein Konto? <a href="#/registrieren">Jetzt registrieren</a><br>Passwort vergessen? Wende dich an das Team, es kann dein Passwort zurücksetzen.</p>
    </form></div></div>`;
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const u = e.target.u.value.trim();
    const btn = $('button', e.target); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: `${u.toLowerCase()}@${LOGIN_DOMAIN}`, password: e.target.p.value });
    btn.disabled = false;
    if (error) return toast(errMsg(error), true);
    toast('Willkommen zurück!');
    location.hash = '#/';
  };
}
function pageRegister() {
  setActiveNav('');
  app().innerHTML = `<div class="wrap"><div class="auth-box box">
    <h1 class="box-head" style="font-size:14px">Registrieren</h1>
    <form class="box-body" id="reg-form">
      <div class="field"><label for="ru">Benutzername</label><input id="ru" name="u" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_\\-]{3,20}" autocomplete="username"><span class="hint">3–20 Zeichen: Buchstaben, Zahlen, _ und -. Kann später nicht geändert werden.</span></div>
      <div class="field"><label for="rp">Passwort</label><input id="rp" name="p" type="password" required minlength="6" maxlength="72" autocomplete="new-password"></div>
      <div class="field"><label for="rp2">Passwort wiederholen</label><input id="rp2" name="p2" type="password" required minlength="6" maxlength="72" autocomplete="new-password"></div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" name="ok" required> <span class="small">Ich habe die <a href="#/datenschutz" target="_blank">Datenschutzerklärung</a> gelesen.</span></label>
      <button class="btn primary" style="width:100%" type="submit">Konto erstellen</button>
      <p class="small muted" style="margin:14px 0 0">Schon registriert? <a href="#/login">Anmelden</a></p>
    </form></div></div>`;
  $('#reg-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.p.value !== f.p2.value) return toast('Die Passwörter stimmen nicht überein.', true);
    const btn = $('button', f); btn.disabled = true;
    const username = f.u.value.trim();
    const { error } = await sb.functions.invoke('register', { body: { username, password: f.p.value } });
    if (error) { btn.disabled = false; return toast(await fnError(error), true); }
    const { error: le } = await sb.auth.signInWithPassword({ email: `${username.toLowerCase()}@${LOGIN_DOMAIN}`, password: f.p.value });
    btn.disabled = false;
    if (le) { toast('Konto erstellt. Bitte melde dich an.'); location.hash = '#/login'; return; }
    toast('Willkommen im Forum!');
    location.hash = '#/';
  };
}

function pagePrivacy() {
  setActiveNav('');
  const s = state.settings;
  const n = esc(s.site_name || 'Forum');
  const missing = '<span class="priv-missing">[noch nicht eingetragen]</span>';
  const owner = s.privacy_name ? esc(s.privacy_name) : missing;
  const addr = s.privacy_address ? esc(s.privacy_address).replace(/\n/g, '<br>') : missing;
  const contact = s.privacy_contact ? esc(s.privacy_contact) : missing;
  const incomplete = !s.privacy_name || !s.privacy_address || !s.privacy_contact;
  app().innerHTML = `<div class="wrap page full"><main><section class="box"><h1 class="box-head" style="font-size:14px">Datenschutzerklärung</h1><div class="box-body post-body privacy">
    ${incomplete && isManager() ? '<div class="notice info">Hinweis für die Verwaltung: Bitte unter <a href="#/admin/allgemein">Verwaltung → Allgemein</a> Name, Anschrift und Kontakt des Verantwortlichen eintragen. Ohne diese Angaben ist die Datenschutzerklärung nicht vollständig.</div>' : ''}
    <p class="muted small">Stand: 5. November 2026</p>
    <p>Hier erfährst du, welche personenbezogenen Daten beim Besuch und bei der Nutzung des Forums von ${n} verarbeitet werden, wozu das geschieht und welche Rechte du hast. Grundlage ist die Datenschutz-Grundverordnung (DSGVO) und das Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz (TDDDG).</p>

    <h2>1. Verantwortlicher</h2>
    <p>Verantwortlich für die Datenverarbeitung in diesem Forum ist:<br>${owner}<br>${addr}<br>Kontakt: ${contact}</p>
    <p>Das Forum ist ein privates, nicht kommerzielles Hobbyprojekt für die Community des FiveM-Servers ${n}. Es gibt keine Werbung, kein Tracking und keine Analyse-Werkzeuge. Ein Datenschutzbeauftragter ist nicht bestellt, weil dazu keine gesetzliche Pflicht besteht.</p>

    <h2>2. Aufruf der Website</h2>
    <p>Die Website wird über <b>GitHub Pages</b> ausgeliefert, einen Dienst der GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA. Bei jedem Aufruf verarbeitet GitHub technisch notwendige Verbindungsdaten: deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Datei, Browser- und Systemangaben sowie die zuvor besuchte Seite. Diese Daten braucht GitHub, um die Seite auszuliefern und vor Angriffen zu schützen; laut GitHub werden sie nur begrenzte Zeit gespeichert.</p>
    <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse liegt in einer sicheren und funktionierenden Bereitstellung des Forums. GitHub ist nach dem EU-US Data Privacy Framework zertifiziert, das nach Art. 45 DSGVO ein angemessenes Datenschutzniveau für die Übermittlung in die USA sicherstellt. Mehr dazu: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von GitHub</a>.</p>
    <p>Schriftarten und alle übrigen Dateien der Seite liegen direkt bei uns. Beim Aufruf werden keine Daten an Google oder andere Schriftarten- oder Inhaltsanbieter übertragen.</p>

    <h2>3. Datenbank und Speicherung (Supabase)</h2>
    <p>Konten, Beiträge, Profilbilder und Benachrichtigungen werden bei <b>Supabase</b> gespeichert, einem Dienst der Supabase Pte. Ltd., Singapur. Die Datenbank liegt in einem Rechenzentrum in <b>Frankfurt am Main</b> (Region eu-central-1). Supabase verarbeitet die Daten als Auftragsverarbeiter nach Art. 28 DSGVO auf Grundlage eines Auftragsverarbeitungsvertrags. Soweit Supabase oder seine Unterauftragnehmer Daten außerhalb der EU verarbeiten, ist das durch die Standardvertragsklauseln der EU-Kommission abgesichert (Art. 46 Abs. 2 lit. c DSGVO).</p>
    <p>Bei jeder Anfrage an die Datenbank (zum Beispiel beim Laden eines Themas oder beim Anmelden) verarbeitet Supabase technisch notwendige Verbindungsdaten wie deine IP-Adresse und den Zeitpunkt. Diese Protokolle dienen dem Betrieb und der Sicherheit und werden nach kurzer Zeit automatisch gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Mehr dazu: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Datenschutzerklärung von Supabase</a>.</p>

    <h2>4. Registrierung und Benutzerkonto</h2>
    <p>Für ein Konto brauchst du nur einen <b>Benutzernamen</b> und ein <b>Passwort</b>. Eine E-Mail-Adresse, dein echter Name oder andere Angaben werden nicht abgefragt. Intern legt das System dafür eine Platzhalter-Adresse an (dein Benutzername mit einer Domain, an die nie Post zugestellt werden kann); sie wird nirgends angezeigt und nicht benutzt. Das Passwort wird nur als nicht umkehrbarer Prüfwert (Hash) gespeichert; niemand im Team kann es lesen. Hast du dein Passwort vergessen, kann die Verwaltung dir ein neues setzen. Zu deinem Konto werden außerdem gespeichert: das Datum der Registrierung, der Zeitpunkt deiner letzten Anmeldung, dein Rang, die Anzahl deiner Beiträge und ob dein Konto gesperrt ist.</p>
    <p>Benutzername und Passwort sind Pflicht, ohne sie kann kein Konto angelegt werden. Lesen kannst du öffentliche Bereiche auch ohne Konto. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, weil diese Daten nötig sind, um dir die Nutzung des Forums zu ermöglichen.</p>

    <h2>5. Themen, Beiträge, Bewerbungen und Anträge</h2>
    <p>Wenn du ein Thema oder einen Beitrag schreibst, werden der Inhalt, dein Benutzername und der Zeitpunkt gespeichert, bei Änderungen auch der Zeitpunkt der Bearbeitung. Das gilt auch für Bewerbungen, Beschwerden und Entbannungsanträge, die du über die Formulare im Forum abgibst. Beschwerden können Angaben über andere Mitglieder oder Spieler enthalten; sie werden nur vom zuständigen Team gelesen und nur zur Klärung des Falls genutzt.</p>
    <p><b>Wer sieht was?</b> Beiträge in öffentlichen Foren sind für alle sichtbar, auch für Besucher ohne Konto. Manche Foren sind nur für bestimmte Ränge sichtbar. In privaten Foren (zum Beispiel Bewerbungen oder Beschwerden) sieht nur der Ersteller sein eigenes Thema und das zuständige Team ab einem festgelegten Rang. Das Team kann Beiträge zur Moderation bearbeiten, verschieben, schließen oder löschen.</p>
    <p>Bitte gib in Beiträgen und Bewerbungen nur das an, was nötig ist. Schreib keine Telefonnummern, Adressen oder andere sensible Daten über dich oder andere ins Forum.</p>
    <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Forums) sowie für die Moderation Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem geordneten Forum und einem regelgerechten Spielbetrieb auf dem Server).</p>

    <h2>6. Profil, Profilbild und Mitgliederliste</h2>
    <p>Freiwillig kannst du ein <b>Profilbild</b> hochladen und einen <b>„Über mich“-Text</b> schreiben. Beides ist öffentlich auf deinem Profil sichtbar. Profilbilder werden bei Supabase gespeichert und sind über eine öffentliche Adresse abrufbar. Benutzername, Rang, Profilbild, Registrierungsdatum, Beitragszahl und deine letzten Themen sind auf deinem Profil sichtbar, Benutzername, Rang und Profilbild auch in der Mitgliederliste, Teammitglieder zusätzlich auf der Team-Seite. Ist ein Konto gesperrt, wird das im Profil und in der Mitgliederliste mit dem Hinweis „gesperrt“ angezeigt. Du kannst Profilbild und Text jederzeit selbst ändern oder entfernen; alte Profilbilder werden dabei gelöscht. Tipp: Fotos vom Handy können versteckte Zusatzdaten enthalten (zum Beispiel den Aufnahmeort). Nimm am besten einen Screenshot oder ein Bild ohne solche Daten.</p>
    <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO; die Angaben im Profil machst du freiwillig.</p>

    <h2>7. Benachrichtigungen</h2>
    <p>Damit du siehst, wenn jemand in deinem Thema antwortet oder sich der Status ändert, speichert das Forum Benachrichtigungen mit dem auslösenden Mitglied, dem Thema, einem kurzen Text, dem Zeitpunkt und ob du sie gelesen hast. Es werden keine E-Mails oder Push-Nachrichten verschickt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.</p>

    <h2>8. Anzeige „Mitglieder online“</h2>
    <p>Solange du angemeldet auf der Seite bist, meldet dein Browser über eine Live-Verbindung zu Supabase, dass du online bist. Dein Benutzername erscheint dann für alle Besucher in der Liste „Mitglieder online“. Gäste werden dabei nur mit einer zufälligen Kennung gezählt und nicht namentlich angezeigt. Die Angabe wird nicht dauerhaft gespeichert und verschwindet, sobald du die Seite schließt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse ist, dass die Community sieht, wer gerade erreichbar ist. Du kannst dem jederzeit widersprechen (siehe Abschnitt 13).</p>

    <h2>9. Speicher im Browser (keine Cookies)</h2>
    <p>Das Forum setzt keine Tracking- oder Werbe-Cookies. Damit du angemeldet bleibst, wird eine Anmelde-Sitzung (Zugangsschlüssel) im lokalen Speicher deines Browsers (localStorage) abgelegt; beim Abmelden wird sie entfernt. Außerdem merkt sich die Seite, welche Kategorien du eingeklappt hast (ebenfalls localStorage) und nach welchem Status du gerade filterst (sessionStorage, wird beim Schließen des Tabs gelöscht).</p>
    <p>Das ist technisch unbedingt erforderlich, damit das Forum so funktioniert, wie du es nutzt. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG und Art. 6 Abs. 1 lit. b und f DSGVO. Du kannst den Speicher jederzeit in deinem Browser löschen.</p>

    <h2>10. Externe Links</h2>
    <p>Beiträge können Links zu anderen Websites enthalten. Erst wenn du einen Link anklickst, wird die fremde Seite geöffnet; für sie gilt die Datenschutzerklärung des jeweiligen Anbieters. Es werden keine fremden Bilder, Videos oder sonstigen Inhalte automatisch eingebettet.</p>

    <h2>11. Wie lange werden Daten gespeichert?</h2>
    <p>Kontodaten, Beiträge und Profilangaben speichern wir, solange dein Konto besteht. Wenn dein Konto gelöscht wird, werden dein Konto, dein Profil, dein Profilbild und deine Benachrichtigungen vollständig gelöscht. Deine Themen und Beiträge bleiben zunächst erhalten, damit Unterhaltungen verständlich bleiben, erscheinen aber ohne Verknüpfung zu deinem Konto als „Gelöschtes Mitglied“. Hat dich jemand zitiert oder im Text erwähnt, kann dein Benutzername dort weiterhin stehen. Wenn du möchtest, dass auch deine Beiträge gelöscht oder Zitate entfernt werden, sag uns das bei deiner Anfrage.</p>
    <p>Du kannst dein Konto nicht selbst löschen. Schreib dafür an den oben genannten Verantwortlichen oder an die Projektleitung im Forum; wir löschen es dann zeitnah, spätestens innerhalb eines Monats. Technische Protokolle bei GitHub und Supabase werden nach kurzer Zeit automatisch gelöscht.</p>

    <h2>12. Weitergabe von Daten</h2>
    <p>Wir verkaufen keine Daten und geben sie nicht an Dritte weiter, außer an die oben genannten Dienstleister, die das Forum technisch bereitstellen, oder wenn wir gesetzlich dazu verpflichtet sind.</p>

    <h2>13. Deine Rechte</h2>
    <p>Du hast nach der DSGVO jederzeit das Recht auf:</p>
    <ul>
      <li><b>Auskunft</b> über deine gespeicherten Daten (Art. 15 DSGVO)</li>
      <li><b>Berichtigung</b> falscher Daten (Art. 16 DSGVO)</li>
      <li><b>Löschung</b> deiner Daten (Art. 17 DSGVO)</li>
      <li><b>Einschränkung</b> der Verarbeitung (Art. 18 DSGVO)</li>
      <li><b>Datenübertragbarkeit</b>, also eine Kopie deiner Daten in einem gängigen Format (Art. 20 DSGVO)</li>
      <li><b>Widerspruch</b> gegen Verarbeitungen, die auf unserem berechtigten Interesse beruhen (Art. 21 DSGVO, siehe unten)</li>
    </ul>
    <p>Wende dich dafür an den oben genannten Verantwortlichen. Damit wir sicher sind, dass die Anfrage wirklich von dir kommt, schreib am besten über dein Forenkonto oder nenne deinen Benutzernamen.</p>
    <div class="notice info"><b>Widerspruchsrecht (Art. 21 DSGVO):</b> Soweit wir Daten auf Grundlage unseres berechtigten Interesses verarbeiten (Art. 6 Abs. 1 lit. f DSGVO, zum Beispiel die Anzeige „Mitglieder online“ oder die Moderation), kannst du dieser Verarbeitung aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen. Wir verarbeiten die Daten dann nicht mehr, es sei denn, es gibt zwingende schutzwürdige Gründe, die deine Interessen überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.</div>
    <p>Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), zum Beispiel bei der Behörde des Bundeslandes, in dem du wohnst.</p>

    <h2>14. Keine automatisierten Entscheidungen</h2>
    <p>Es findet keine automatisierte Entscheidungsfindung und kein Profiling statt. Über Bewerbungen, Beschwerden, Entbannungsanträge und Sperren entscheiden immer Menschen aus dem Team.</p>

    <h2>15. Sicherheit</h2>
    <p>Die Verbindung zum Forum ist per HTTPS verschlüsselt. Wer welche Daten sehen und ändern darf, wird direkt in der Datenbank geprüft und nicht nur im Browser. Passwörter werden nur als nicht umkehrbarer Hash gespeichert.</p>

    <h2>16. Änderungen</h2>
    <p>Wenn sich das Forum oder die eingesetzten Dienste ändern, passen wir diese Datenschutzerklärung an. Es gilt immer die hier veröffentlichte Fassung.</p>
  </div></section></main></div>`;
}

function pageNotFound(msg = 'Diese Seite gibt es nicht.') {
  app().innerHTML = `<div class="wrap page full"><main><div class="box"><div class="empty">${esc(msg)}<br><br><a class="btn" href="#/">Zur Startseite</a></div></div></main></div>`;
}

/* ================= Verwaltung ================= */
async function pageAdmin(tab = 'allgemein') {
  setActiveNav('admin');
  if (!isManager()) return pageNotFound('Nur für die Verwaltung.');
  const tabs = [['allgemein', 'Allgemein'], ['bereiche', 'Bereiche & Foren'], ['raenge', 'Ränge'], ['praefixe', 'Status-Präfixe'], ['mitglieder', 'Mitglieder']];
  app().innerHTML = `<div class="wrap page full"><main>
    <h1 style="margin:0">Verwaltung</h1>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/admin/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</nav>
    <div id="admin-body"><div class="loading">Lädt …</div></div>
  </main></div>`;
  const body = $('#admin-body');
  if (tab === 'allgemein') return adminGeneral(body);
  if (tab === 'bereiche') return adminAreas(body);
  if (tab === 'raenge') return adminRanks(body);
  if (tab === 'praefixe') return adminPrefixes(body);
  if (tab === 'mitglieder') return adminMembers(body);
  return pageNotFound();
}

function adminGeneral(body) {
  body.innerHTML = `<section class="box"><form class="box-body" id="ag">
    <div class="grid2">
      <div class="field"><label for="sn">Name des Servers / Forums</label><input id="sn" maxlength="40" required value="${esc(state.settings.site_name)}"></div>
      <div class="field"><label for="st">Untertitel</label><input id="st" maxlength="80" value="${esc(state.settings.site_tagline)}"></div>
    </div>
    <h2 style="font-size:16px;margin:8px 0 4px">Datenschutz: Verantwortlicher</h2>
    <p class="small muted" style="margin:0 0 12px">Diese Angaben erscheinen öffentlich in der <a href="#/datenschutz">Datenschutzerklärung</a>. Die DSGVO verlangt Name und eine ladungsfähige Anschrift der verantwortlichen Person sowie einen Kontaktweg.</p>
    <div class="grid2">
      <div class="field"><label for="pn">Vor- und Nachname</label><input id="pn" maxlength="100" value="${esc(state.settings.privacy_name || '')}"></div>
      <div class="field"><label for="pc">Kontakt (E-Mail oder Discord)</label><input id="pc" maxlength="200" value="${esc(state.settings.privacy_contact || '')}"></div>
    </div>
    <div class="field"><label for="pa">Anschrift</label><textarea id="pa" maxlength="300" rows="3" placeholder="Straße Hausnummer&#10;PLZ Ort">${esc(state.settings.privacy_address || '')}</textarea></div>
    <button class="btn primary" type="submit">Speichern</button>
  </form></section>
  <div class="notice info">Tipp: Im kostenlosen Supabase-Tarif pausiert die Datenbank nach etwa einer Woche ohne Besucher. Dann im Supabase-Dashboard beim Projekt „Forum“ auf „Restore“ klicken.</div>`;
  $('#ag').onsubmit = async (e) => {
    e.preventDefault();
    const patch = { site_name: $('#sn').value.trim(), site_tagline: $('#st').value.trim(), privacy_name: $('#pn').value.trim(), privacy_address: $('#pa').value.trim(), privacy_contact: $('#pc').value.trim() };
    const { error } = await sb.from('settings').update(patch).eq('id', 1);
    if (error) return toast(errMsg(error), true);
    state.settings = { ...state.settings, ...patch };
    applySettings(); toast('Gespeichert');
  };
}

function rankOptions(selected, { guests = false, any = true } = {}) {
  const opts = [];
  if (guests) opts.push([0, 'Alle, auch Gäste']);
  if (any) opts.push([1, 'Alle angemeldeten Mitglieder']);
  [...state.ranks].sort((a, b) => a.position - b.position).forEach((r) => opts.push([r.position, `ab ${r.name}`]));
  if (selected != null && !opts.some(([v]) => v === Number(selected))) opts.push([Number(selected), `Stufe ${selected} (kein Rang)`]);
  return opts.map(([v, l]) => `<option value="${v}" ${Number(selected) === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
function rankLabel(pos) {
  if (pos <= 0) return 'alle';
  if (pos === 1) return 'Mitglieder';
  const r = [...state.ranks].sort((a, b) => a.position - b.position).find((x) => x.position >= pos);
  return r ? 'ab ' + r.name : 'niemand';
}

async function adminAreas(body) {
  const [cats, forums] = await Promise.all([
    sb.from('categories').select('*').order('position'),
    sb.from('forums').select('*').order('position'),
  ]);
  const catList = cats.data || [];
  body.innerHTML = `
    <div class="row"><button type="button" class="btn primary" id="add-cat">Kategorie hinzufügen</button></div>
    ${catList.map((c) => `
      <section class="box">
        <div class="box-head"><span>${esc(c.title)} <span class="muted" style="text-transform:none;letter-spacing:0">· Position ${c.position}</span></span>
          <span class="row"><button type="button" class="btn sm" data-cat-edit="${c.id}">Bearbeiten</button><button type="button" class="btn sm" data-forum-add="${c.id}">Forum hinzufügen</button><button type="button" class="btn sm danger" data-cat-del="${c.id}">Löschen</button></span></div>
        ${(forums.data || []).filter((f) => f.category_id === c.id).map((f) => `
          <div class="node" style="grid-template-columns:minmax(0,1fr) auto">
            <div><b style="color:#fff">${esc(f.name)}</b> <span class="muted small">· Position ${f.position}</span>
              <div class="small muted">Sehen: ${rankLabel(f.view_rank)} · Themen erstellen: ${rankLabel(f.post_rank)}${f.private_rank != null ? ` · privat (sichtbar ${rankLabel(f.private_rank)})` : ''}${(f.form_fields || []).length ? ` · Formular mit ${(f.form_fields || []).length} Feldern` : ''}${f.default_prefix_id ? ` · Start-Status: ${esc(state.prefixById.get(f.default_prefix_id)?.name || '')}` : ''}</div></div>
            <div class="row"><button type="button" class="btn sm" data-forum-edit="${f.id}">Bearbeiten</button><button type="button" class="btn sm danger" data-forum-del="${f.id}">Löschen</button></div>
          </div>`).join('') || '<div class="empty">Noch keine Foren in dieser Kategorie.</div>'}
      </section>`).join('')}`;
  const reload = () => adminAreas(body);
  const catModal = (c) => openModal({
    title: c ? 'Kategorie bearbeiten' : 'Neue Kategorie',
    body: `<div class="field"><label for="ct">Name</label><input id="ct" maxlength="60" value="${esc(c?.title || '')}"></div>
      <div class="field"><label for="cp">Position (kleiner = weiter oben)</label><input id="cp" type="number" value="${c?.position ?? (catList.length + 1)}"></div>`,
    onConfirm: async (m) => {
      const row = { title: $('#ct', m).value.trim(), position: Number($('#cp', m).value) || 0 };
      if (!row.title) { toast('Name fehlt', true); return false; }
      const { error } = c ? await sb.from('categories').update(row).eq('id', c.id) : await sb.from('categories').insert(row);
      if (error) { toast(errMsg(error), true); return false; }
      toast('Gespeichert'); reload();
    },
  });
  $('#add-cat').onclick = () => catModal(null);
  $$('[data-cat-edit]').forEach((b) => b.onclick = () => catModal(catList.find((c) => c.id === Number(b.dataset.catEdit))));
  $$('[data-cat-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Kategorie löschen', 'Kategorie mit ALLEN Foren, Themen und Beiträgen darin löschen?'))) return;
    const { error } = await sb.from('categories').delete().eq('id', b.dataset.catDel);
    if (error) return toast(errMsg(error), true);
    toast('Gelöscht'); reload();
  });
  $$('[data-forum-add]').forEach((b) => b.onclick = () => forumModal(null, Number(b.dataset.forumAdd), catList, reload));
  $$('[data-forum-edit]').forEach((b) => b.onclick = () => forumModal((forums.data || []).find((f) => f.id === Number(b.dataset.forumEdit)), null, catList, reload));
  $$('[data-forum-del]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Forum löschen', 'Forum mit allen Themen und Beiträgen löschen? Das kann nicht rückgängig gemacht werden.'))) return;
    const { error } = await sb.from('forums').delete().eq('id', b.dataset.forumDel);
    if (error) return toast(errMsg(error), true);
    toast('Gelöscht'); reload();
  });
}
function forumModal(f, catId, cats, reload) {
  let fields = JSON.parse(JSON.stringify(f?.form_fields || []));
  const fieldRows = () => fields.map((fl, i) => `
    <div class="formfield-row" data-fi="${i}">
      <input class="input" data-k="label" value="${esc(fl.label)}" placeholder="Feldname" aria-label="Feldname">
      <select class="input" data-k="type" aria-label="Feldart"><option value="text" ${fl.type !== 'textarea' ? 'selected' : ''}>Kurzer Text</option><option value="textarea" ${fl.type === 'textarea' ? 'selected' : ''}>Langer Text</option></select>
      <label class="check small"><input type="checkbox" data-k="required" ${fl.required ? 'checked' : ''}> Pflicht</label>
      <button type="button" class="btn sm danger" data-frm="${i}" aria-label="Feld entfernen">×</button>
    </div>`).join('');
  const m = openModal({
    title: f ? `Forum „${f.name}“ bearbeiten` : 'Neues Forum',
    body: `
      <div class="field"><label for="fn">Name</label><input id="fn" maxlength="60" value="${esc(f?.name || '')}"></div>
      <div class="field"><label for="fd">Beschreibung</label><input id="fd" maxlength="160" value="${esc(f?.description || '')}"></div>
      <div class="grid2">
        <div class="field"><label for="fc">Kategorie</label><select id="fc">${cats.map((c) => `<option value="${c.id}" ${(f?.category_id ?? catId) === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="fp">Position</label><input id="fp" type="number" value="${f?.position ?? 1}"></div>
        <div class="field"><label for="fv">Wer darf das Forum sehen?</label><select id="fv">${rankOptions(f?.view_rank ?? 0, { guests: true })}</select></div>
        <div class="field"><label for="fw">Wer darf Themen erstellen?</label><select id="fw">${rankOptions(f?.post_rank ?? 1)}</select></div>
        <div class="field"><label for="fpr">Private Themen?</label><select id="fpr"><option value="">Nein, alle sehen alle Themen</option>${f?.private_rank != null && !state.ranks.some((r) => r.position === f.private_rank) ? `<option value="${f.private_rank}" selected>Ja, nur Ersteller + ab Stufe ${f.private_rank}</option>` : ''}${[...state.ranks].sort((a, b) => a.position - b.position).map((r) => `<option value="${r.position}" ${f?.private_rank === r.position ? 'selected' : ''}>Ja, nur Ersteller + ab ${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="fdp">Status bei neuen Themen</label><select id="fdp"><option value="">Kein Status</option>${state.prefixes.map((p) => `<option value="${p.id}" ${f?.default_prefix_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Formular für neue Themen</label><span class="hint">Leer lassen für ein normales Textfeld. Mit Feldern wird daraus ein Formular wie bei Bewerbungen.</span></div>
      <div id="ff-list"></div>
      <button type="button" class="btn sm" id="ff-add">Feld hinzufügen</button>`,
    onConfirm: async (mm) => {
      collect(mm);
      const row = {
        name: $('#fn', mm).value.trim(),
        description: $('#fd', mm).value.trim(),
        category_id: Number($('#fc', mm).value),
        position: Number($('#fp', mm).value) || 0,
        view_rank: Number($('#fv', mm).value),
        post_rank: Number($('#fw', mm).value),
        private_rank: $('#fpr', mm).value === '' ? null : Number($('#fpr', mm).value),
        default_prefix_id: $('#fdp', mm).value === '' ? null : Number($('#fdp', mm).value),
        form_fields: fields.filter((x) => x.label.trim()).map((x) => ({ label: x.label.trim(), type: x.type, required: !!x.required })),
      };
      if (!row.name) { toast('Name fehlt', true); return false; }
      const { error } = f ? await sb.from('forums').update(row).eq('id', f.id) : await sb.from('forums').insert(row);
      if (error) { toast(errMsg(error), true); return false; }
      toast('Gespeichert'); reload();
    },
  });
  const listEl = $('#ff-list', m.root);
  function collect(root) {
    $$('[data-fi]', root).forEach((row) => {
      const i = Number(row.dataset.fi);
      fields[i] = { label: $('[data-k=label]', row).value, type: $('[data-k=type]', row).value, required: $('[data-k=required]', row).checked };
    });
  }
  function draw() {
    listEl.innerHTML = fieldRows();
    $$('[data-frm]', listEl).forEach((b) => b.onclick = () => { collect(m.root); fields.splice(Number(b.dataset.frm), 1); draw(); });
  }
  $('#ff-add', m.root).onclick = () => { collect(m.root); fields.push({ label: '', type: 'text', required: true }); draw(); };
  draw();
}

async function adminRanks(body) {
  await loadBase();
  const me = myPos();
  body.innerHTML = `
    <section class="box"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Name</th><th>Farbe</th><th>Stufe</th><th>Team</th><th>Moderieren</th><th>Verwalten</th><th>Standard</th><th></th></tr></thead>
      <tbody>${state.ranks.map((r) => {
        const ro = r.position >= me;
        return `<tr data-rid="${r.id}">
          <td><input type="text" data-k="name" value="${esc(r.name)}" maxlength="30" ${ro ? 'disabled' : ''} aria-label="Name"></td>
          <td><input type="color" data-k="color" value="${esc(r.color)}" ${ro ? 'disabled' : ''} aria-label="Farbe"></td>
          <td><input type="number" data-k="position" value="${r.position}" style="width:80px" ${ro ? 'disabled' : ''} aria-label="Stufe"></td>
          <td><input type="checkbox" data-k="is_staff" ${r.is_staff ? 'checked' : ''} ${ro ? 'disabled' : ''} aria-label="Team"></td>
          <td><input type="checkbox" data-k="can_moderate" ${r.can_moderate ? 'checked' : ''} ${ro ? 'disabled' : ''} aria-label="Moderieren"></td>
          <td><input type="checkbox" data-k="can_manage" ${r.can_manage ? 'checked' : ''} ${ro ? 'disabled' : ''} aria-label="Verwalten"></td>
          <td><input type="radio" name="defrank" data-k="is_default" ${r.is_default ? 'checked' : ''} ${ro ? 'disabled' : ''} aria-label="Standardrang"></td>
          <td>${ro ? '<span class="small muted">gleich/höher als du</span>' : `<span class="row"><button type="button" class="btn sm primary" data-rsave="${r.id}">Speichern</button><button type="button" class="btn sm danger" data-rdel="${r.id}">Löschen</button></span>`}</td>
        </tr>`;
      }).join('')}</tbody></table></div></section>
    <div class="row"><button type="button" class="btn primary" id="add-rank">Rang hinzufügen</button></div>
    <div class="notice info"><b>Stufe:</b> Höhere Zahl = mehr Rechte. Foren-Rechte („ab Moderator“) richten sich nach der Stufe. Du kannst nur Ränge unter deiner eigenen Stufe bearbeiten und vergeben.<br><b>Moderieren:</b> Status setzen, Themen schließen, anheften, verschieben, Beiträge bearbeiten und löschen.<br><b>Verwalten:</b> Zugriff auf diese Verwaltung. <b>Standard:</b> Rang für neue Mitglieder. <b>Team:</b> erscheint auf der Team-Seite.</div>`;
  const reload = () => adminRanks(body);
  $$('[data-rsave]').forEach((b) => b.onclick = async () => {
    const tr = b.closest('tr');
    const id = Number(tr.dataset.rid);
    const row = {
      name: $('[data-k=name]', tr).value.trim(), color: $('[data-k=color]', tr).value,
      position: Number($('[data-k=position]', tr).value), is_staff: $('[data-k=is_staff]', tr).checked,
      can_moderate: $('[data-k=can_moderate]', tr).checked, can_manage: $('[data-k=can_manage]', tr).checked,
    };
    if (row.position >= me) return toast('Die Stufe muss unter deiner eigenen liegen.', true);
    const makeDefault = $('[data-k=is_default]', tr).checked;
    const { error } = await sb.from('ranks').update(row).eq('id', id);
    if (error) return toast(errMsg(error), true);
    if (makeDefault && !state.rankById.get(id).is_default) {
      const others = state.ranks.filter((r) => r.is_default && r.id !== id).map((r) => r.id);
      if (others.length) await sb.from('ranks').update({ is_default: false }).in('id', others);
      await sb.from('ranks').update({ is_default: true }).eq('id', id);
    }
    toast('Rang gespeichert'); reload();
  });
  $$('[data-rdel]').forEach((b) => b.onclick = async () => {
    const r = state.rankById.get(Number(b.dataset.rdel));
    if (r.is_default) return toast('Der Standardrang kann nicht gelöscht werden.', true);
    if (!(await confirmBox('Rang löschen', `Rang „${r.name}“ löschen? Geht nur, wenn niemand mehr diesen Rang hat.`))) return;
    const { error } = await sb.from('ranks').delete().eq('id', r.id);
    if (error) return toast(errMsg(error), true);
    toast('Gelöscht'); reload();
  });
  $('#add-rank').onclick = () => openModal({
    title: 'Neuer Rang',
    body: `<div class="field"><label for="rn">Name</label><input id="rn" maxlength="30"></div>
      <div class="grid2"><div class="field"><label for="rc">Farbe</label><input id="rc" type="color" value="#c9d1dd" style="height:42px;padding:4px"></div>
      <div class="field"><label for="rpo">Stufe (unter ${me})</label><input id="rpo" type="number" value="${Math.max(1, Math.min(me - 1, 15))}"></div></div>
      <label class="check"><input type="checkbox" id="rs"> Team</label> &nbsp; <label class="check"><input type="checkbox" id="rm"> Moderieren</label> &nbsp; <label class="check"><input type="checkbox" id="rv"> Verwalten</label>`,
    onConfirm: async (m) => {
      const row = { name: $('#rn', m).value.trim(), color: $('#rc', m).value, position: Number($('#rpo', m).value),
        is_staff: $('#rs', m).checked, can_moderate: $('#rm', m).checked, can_manage: $('#rv', m).checked };
      if (!row.name) { toast('Name fehlt', true); return false; }
      if (!(row.position > 1 && row.position < me)) { toast(`Stufe muss zwischen 2 und ${me - 1} liegen.`, true); return false; }
      const { error } = await sb.from('ranks').insert(row);
      if (error) { toast(errMsg(error), true); return false; }
      toast('Rang angelegt'); reload();
    },
  });
}

async function adminPrefixes(body) {
  await loadBase();
  body.innerHTML = `
    <section class="box"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Vorschau</th><th>Name</th><th>Hintergrund</th><th>Schrift</th><th>Reihenfolge</th><th>Schließt Thema</th><th></th></tr></thead>
      <tbody>${state.prefixes.map((p) => `<tr data-pid="${p.id}">
        <td>${prefixHtml(p.id, true)}</td>
        <td><input type="text" data-k="name" value="${esc(p.name)}" maxlength="24" aria-label="Name"></td>
        <td><input type="color" data-k="bg" value="${esc(p.bg)}" aria-label="Hintergrundfarbe"></td>
        <td><input type="color" data-k="fg" value="${esc(p.fg)}" aria-label="Schriftfarbe"></td>
        <td><input type="number" data-k="position" value="${p.position}" style="width:80px" aria-label="Reihenfolge"></td>
        <td><input type="checkbox" data-k="closes" ${p.closes ? 'checked' : ''} aria-label="Schließt Thema"></td>
        <td><span class="row"><button type="button" class="btn sm primary" data-psave="${p.id}">Speichern</button><button type="button" class="btn sm danger" data-pdel="${p.id}">Löschen</button></span></td>
      </tr>`).join('')}</tbody></table></div></section>
    <div class="row"><button type="button" class="btn primary" id="add-prefix">Präfix hinzufügen</button></div>
    <div class="notice info">„Schließt Thema“: Wird dieser Status gesetzt, wird das Thema automatisch für Antworten gesperrt (z. B. Angenommen, Abgelehnt).</div>`;
  const reload = () => adminPrefixes(body);
  const rowOf = (tr) => ({ name: $('[data-k=name]', tr).value.trim(), bg: $('[data-k=bg]', tr).value, fg: $('[data-k=fg]', tr).value,
    position: Number($('[data-k=position]', tr).value) || 0, closes: $('[data-k=closes]', tr).checked });
  $$('[data-psave]').forEach((b) => b.onclick = async () => {
    const tr = b.closest('tr');
    const row = rowOf(tr);
    if (!row.name) return toast('Name fehlt', true);
    const { error } = await sb.from('prefixes').update(row).eq('id', tr.dataset.pid);
    if (error) return toast(errMsg(error), true);
    toast('Gespeichert'); reload();
  });
  $$('[data-pdel]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Präfix löschen', 'Präfix löschen? Themen mit diesem Status haben danach keinen Status mehr.'))) return;
    const { error } = await sb.from('prefixes').delete().eq('id', b.dataset.pdel);
    if (error) return toast(errMsg(error), true);
    toast('Gelöscht'); reload();
  });
  $('#add-prefix').onclick = async () => {
    const { error } = await sb.from('prefixes').insert({ name: 'Neu', position: state.prefixes.length + 1 });
    if (error) return toast(errMsg(error), true);
    reload();
  };
}

async function adminMembers(body, query = '') {
  let q = sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(60);
  if (query) q = q.ilike('username', `%${query.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
  const { data } = await q;
  body.innerHTML = `
    <form class="row" id="am-search"><input class="input" name="q" style="width:240px" placeholder="Name suchen" aria-label="Mitglied suchen" value="${esc(query)}"><button class="btn" type="submit">Suchen</button></form>
    <section class="box">${(data || []).map((p) => {
      const editable = p.id !== state.me.id && (rankOf(p)?.position ?? 0) < myPos();
      return `<div class="member-card" style="flex-wrap:wrap">
        ${avatar(p, 40)}
        <div style="flex:1 1 200px;min-width:0">${nameHtml(p)} ${p.banned ? '<span class="rank-badge" style="color:#ff6b6b">gesperrt</span>' : ''}<div class="small muted">${rankOf(p)?.name || ''} · ${p.post_count} Beiträge · seit ${fmtDay(p.created_at)}</div></div>
        ${editable ? memberAdminControls(p) : '<span class="small muted">' + (p.id === state.me.id ? 'Das bist du' : 'Gleicher oder höherer Rang') + '</span>'}
      </div>`;
    }).join('') || '<div class="empty">Niemand gefunden.</div>'}</section>`;
  $('#am-search').onsubmit = (e) => { e.preventDefault(); adminMembers(body, e.target.q.value.trim()); };
  (data || []).forEach((p) => {
    if (p.id !== state.me.id && (rankOf(p)?.position ?? 0) < myPos()) bindMemberAdmin(p, () => adminMembers(body, query));
  });
}

/* ================= Router ================= */
let routing = 0;
async function route() {
  const my = ++routing;
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map((x) => decodeURIComponent(x));
  const [a, b, c] = parts;
  $('#modal-root').innerHTML = '';
  const dd = $('#dd'); if (dd) dd.classList.add('hidden');
  window.scrollTo(0, 0);
  try {
    if (!a) await pageHome();
    else if (a === 'f') await pageForum(Number(b), Number(c) || 1);
    else if (a === 't') await pageThread(Number(b), c || 1);
    else if (a === 'neu') await pageNewThread(b ? Number(b) : null);
    else if (a === 'neue') await pageNewPosts();
    else if (a === 'suche') await pageSearch(b || '');
    else if (a === 'mitglieder') await pageMembers(Number(b) || 1);
    else if (a === 'team') await pageTeam();
    else if (a === 'u') await pageProfile(b);
    else if (a === 'einstellungen') await pageSettings();
    else if (a === 'benachrichtigungen') await pageNotifications();
    else if (a === 'login') { if (state.me) location.hash = '#/'; else pageLogin(); }
    else if (a === 'registrieren') { if (state.me) location.hash = '#/'; else pageRegister(); }
    else if (a === 'datenschutz') pagePrivacy();
    else if (a === 'admin') await pageAdmin(b || 'allgemein');
    else pageNotFound();
  } catch (e) {
    if (my === routing) {
      console.error(e);
      app().innerHTML = `<div class="wrap page full"><main><div class="notice err">Fehler beim Laden: ${esc(errMsg(e))}<br>Wenn das länger so bleibt, ist die Datenbank vielleicht pausiert.</div></main></div>`;
    }
  }
}
window.addEventListener('hashchange', route);

/* ================= Start ================= */
async function boot() {
  try {
    await loadBase();
    await loadMe();
    await loadUnread();
  } catch (e) {
    app().innerHTML = '<div class="wrap page full"><main><div class="notice err">Das Forum ist gerade nicht erreichbar. Bitte später erneut versuchen.</div></main></div>';
    return;
  }
  renderHeader();
  setupRealtime();
  await route();
  let lastUser = state.me?.id || null;
  sb.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
    setTimeout(async () => {
      await loadMe();
      const now = state.me?.id || null;
      if (now === lastUser && event !== 'USER_UPDATED') return;
      lastUser = now;
      await loadUnread();
      renderHeader();
      setupRealtime();
      route();
    }, 0);
  });
}
boot();
