/* GREY KNIGHT — static, Post.txt-driven archive. Vanilla JS, no dependencies. */
(() => {
'use strict';

/* ================= CONFIG (the only place you may ever need to touch) ================= */
const CFG = {
  photo: 'https://github.com/uuhjeike/GREY-KNIGHT/blob/main/file_00000000476081f68d9ae1965a7f37e6.png',
  // Tried in order: the file next to index.html first, then the raw GitHub copy.
  src: ['Post.txt', 'https://raw.githubusercontent.com/uuhjeike/GREY-KNIGHT/main/Post.txt'],
  idPrefix: 'grey-knight-',
  chunk: 10,        // posts rendered per step
  maxDom: 40,       // posts kept in the DOM; older/newer ones are recycled
  est: 380,         // estimated post height (px) for never-measured posts
  gap: 14,          // must equal .post margin-bottom in style.css
  fullText: 20000   // very long posts render this many characters first, rest on "Show full text"
};

/* ================= PURE LOGIC (no DOM) ================= */
const EXT = {};
const addExt = (k, list) => list.split(' ').forEach(e => { EXT[e] = k; });
addExt('photo', 'jpg jpeg png gif webp avif svg bmp ico jfif apng');
addExt('video', 'mp4 webm ogv mov m4v');
addExt('audio', 'mp3 wav ogg oga m4a aac flac opus weba');
addExt('file', 'pdf zip rar 7z tar gz tgz txt md html htm css js mjs json csv tsv xml doc docx xls xlsx ppt pptx odt ods odp rtf apk exe msi dmg iso epub mkv avi flv wmv 3gp ttf otf woff woff2 yml yaml sh py');

const FILETYPE = { pdf: 'PDF document', zip: 'ZIP archive', rar: 'RAR archive', '7z': '7z archive', tar: 'TAR archive', gz: 'GZ archive', tgz: 'TGZ archive',
  txt: 'Text file', md: 'Markdown', html: 'HTML document', htm: 'HTML document', css: 'Stylesheet', js: 'JavaScript', mjs: 'JavaScript', json: 'JSON data',
  csv: 'CSV data', tsv: 'TSV data', xml: 'XML data', doc: 'Word document', docx: 'Word document', xls: 'Spreadsheet', xlsx: 'Spreadsheet', ppt: 'Presentation',
  pptx: 'Presentation', apk: 'Android package', epub: 'E-book', mkv: 'Video file', avi: 'Video file' };

const PLAT = [['facebook.com', 'Facebook'], ['fb.com', 'Facebook'], ['fb.watch', 'Facebook'], ['instagram.com', 'Instagram'], ['x.com', 'X'], ['twitter.com', 'X'],
  ['tiktok.com', 'TikTok'], ['reddit.com', 'Reddit'], ['t.me', 'Telegram'], ['telegram.me', 'Telegram'], ['linkedin.com', 'LinkedIn'], ['threads.net', 'Threads'],
  ['pinterest.com', 'Pinterest'], ['discord.gg', 'Discord'], ['discord.com', 'Discord'], ['snapchat.com', 'Snapchat'], ['wa.me', 'WhatsApp'],
  ['whatsapp.com', 'WhatsApp'], ['vimeo.com', 'Vimeo'], ['twitch.tv', 'Twitch'], ['spotify.com', 'Spotify'], ['soundcloud.com', 'SoundCloud'],
  ['github.com', 'GitHub'], ['gitlab.com', 'GitLab'], ['medium.com', 'Medium'], ['tumblr.com', 'Tumblr'], ['bsky.app', 'Bluesky']];
const isPlat = host => PLAT.some(([d]) => host === d || host.endsWith('.' + d));
const platOf = host => { for (const [d, l] of PLAT) if (host === d || host.endsWith('.' + d)) return l; return host.replace(/^www\./, ''); };

const HINT = { photo: 'photo', photos: 'photo', image: 'photo', images: 'photo', video: 'video', videos: 'video', audio: 'audio', file: 'file', files: 'file' };
const BIT = { photo: 2, video: 4, audio: 8, file: 16, yt: 32, short: 64, link: 128 }; // 1 = text-only

const parseT = s => { const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(s); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

function ytParse(u) {
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = '', short = false;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const p = u.pathname.split('/').filter(Boolean);
    if (p[0] === 'watch') id = u.searchParams.get('v') || '';
    else if (p[0] === 'shorts') { id = p[1] || ''; short = true; }
    else if (p[0] === 'embed' || p[0] === 'v' || p[0] === 'live') id = p[1] || '';
  } else return null;
  if (!/^[\w-]{11}$/.test(id)) return null;
  return { id, short, t: parseT(u.searchParams.get('t') || u.searchParams.get('start') || '') };
}

/* Turns one URL into a media item, or null when it is not a usable http(s)/relative URL. */
function classify(raw, hint) {
  raw = (raw || '').trim();
  if (!raw) return null;
  let u, rel = false;
  try {
    if (/^https?:\/\//i.test(raw)) u = new URL(raw);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;          // javascript:, data:, ftp: ... never allowed
    else if (raw.startsWith('//')) u = new URL('https:' + raw);
    else { u = new URL(raw, typeof location !== 'undefined' ? location.href : 'http://localhost/'); rel = true; }
  } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase();
  const yt = ytParse(u);
  if (yt) return { k: yt.short ? 'short' : 'yt', id: yt.id, t: yt.t, u: u.href, o: u.href, n: 'YouTube', plat: 'YouTube' };

  let name = u.pathname.split('/').pop() || '';
  try { name = decodeURIComponent(name); } catch (e) { /* keep raw */ }
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  let kind = EXT[ext] || '';
  if (rel && !kind) return null;

  let final = u.href, gh = false;
  if (host === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (m && (kind || hint)) { final = 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3]; gh = true; if (!kind) kind = hint; }
    else if (hint && /^\/user-attachments\/assets\//.test(u.pathname)) kind = hint;
  } else if (!kind && hint && !isPlat(host)) kind = hint;

  return { k: kind || 'link', u: final, o: u.href, n: name || host, ext, plat: platOf(host), gh };
}

/* Finds post boundaries: every line made only of dashes is a delimiter. Lines inside ``` fences are ignored. */
function scan(t, fences) {
  const b = [], n = t.length;
  let pos = 0, start = 0, seen = false, pre = 0, fence = false;
  while (pos <= n) {
    let nl = t.indexOf('\n', pos);
    if (nl < 0) nl = n;
    let c = pos;
    while (c < nl && (t.charCodeAt(c) === 32 || t.charCodeAt(c) === 9)) c++;
    const ch = c < nl ? t.charCodeAt(c) : 0;
    if (fences && ch === 96 && t.startsWith('```', c)) fence = !fence;
    else if (ch === 45 && !fence) {
      let k = c;
      while (k < nl) { const x = t.charCodeAt(k); if (x !== 45 && x !== 32 && x !== 9) break; k++; }
      if (k === nl) { if (!seen) { seen = true; pre = pos; } else b.push(start, pos); start = nl + 1; }
    }
    if (nl >= n) break;
    pos = nl + 1;
  }
  if (seen && start < n) b.push(start, n);
  return { b, pre: seen ? pre : n, seen, unclosed: fence };
}

const KEY = /^(ID|DATE|TYPE|TITLE|TEXT|MEDIA|LINKS?|SOURCE)[ \t]*:[ \t]?(.*)$/;
const URLLINE = /^https?:\/\/\S+$/i;
const FENCE = /^\s*```/;

const sanitizeId = s => s.replace(/[^\w.~-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

function parsePost(raw) {
  const f = { id: '', date: '', type: '', title: '', text: [], media: [], link: [] };
  let cur = null, fence = false, adv = false;
  for (const line of raw.split('\n')) {
    const inText = cur === null || cur === 'text';
    if (inText && FENCE.test(line)) { fence = !fence; f.text.push(line); continue; }
    if (!fence) {
      const m = KEY.exec(line);
      if (m) {
        adv = true;
        const key = m[1], val = m[2];
        if (key === 'ID') { f.id = val.trim(); cur = null; }
        else if (key === 'DATE') { f.date = val.trim(); cur = null; }
        else if (key === 'TYPE') { f.type = val.trim(); cur = null; }
        else if (key === 'TITLE') { f.title = val.trim(); cur = null; }
        else if (key === 'TEXT') { cur = 'text'; if (val.trim()) f.text.push(val); }
        else if (key === 'MEDIA') { cur = 'media'; if (val.trim()) f.media.push(val); }
        else { cur = 'link'; if (val.trim()) f.link.push(val); }
        continue;
      }
    }
    if (cur === 'media') f.media.push(line);
    else if (cur === 'link') f.link.push(line);
    else f.text.push(line);
  }

  const hint = HINT[f.type.toLowerCase()] || '';
  const media = [];
  let lines = f.text;
  if (!adv) { // simple post: a line that is only a URL becomes embedded media
    const keep = [];
    let fz = false;
    for (const ln of lines) {
      if (FENCE.test(ln)) { fz = !fz; keep.push(ln); continue; }
      if (!fz && URLLINE.test(ln.trim())) { const it = classify(ln.trim(), ''); if (it) { media.push(it); continue; } }
      keep.push(ln);
    }
    lines = keep;
  }
  const addLines = arr => {
    for (const ln of arr) {
      const s = ln.trim();
      if (!s) continue;
      let parts, cap = '';
      const pi = s.search(/\s\|\s/);
      if (pi > 0) { cap = s.slice(pi).replace(/^\s\|\s*/, '').trim(); parts = [s.slice(0, pi)]; }
      else parts = s.split(/\s+/);
      for (const p of parts) { const it = classify(p, hint); if (it) { if (cap) it.cap = cap; media.push(it); } }
    }
  };
  addLines(f.media);
  addLines(f.link);

  const text = lines.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  let mask = 0;
  for (const it of media) mask |= BIT[it.k];
  if (!media.length) mask |= 1;
  return { id: sanitizeId(f.id), date: f.date, title: f.title, text, media, mask, mc: media.length };
}

function safeParse(raw) {
  try { return parsePost(raw); }
  catch (e) { return { id: '', date: '', title: '', text: raw.trim(), media: [], mask: 1, mc: 0, bad: true }; }
}

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
/* Posts without an ID: permanent ID derived from their content, so position never matters. */
const deriveId = raw => CFG.idPrefix + cyrb53(raw.trim()).toString(36).padStart(11, '0');

function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return s || '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d)) return s;
  let out = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (m[4]) out += ' ' + m[4] + ':' + m[5];
  return out;
}

if (typeof document === 'undefined') { // test hook for Node
  module.exports = { scan, parsePost, classify, deriveId, sanitizeId, fmtDate };
  return;
}

/* ================= DOM HELPERS ================= */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  if (a) for (const k in a) {
    const v = a[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const tick = () => new Promise(r => setTimeout(r, 0));
const nf = n => n.toLocaleString();

const feed = $('#feed'), top = $('#top'), tail = $('#tail'), stateEl = $('#state');
const cons = $('#console'), qEl = $('#q'), sortEl = $('#sort'), chips = $('#chips');
const noticeEl = $('#notice'), resultEl = $('#result');
const mqDesk = matchMedia('(min-width: 900px)');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* ================= INDEX (compact; full parse only for rendered posts) ================= */
let TEXT = '', N = 0, ST = [], EN = [], IDS = [], MASK = new Uint8Array(0), idMap = new Map();
let totalMedia = 0, newestAtBottom = true, ready = false;
const cache = new Map();

function getPost(k) {
  let p = cache.get(k);
  if (p) { cache.delete(k); cache.set(k, p); return p; }
  p = safeParse(TEXT.slice(ST[k], EN[k]));
  cache.set(k, p);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return p;
}

async function buildIndex(text) {
  TEXT = text; N = 0; ST = []; EN = []; IDS = []; idMap = new Map(); totalMedia = 0; cache.clear();
  let sc = scan(text, true);
  if (sc.unclosed) sc = scan(text, false); // an unclosed ``` must not swallow the archive
  const nb = sc.b.length / 2;
  MASK = new Uint8Array(nb);
  const seen = new Map();
  const dir = /^[ \t]*#?[ \t]*ORDER[ \t]*:[ \t]*(top|bottom)/im.exec(text.slice(0, sc.pre));
  newestAtBottom = dir ? dir[1].toLowerCase() === 'bottom' : true;

  let t0 = performance.now();
  for (let i = 0; i < nb; i++) {
    const s = sc.b[2 * i], e = sc.b[2 * i + 1];
    const raw = text.slice(s, e);
    if (raw.trim() === '') continue;
    const post = safeParse(raw);
    let id = post.id || deriveId(raw);
    const c = seen.get(id) || 0;
    seen.set(id, c + 1);
    if (c) { id += '-' + (c + 1); while (idMap.has(id)) id += 'x'; }
    const k = N++;
    ST[k] = s; EN[k] = e; IDS[k] = id; MASK[k] = post.mask;
    idMap.set(id, k);
    totalMedia += post.mc;
    if ((i & 127) === 0 && performance.now() - t0 > 24) {
      setState('Indexing archive… ' + Math.round(i / nb * 100) + '%', 'busy');
      await tick();
      t0 = performance.now();
    }
  }
}

/* ================= TEXT RENDERING (DOM nodes only, never innerHTML) ================= */
const INL = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>"'`]+)/g;
function addInline(p, s) {
  let last = 0, m;
  INL.lastIndex = 0;
  while ((m = INL.exec(s))) {
    if (m.index > last) p.append(s.slice(last, m.index));
    if (m[1]) p.append(h('code', { text: m[1].slice(1, -1) }));
    else if (m[2]) p.append(h('strong', { text: m[2].slice(2, -2) }));
    else {
      let u = m[3], tl = '';
      const mm = /[.,;:!?)\]}]+$/.exec(u);
      if (mm) { tl = mm[0]; u = u.slice(0, -tl.length); }
      let ok = false;
      try { ok = !!new URL(u).hostname; } catch (e) { /* not a URL */ }
      if (ok) { p.append(h('a', { href: u, target: '_blank', rel: 'noopener noreferrer nofollow', text: u })); if (tl) p.append(tl); }
      else p.append(m[3]);
    }
    last = INL.lastIndex;
  }
  if (last < s.length) p.append(s.slice(last));
}

/* Paragraphs, lists, quotes, code fences. Returns true when text was cut for the first render. */
function renderText(parent, text, limit) {
  let cut = false;
  if (limit && text.length > limit) {
    let i = text.lastIndexOf('\n\n', limit);
    if (i < limit * 0.5) i = limit;
    text = text.slice(0, i); cut = true;
  }
  const lines = text.split('\n');
  let kind = '', buf = [], ordered = false;
  const flush = () => {
    if (buf.length) {
      if (kind === 'p') { const p = h('p'); addInline(p, buf.join('\n')); parent.append(p); }
      else if (kind === 'q') { const q = h('blockquote'), p = h('p'); addInline(p, buf.join('\n')); q.append(p); parent.append(q); }
      else if (kind === 'l') { const l = h(ordered ? 'ol' : 'ul'); for (const t of buf) { const li = h('li'); addInline(li, t); l.append(li); } parent.append(l); }
    }
    buf = []; kind = '';
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (FENCE.test(ln)) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      parent.append(h('pre', null, h('code', { text: code.join('\n') })));
      continue;
    }
    if (!ln.trim()) { flush(); continue; }
    let k = 'p', val = ln, m;
    if ((m = /^\s{0,3}>\s?(.*)$/.exec(ln))) { k = 'q'; val = m[1]; }
    else if ((m = /^\s{0,3}(?:([-*•])|(\d{1,9}[.)]))\s+(.*)$/.exec(ln))) {
      k = 'l'; val = m[3];
      const ord = !!m[2];
      if (kind === 'l' && ord !== ordered) flush();
      ordered = ord;
    }
    if (k !== kind) { flush(); kind = k; }
    buf.push(val);
  }
  flush();
  return cut;
}

/* ================= POST RENDERING ================= */
const TAGS = [[2, 'photo', 'Photo'], [4, 'video', 'Video'], [8, 'audio', 'Audio'], [16, 'file', 'File'], [32, 'yt', 'YouTube'], [64, 'short', 'Short'], [128, 'link', 'Link']];

function mediaEl(it) {
  switch (it.k) {
    case 'photo': {
      const img = h('img', { class: 'm', src: it.u, alt: it.cap || it.n, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', 'data-o': it.o });
      const fig = h('figure', { class: 'cell' }, h('button', { class: 'zoom', type: 'button', 'data-act': 'zoom', 'aria-label': 'Open image' }, img));
      if (it.cap) fig.append(h('figcaption', { text: it.cap }));
      return fig;
    }
    case 'video': {
      const fig = h('figure', { class: 'cell' }, h('video', { class: 'm', controls: true, playsinline: true, preload: 'none', 'data-src': it.u, 'data-o': it.o }));
      if (it.cap) fig.append(h('figcaption', { text: it.cap }));
      return fig;
    }
    case 'audio':
      return h('div', { class: 'card' }, h('div', { class: 'cbody' },
        h('div', { class: 'cname', text: it.cap || it.n }),
        h('audio', { class: 'm', controls: true, preload: 'none', src: it.u, 'data-o': it.o })));
    case 'file': {
      const sub = h('div', { class: 'csub', text: FILETYPE[it.ext] || (it.ext ? it.ext.toUpperCase() + ' file' : 'File') });
      if (it.gh) sub.append(' · ', h('a', { href: it.o, target: '_blank', rel: 'noopener noreferrer', text: 'GitHub page' }));
      return h('div', { class: 'card' },
        h('span', { class: 'ficon', text: (it.ext || 'file').slice(0, 4) }),
        h('div', { class: 'cbody' }, h('div', { class: 'cname', text: it.cap || it.n }), sub),
        h('a', { class: 'btn', href: it.u, target: '_blank', rel: 'noopener noreferrer', download: true, text: 'Open' }));
    }
    case 'yt': case 'short': {
      const btn = h('button', { class: 'ytbtn', type: 'button', 'data-act': 'yt', 'aria-label': 'Play video' },
        h('img', { class: 'yt-thumb', src: 'https://i.ytimg.com/vi/' + it.id + '/hqdefault.jpg', alt: '', loading: 'lazy', decoding: 'async' }));
      const play = h('span', { class: 'play' }); play.innerHTML = ICON_PLAY; btn.append(play);
      const watch = 'https://www.youtube.com/' + (it.k === 'short' ? 'shorts/' + it.id : 'watch?v=' + it.id);
      return h('div', { class: 'ytwrap' },
        h('div', { class: 'yt' + (it.k === 'short' ? ' short' : ''), 'data-vid': it.id, 'data-t': it.t || false }, btn),
        h('a', { class: 'ytlink', href: watch, target: '_blank', rel: 'noopener noreferrer', text: it.cap || 'Open on YouTube' }));
    }
    default: {
      let label = it.cap;
      if (!label) { try { const u = new URL(it.o); label = u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : ''); } catch (e) { label = it.o; } }
      return h('a', { class: 'card lcard', href: it.o, target: '_blank', rel: 'noopener noreferrer' },
        h('span', { class: 'cbody' }, h('span', { class: 'lplat', text: it.plat }), h('span', { class: 'cname', text: label }), h('span', { class: 'csub clamp', text: it.o })),
        h('span', { class: 'btn go', text: 'Open' }));
    }
  }
}

function renderMedia(items) {
  const vis = [], wide = [];
  for (const it of items) (it.k === 'photo' || it.k === 'video' ? vis : wide).push(it);
  const box = h('div', { class: 'media' });
  if (vis.length) {
    const g = h('div', { class: 'grid' + (vis.some(i => i.k === 'video') ? ' hasv' : ''), 'data-n': Math.min(vis.length, 5) });
    for (const it of vis) g.append(mediaEl(it));
    box.append(g);
  }
  for (const it of wide) box.append(mediaEl(it));
  return box;
}

function buildBody(post, full) {
  const body = h('div', { class: 'pb' });
  if (post.bad) body.append(h('p', { class: 'warn', text: 'This entry could not be fully read. Showing the raw text.' }));
  if (post.text) {
    if (renderText(body, post.text, full ? 0 : CFG.fullText)) body.append(h('button', { class: 'btn more', type: 'button', 'data-act': 'more', text: 'Show full text' }));
  }
  if (post.media.length) body.append(renderMedia(post.media));
  return body;
}

function renderPost(k) {
  const post = getPost(k), id = IDS[k];
  const el = h('article', { class: 'post', tabindex: '-1', 'data-id': id });
  const head = h('header', { class: 'ph' }, h('a', { class: 'pid', href: '?post=' + encodeURIComponent(id), 'data-act': 'open', title: 'Permanent link', text: id }));
  const ds = fmtDate(post.date);
  if (ds) head.append(h('time', { class: 'pdate', datetime: post.date, text: ds }));
  el.append(head);
  if (post.title) el.append(h('h3', { class: 'pt', text: post.title }));
  el.append(buildBody(post, false));
  const foot = h('footer', { class: 'pf' });
  const tags = h('div', { class: 'tags' });
  for (const [bit, key, label] of TAGS) {
    if (!(post.mask & bit)) continue;
    const n = post.media.filter(i => i.k === key).length;
    tags.append(h('span', { class: 'tag', text: n > 1 ? label + ' ×' + n : label }));
  }
  foot.append(tags, h('button', { class: 'btn', type: 'button', 'data-act': 'copy', text: 'Copy link' }));
  el.append(foot);
  return el;
}

function mkEl(p) {
  const k = recAt(p);
  let el;
  try { el = renderPost(k); }
  catch (e) {
    el = h('article', { class: 'post bad', 'data-id': IDS[k] }, h('p', { class: 'warn', text: 'This entry could not be displayed.' }));
  }
  io.observe(el);
  return el;
}

/* ================= VIEW + WINDOWED FEED ================= */
const FBIT = { all: 0, text: 1, photo: 2, video: 4, audio: 8, files: 16, youtube: 32, shorts: 64, links: 128 };
const state = { filter: 'all', q: '', terms: [], newestFirst: true };
let view = null, viewDone = true, viewGen = 0;       // view === null means "all posts" (no array needed)
let first = 0, last = 0, topH = 0, heights = [], raf = 0, lastY = 0;
const rev = () => state.newestFirst === newestAtBottom;
const viewLen = () => view ? view.length : N;
const recAt = p => view ? view[p] : (rev() ? N - 1 - p : p);

const io = new IntersectionObserver(es => { for (const e of es) e.isIntersecting ? wake(e.target) : sleep(e.target); }, { rootMargin: '1000px 0px' });
function wake(el) {
  for (const v of el.querySelectorAll('video[data-src]')) if (!v.getAttribute('src')) { v.preload = 'metadata'; v.src = v.dataset.src; }
}
function sleep(el) {
  for (const v of el.querySelectorAll('video')) if (v.getAttribute('src') && v.paused) { v.removeAttribute('src'); v.load(); }
  for (const f of el.querySelectorAll('iframe')) if (f._fb) f.replaceWith(f._fb);
}
const sentinels = new IntersectionObserver(() => schedule(), { rootMargin: '1500px 0px' });
sentinels.observe(top); sentinels.observe(tail);

const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

function clearFeed() {
  let n;
  while ((n = top.nextElementSibling) && n !== tail) { io.unobserve(n); n.remove(); }
}
function resetWindow(start) {
  clearFeed();
  first = last = start; heights = [];
  topH = start > 0 ? Math.min(start * CFG.est, 6e6) : 0;
  top.style.height = topH + 'px';
}
function withAnchor(fn) {
  let a = null, y = 0;
  for (let el = top.nextElementSibling; el && el !== tail; el = el.nextElementSibling) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0) { a = el; y = r.top; break; }
  }
  fn();
  if (a && a.isConnected) { const d = a.getBoundingClientRect().top - y; if (Math.abs(d) > 0.5) window.scrollBy(0, d); }
}
function appendChunk() {
  const end = Math.min(last + CFG.chunk, viewLen());
  const frag = document.createDocumentFragment();
  for (let p = last; p < end; p++) frag.append(mkEl(p));
  tail.before(frag); last = end;
}
function prependChunk() {
  const start = Math.max(0, first - CFG.chunk);
  let sub = 0;
  for (let p = start; p < first; p++) sub += heights[p] || CFG.est;
  topH = start === 0 ? 0 : Math.max(0, topH - sub);
  top.style.height = topH + 'px';
  const frag = document.createDocumentFragment();
  for (let p = start; p < first; p++) frag.append(mkEl(p));
  top.after(frag); first = start;
}
function trim(vh) {
  const lim = Math.max(1400, vh * 1.6);
  let g = 0;
  while (last - first > CFG.maxDom && g++ < CFG.chunk * 2) {
    const el = top.nextElementSibling, r = el.getBoundingClientRect();
    if (r.bottom > -lim) break;
    const hh = r.height + CFG.gap;
    heights[first] = hh; topH += hh; first++;
    io.unobserve(el); el.remove();
    top.style.height = topH + 'px';
  }
  g = 0;
  while (last - first > CFG.maxDom && g++ < CFG.chunk * 2) {
    const el = tail.previousElementSibling, r = el.getBoundingClientRect();
    if (r.top < vh + lim) break;
    io.unobserve(el); el.remove(); last--;
  }
}

function update() {
  raf = 0;
  if (!ready) return;
  const vh = innerHeight, buf = Math.max(900, vh * 1.2), len = viewLen();
  let again = false, g = 0;
  while (first > 0) {
    if (top.getBoundingClientRect().bottom < -buf) break;
    if (g++ >= 6) { again = true; break; }
    withAnchor(prependChunk);
  }
  g = 0;
  while (last < len) {
    if (tail.getBoundingClientRect().top > vh + buf) break;
    if (g++ >= 6) { again = true; break; }
    appendChunk();
  }
  trim(vh);
  updateStatus();
  if (again) schedule();
}

function updateStatus() {
  if (!ready) return;
  const len = viewLen();
  const filtered = !!view;
  resultEl.hidden = !filtered;
  if (filtered) resultEl.textContent = (viewDone ? '' : 'Searching… ') + nf(len) + ' of ' + nf(N) + ' entries';
  if (len === 0) setState(!viewDone ? 'Searching…' : N === 0 ? 'No posts yet. Add one to Post.txt between two lines that each contain a single “-”.' : 'No posts match this search.', !viewDone ? 'busy' : '');
  else if (last >= len) setState(viewDone ? 'Oldest entry reached.' : 'Searching…', viewDone ? '' : 'busy');
  else setState('', '');
}

let stateKey = '';
function setState(msg, kind, retry) {
  const key = msg + '|' + kind + '|' + (retry ? 1 : 0);
  if (key === stateKey) return;
  stateKey = key;
  stateEl.hidden = !msg;
  stateEl.dataset.kind = kind || '';
  stateEl.replaceChildren();
  if (msg) stateEl.append(h('p', { text: msg }));
  if (retry) stateEl.append(h('button', { class: 'btn', type: 'button', 'data-act': 'reload', text: 'Try again' }));
}

/* ----- filter / search / sort ----- */
const TYPEWORDS = [[1, 'text'], [2, 'photo image picture'], [4, 'video'], [8, 'audio sound'], [16, 'file files download'], [32, 'youtube'], [64, 'shorts short'], [128, 'link links social']];
function matches(k, terms) {
  let w = '';
  const m = MASK[k];
  for (const [b, s] of TYPEWORDS) if (m & b) w += ' ' + s;
  const hay = (IDS[k] + w + ' ' + TEXT.slice(ST[k], EN[k])).toLowerCase();
  for (const t of terms) if (!hay.includes(t)) return false;
  return true;
}

async function scanView(gen, bit, terms) {
  const out = view, r = rev();
  let t0 = performance.now(), shown = 0;
  for (let p = 0; p < N; p++) {
    if ((p & 255) === 0 && performance.now() - t0 > 14) {
      if (out.length > shown) { shown = out.length; schedule(); }
      updateStatus();
      await tick();
      if (gen !== viewGen) return;
      t0 = performance.now();
    }
    const k = r ? N - 1 - p : p;
    if (bit && !(MASK[k] & bit)) continue;
    if (terms.length && !matches(k, terms)) continue;
    out.push(k);
  }
  if (gen !== viewGen) return;
  viewDone = true;
  schedule(); updateStatus();
}

function toFeedTop() {
  const y = feed.getBoundingClientRect().top + scrollY - (mqDesk.matches ? 16 : cons.offsetHeight + 10);
  if (scrollY > y) window.scrollTo(0, Math.max(0, y));
}

function applyView() {
  const gen = ++viewGen, bit = FBIT[state.filter], terms = state.terms;
  if (!bit && !terms.length) { view = null; viewDone = true; }
  else { view = []; viewDone = false; }
  resetWindow(0);
  toFeedTop();
  if (view) scanView(gen, bit, terms);
  update(); updateStatus();
}

function syncControls() {
  qEl.value = state.q;
  for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.f === state.filter));
  sortEl.textContent = state.newestFirst ? 'Newest first' : 'Oldest first';
}
function clearFilters() {
  state.filter = 'all'; state.q = ''; state.terms = [];
  view = null; viewDone = true; viewGen++;
  syncControls();
}

chips.addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (!c || state.filter === c.dataset.f) return;
  state.filter = c.dataset.f; syncControls(); applyView();
});
sortEl.addEventListener('click', () => { state.newestFirst = !state.newestFirst; syncControls(); applyView(); });
let qTimer = 0;
const runSearch = () => {
  clearTimeout(qTimer);
  const q = qEl.value.trim().toLowerCase();
  if (q === state.q) return;
  state.q = q; state.terms = q.split(/\s+/).filter(Boolean); applyView();
};
qEl.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(runSearch, 220); });
qEl.addEventListener('keydown', e => { if (e.key === 'Enter') { runSearch(); qEl.blur(); } });

/* ----- permanent links ----- */
function permalink(id) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  u.searchParams.set('post', id);
  return u.href;
}
function paramId() {
  const q = new URLSearchParams(location.search).get('post');
  if (q) return q.trim();
  const m = /[#&]post=([^&]+)/.exec(location.hash);
  if (m) { try { return decodeURIComponent(m[1]).trim(); } catch (e) { return m[1]; } }
  return '';
}
function showNotice(msg) { $('#noticeText').textContent = msg; noticeEl.hidden = false; }
function hideNotice() { noticeEl.hidden = true; }
function scrollToEl(el) {
  const off = mqDesk.matches ? 16 : cons.offsetHeight + 10;
  window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - off));
  cons.classList.remove('away'); lastY = scrollY;
}
function flash(el) {
  el.classList.remove('flash'); void el.offsetWidth;
  el.classList.add('flash');
  el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove('flash'), 2800);
}

function openPost(id, push) {
  const k = idMap.get(id);
  if (k === undefined) { showNotice('No post with ID “' + id + '”.'); return false; }
  hideNotice();
  let p = view ? view.indexOf(k) : -1;
  if (p < 0) { clearFilters(); p = rev() ? N - 1 - k : k; }
  if (push) history.pushState(null, '', permalink(id));
  resetWindow(p);
  appendChunk();
  const el = top.nextElementSibling;
  scrollToEl(el); flash(el);
  update();
  return true;
}
function goHome(push) {
  hideNotice();
  if (state.filter !== 'all' || state.terms.length || qEl.value) clearFilters();
  if (push && (location.search || location.hash)) history.pushState(null, '', location.pathname);
  resetWindow(0);
  window.scrollTo(0, 0);
  update(); updateStatus();
}
function route(push) { const id = paramId(); if (id) { if (!openPost(id, false)) goHome(false); } else goHome(false); }

/* ----- feed interactions (single delegated listeners) ----- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800);
}
async function copyLink(id, btn) {
  const url = permalink(id);
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; }
  catch (e) {
    try {
      const ta = h('textarea', { readonly: true, style: 'position:fixed;opacity:0;top:0' });
      ta.value = url; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch (e2) { ok = false; }
  }
  if (ok) { toast('Link copied'); const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1500); }
  else window.prompt('Copy this link', url);
}
function playYT(btn) {
  const box = btn.closest('.yt'), t = +box.dataset.t || 0;
  const f = h('iframe', { class: 'yt-frame', src: 'https://www.youtube-nocookie.com/embed/' + box.dataset.vid + '?autoplay=1&playsinline=1&rel=0' + (t ? '&start=' + t : ''),
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen', allowfullscreen: true,
    title: 'YouTube video player', referrerpolicy: 'strict-origin-when-cross-origin' });
  f._fb = btn; btn.replaceWith(f);
}
function expand(post) {
  const k = idMap.get(post.dataset.id);
  if (k === undefined) return;
  const old = post.querySelector('.pb');
  if (old) old.replaceWith(buildBody(getPost(k), true));
  schedule();
}

feed.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || !feed.contains(t)) return;
  const post = t.closest('.post'), act = t.dataset.act;
  if (act === 'copy') copyLink(post.dataset.id, t);
  else if (act === 'open') { e.preventDefault(); openPost(post.dataset.id, true); }
  else if (act === 'zoom') { e.preventDefault(); openViewer(post, t); }
  else if (act === 'yt') playYT(t);
  else if (act === 'more') expand(post);
});
stateEl.addEventListener('click', e => { if (e.target.closest('[data-act="reload"]')) load(); });
$('#noticeBtn').addEventListener('click', () => goHome(true));
$('#home').addEventListener('click', e => { e.preventDefault(); goHome(true); });

/* A broken media file only affects its own box. (error/load/loadedmetadata don't bubble, so capture.) */
function failCard(box, o, what) {
  const f = h('div', { class: 'fail' }, h('span', { text: what + ' unavailable. ' }));
  if (o) f.append(h('a', { href: o, target: '_blank', rel: 'noopener noreferrer', text: 'Open source' }));
  box.replaceChildren(f);
}
feed.addEventListener('error', e => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.matches('img.yt-thumb')) { t.remove(); return; }
  if (!t.matches('img.m, video.m, audio.m')) return;
  const box = t.closest('.cell, .cbody');
  if (box) failCard(box, t.dataset.o, t.localName === 'img' ? 'Image' : t.localName === 'video' ? 'Video' : 'Audio');
}, true);
feed.addEventListener('load', e => {
  const t = e.target;
  if (t.localName === 'img' && t.classList.contains('m') && t.naturalWidth) t.classList.toggle('tall', t.naturalHeight / t.naturalWidth > 2.2);
}, true);
feed.addEventListener('loadedmetadata', e => {
  const v = e.target;
  if (v.localName === 'video' && v.videoWidth) v.style.aspectRatio = v.videoWidth + ' / ' + v.videoHeight;
}, true);

/* ================= IMAGE VIEWER (zoom, swipe, pinch, fullscreen) ================= */
const V = { el: $('#viewer'), img: $('#vimg'), stage: $('#vstage'), count: $('#vcount'), list: [], i: 0, s: 1, x: 0, y: 0, open: false, pushed: false, from: null };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const fsReq = V.el.requestFullscreen || V.el.webkitRequestFullscreen;
if (!fsReq) $('#vfs').hidden = true;

function vApply() { V.img.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.s + ')'; }
function vClamp() {
  const mx = Math.max(0, (V.img.clientWidth * V.s - V.stage.clientWidth) / 2), my = Math.max(0, (V.img.clientHeight * V.s - V.stage.clientHeight) / 2);
  V.x = clamp(V.x, -mx, mx); V.y = clamp(V.y, -my, my);
}
function vZoom(s) { V.s = clamp(s, 1, 8); if (V.s === 1) V.x = V.y = 0; vClamp(); vApply(); }
function vShow(i) {
  const n = V.list.length;
  V.i = (i + n) % n;
  const it = V.list[V.i];
  V.img.src = it.src; V.img.alt = it.alt || '';
  V.count.textContent = n > 1 ? (V.i + 1) + ' / ' + n : '';
  V.el.classList.toggle('single', n < 2);
  V.s = 1; V.x = V.y = 0; vApply();
}
function openList(list, idx, from) {
  V.list = list; V.from = from;
  V.el.hidden = false; V.open = true;
  document.documentElement.classList.add('lock');
  history.pushState({ v: 1 }, '', location.href); V.pushed = true;
  vShow(idx);
  $('#vclose').focus();
}
function openViewer(post, btn) {
  const imgs = [...post.querySelectorAll('button.zoom img.m')];
  const me = btn.querySelector('img');
  openList(imgs.map(i => ({ src: i.currentSrc || i.src, alt: i.alt })), Math.max(0, imgs.indexOf(me)), btn);
}
function vClose(fromPop) {
  if (!V.open) return;
  V.open = false; V.el.hidden = true; V.img.removeAttribute('src');
  document.documentElement.classList.remove('lock');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!fromPop && V.pushed) history.back();
  V.pushed = false;
  if (V.from && V.from.isConnected) V.from.focus({ preventScroll: true });
}
V.el.addEventListener('click', e => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const a = b.dataset.v;
  if (a === 'close') vClose(false);
  else if (a === 'next') vShow(V.i + 1);
  else if (a === 'prev') vShow(V.i - 1);
  else if (a === 'in') vZoom(V.s * 1.5);
  else if (a === 'out') vZoom(V.s / 1.5);
  else if (a === 'fs') { if (document.fullscreenElement) document.exitFullscreen(); else if (fsReq) fsReq.call(V.el); }
});
document.addEventListener('keydown', e => {
  if (!V.open) return;
  if (e.key === 'Escape') vClose(false);
  else if (e.key === 'ArrowRight') vShow(V.i + 1);
  else if (e.key === 'ArrowLeft') vShow(V.i - 1);
  else if (e.key === '+' || e.key === '=') vZoom(V.s * 1.5);
  else if (e.key === '-') vZoom(V.s / 1.5);
  else if (e.key === 'f' && fsReq) { if (document.fullscreenElement) document.exitFullscreen(); else fsReq.call(V.el); }
});
V.stage.addEventListener('wheel', e => { e.preventDefault(); vZoom(V.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
{
  const P = new Map(), g = { d0: 1, s0: 1, moved: 0, sx: 0, sy: 0, t: 0, tap: 0 };
  V.stage.addEventListener('pointerdown', e => {
    V.stage.setPointerCapture(e.pointerId);
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.size === 1) { g.sx = e.clientX; g.sy = e.clientY; g.moved = 0; g.t = performance.now(); }
    if (P.size === 2) { const [a, b] = [...P.values()]; g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; g.s0 = V.s; }
  });
  V.stage.addEventListener('pointermove', e => {
    const p = P.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; g.moved += Math.abs(dx) + Math.abs(dy);
    if (P.size === 2) { const [a, b] = [...P.values()]; V.s = clamp(g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, 1, 8); }
    else if (V.s > 1) { V.x += dx; V.y += dy; }
    if (V.s === 1) V.x = V.y = 0;
    vClamp(); vApply();
  });
  const end = e => {
    if (!P.has(e.pointerId)) return;
    const single = P.size === 1;
    P.delete(e.pointerId);
    if (!single || e.type === 'pointercancel') return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy, now = performance.now();
    if (V.s === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { vShow(V.i + (dx < 0 ? 1 : -1)); return; }
    if (g.moved < 8 && now - g.t < 350) {
      if (now - g.tap < 320) { vZoom(V.s > 1 ? 1 : 2.5); g.tap = 0; } else g.tap = now;
    }
  };
  V.stage.addEventListener('pointerup', end);
  V.stage.addEventListener('pointercancel', end);
}
{
  const av = $('#avatar'), img = $('#avatarImg');
  const it = classify(CFG.photo, 'photo');
  if (it) {
    img.addEventListener('load', () => { av.hidden = false; });
    img.addEventListener('error', () => { av.hidden = true; });
    img.src = it.u;
    av.addEventListener('click', () => openList([{ src: it.u, alt: 'GREY KNIGHT' }], 0, av));
  }
}

/* ================= BOOT ================= */
addEventListener('popstate', () => { if (V.open) { vClose(true); return; } if (ready) route(false); });
addEventListener('resize', schedule);
addEventListener('scroll', () => {
  const y = scrollY;
  if (!mqDesk.matches && document.activeElement !== qEl) {
    if (y > lastY + 8 && y > 180) cons.classList.add('away');
    else if (y < lastY - 8 || y <= 180) cons.classList.remove('away');
  }
  lastY = y;
  schedule();
}, { passive: true });
qEl.addEventListener('focus', () => cons.classList.remove('away'));

function setStatus(text, ok) { $('#statusText').textContent = text; $('#dot').className = 'dot' + (ok === true ? ' on' : ok === false ? ' off' : ''); }

async function load() {
  ready = false; resetWindow(0); resultEl.hidden = true;
  setStatus('Connecting'); setState('Loading archive…', 'busy');
  let text = null, err = null;
  for (const u of CFG.src) {
    try {
      const res = await fetch(u, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      text = await res.text();
      break;
    } catch (e) { err = e; }
  }
  if (text === null) {
    setStatus('Archive offline', false);
    setState('Could not load Post.txt (' + (err && err.message ? err.message : 'network error') + '). Check that the file exists and that you are online.', 'error', true);
    return;
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (text.indexOf('\r') >= 0) text = text.replace(/\r\n?/g, '\n');
  await buildIndex(text);
  $('#nPosts').textContent = nf(N);
  $('#nMedia').textContent = nf(totalMedia);
  setStatus('Archive online', true);
  stateKey = '';
  ready = true;
  syncControls();
  route(false);
}
load();
})();
