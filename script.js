'use strict';
/* GREY KNIGHT — archive engine.
   CODE = ENGINE, Post.txt = CONTENT. Add posts by editing Post.txt only. */

const CONFIG = {
  idPrefix: 'GREY-KNIGHT-',
  // tried in order; the first that answers is used
  sources: [
    'https://raw.githubusercontent.com/uuhjeike/GREY-KNIGHT/main/Post.txt',
    'Post.txt'
  ],
  chunk: 16,          // posts per rendered chunk
  maxChunks: 12,      // chunks kept in the DOM at once (older/further ones are recycled)
  recheckMs: 300000   // how often to look for new records while the reader sits at the bottom
};

/*<core>*/
/* ===================== parsing, classification, index ===================== */
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => MAP[c]);

// cyrb53 — used only to give a *temporary* ID to posts that have no ID line
function h53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const synthId = raw =>
  CONFIG.idPrefix + 'U' + h53(raw.trim().replace(/\s+/g, ' ')).toString(36).toUpperCase().padStart(11, '0');

const ID_RE = /^GREY-KNIGHT-[A-Z0-9][A-Z0-9_-]*$/;

// GitHub "blob"/"raw" page URL -> raw.githubusercontent.com
function ghRaw(url) {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^?#]+)/i.exec(url);
  return m ? 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] : url;
}

const EXT = {};
for (const [kind, list] of Object.entries({
  photo: 'png jpg jpeg gif webp avif bmp svg ico apng jfif',
  video: 'mp4 webm ogv mov m4v mkv',
  audio: 'mp3 wav ogg oga m4a aac flac opus weba',
  file: 'pdf zip txt html htm css js mjs json xml csv md doc docx xls xlsx ppt pptx rar 7z tar gz tgz apk exe iso epub rtf log yml yaml py rs c cpp h java sh bat'
})) for (const e of list.split(' ')) EXT[e] = kind;

const YT = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i;
const SOCIAL = /(^|\.)(twitter\.com|x\.com|instagram\.com|facebook\.com|fb\.com|fb\.watch|tiktok\.com|reddit\.com|redd\.it|t\.me|telegram\.me|threads\.net|linkedin\.com|pinterest\.com|snapchat\.com|discord\.gg|discord\.com|tumblr\.com|mastodon\.social|bsky\.app|twitch\.tv|vimeo\.com|wa\.me|whatsapp\.com)$/i;

// -> { kind: photo|video|audio|file|yt|short|github|social|link|bad, url, src, host, name, id? }
function classify(input) {
  const src = String(input).trim();
  const o = { kind: 'link', url: src, src, host: '', name: '' };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(src);
  if (scheme && !/^https?$/i.test(scheme[1])) { o.kind = 'bad'; return o; }
  if (scheme) {
    o.url = ghRaw(src);
    try { o.host = new URL(o.url).hostname.replace(/^www\./, '').toLowerCase(); }
    catch (e) { o.kind = 'bad'; return o; }
  }
  const y = YT.exec(src);
  if (y) { o.kind = /\/shorts\//i.test(src) ? 'short' : 'yt'; o.id = y[1]; o.host = 'youtube.com'; return o; }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(o.host)) { o.bad = 'Unrecognised YouTube link'; return o; }
  const path = o.url.split(/[?#]/)[0];
  let nm = path.split('/').pop() || o.host;
  try { nm = decodeURIComponent(nm); } catch (e) { /* keep raw */ }
  o.name = nm;
  const em = /\.([a-z0-9]{1,5})$/i.exec(path);
  let k = em && EXT[em[1].toLowerCase()];
  if (k === 'file' && /^html?$/i.test(em[1]) && !/github/.test(o.host)) k = null; // web pages are links, not downloads
  if (k) { o.kind = k; return o; }
  if (o.host === 'raw.githubusercontent.com') { o.kind = 'file'; return o; }
  if (/^(gist\.)?github\.com$/.test(o.host)) { o.kind = 'github'; return o; }
  if (SOCIAL.test(o.host)) o.kind = 'social';
  return o;
}

// bit flags: TEXT 1, PHOTO 2, VIDEO 4, AUDIO 8, FILE 16, YOUTUBE 32, SHORT 64, LINK 128
function flagsOf(text, media) {
  let f = /\S/.test(text) ? 1 : 0;
  for (const m of media) {
    switch (m.kind) {
      case 'photo': f |= 2; break;
      case 'video': f |= 4; break;
      case 'audio': f |= 8; break;
      case 'file': f |= 16; break;
      case 'yt': f |= 32; break;
      case 'short': f |= 96; break;   // a Short is also a YouTube video
      default: f |= 128;
    }
  }
  return f;
}
const MEDIA_KINDS = { photo: 1, video: 1, audio: 1, file: 1, yt: 1, short: 1 };
const KIND_WORDS = [[1, 'text'], [2, 'photo'], [2, 'image'], [4, 'video'], [8, 'audio'], [16, 'file'], [16, 'files'],
  [32, 'youtube'], [64, 'short'], [64, 'shorts'], [128, 'link'], [128, 'links']];
const kindWords = f => KIND_WORDS.filter(([b]) => f & b).map(([, w]) => w);

/* ---- text -> safe HTML (TXT is data; everything is escaped) ---- */
function fmtInline(s) {
  let h = esc(s);
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g,
    u => '<a href="' + u + '" target="_blank" rel="noopener noreferrer nofollow">' + u + '</a>');
  return h;
}
function renderText(t) {
  const lines = t.split('\n'), out = [];
  let para = [], list = null, quote = [], i = 0;
  const fP = () => { if (para.length) { out.push('<p>' + para.map(fmtInline).join('<br>') + '</p>'); para = []; } };
  const fL = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(x => '<li>' + fmtInline(x) + '</li>').join('') + '</' + list.t + '>'); list = null; } };
  const fQ = () => { if (quote.length) { out.push('<blockquote>' + quote.map(fmtInline).join('<br>') + '</blockquote>'); quote = []; } };
  while (i < lines.length) {
    const ln = lines[i];
    let m;
    if (/^\s*```/.test(ln)) {
      fP(); fL(); fQ();
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
      continue;
    }
    if ((m = /^\s*>\s?(.*)$/.exec(ln))) { fP(); fL(); quote.push(m[1]); i++; continue; }
    if ((m = /^\s*[-*•]\s+(.+)$/.exec(ln))) {
      fP(); fQ();
      if (!list || list.t !== 'ul') { fL(); list = { t: 'ul', items: [] }; }
      list.items.push(m[1]); i++; continue;
    }
    if ((m = /^\s*\d{1,4}[.)]\s+(.+)$/.exec(ln))) {
      fP(); fQ();
      if (!list || list.t !== 'ol') { fL(); list = { t: 'ol', items: [] }; }
      list.items.push(m[1]); i++; continue;
    }
    if (!ln.trim()) { fP(); fL(); fQ(); i++; continue; }
    fL(); fQ(); para.push(ln); i++;
  }
  fP(); fL(); fQ();
  return out.join('');
}

/* ---- one post: simple (just text) or advanced (ID/DATE/TYPE/TITLE/TEXT/MEDIA/LINK) ---- */
const KEY = /^(ID|DATE|TYPE|TITLE|TEXT|MEDIA|LINK):[ \t]*(.*?)[ \t]*$/;
function parsePost(raw) {
  const lines = raw.split(/\r?\n/);
  let k = 0;
  while (k < lines.length && !lines[k].trim()) k++;
  const adv = k < lines.length && KEY.test(lines[k]);
  const f = { ID: '', DATE: '', TYPE: '', TITLE: '', TEXT: [], MEDIA: [], LINK: [] };
  if (!adv) f.TEXT = lines;
  else {
    let cur = 'TEXT';
    for (const line of lines) {
      const m = KEY.exec(line);
      if (m) {
        cur = m[1];
        if (cur === 'TEXT' || cur === 'MEDIA' || cur === 'LINK') { if (m[2]) f[cur].push(m[2]); }
        else f[cur] = m[2];
        continue;
      }
      if (cur === 'TEXT' || cur === 'MEDIA' || cur === 'LINK') f[cur].push(line);
      else if (line.trim()) { cur = 'TEXT'; f.TEXT.push(line); }
    }
  }
  const media = [], keep = [];
  let fence = false;
  for (const line of f.TEXT) {            // a line that is only a URL becomes media / a link card
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && /^\s*https?:\/\/\S+\s*$/.test(line)) media.push(classify(line.trim()));
    else keep.push(line);
  }
  for (const l of f.MEDIA) for (const tok of l.trim().split(/\s+/)) if (tok) media.push(classify(tok));
  for (const l of f.LINK) {
    const t = l.trim();
    if (!t) continue;
    let label = '', u = t;
    const bar = t.indexOf('|');
    if (bar > 0) { label = t.slice(0, bar).trim(); u = t.slice(bar + 1).trim(); }
    const m = classify(u.split(/\s+/)[0]);
    if (m.kind === 'photo' || m.kind === 'video' || m.kind === 'audio' || m.kind === 'file') m.kind = 'link';
    if (label) m.label = label;
    media.push(m);
  }
  const text = keep.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  const explicit = f.ID.trim().toUpperCase();
  const p = {
    adv, type: f.TYPE.trim().toLowerCase(), title: f.TITLE.trim(), date: f.DATE.trim(),
    text, media, id: '', idBad: false, idRaw: '', synthetic: false,
    flags: flagsOf(text, media), mediaCount: media.filter(m => MEDIA_KINDS[m.kind]).length
  };
  if (explicit) {
    if (ID_RE.test(explicit)) p.id = explicit;
    else { p.idBad = true; p.idRaw = f.ID.trim(); }
  } else { p.id = synthId(raw); p.synthetic = true; }
  return p;
}

/* ---- "-" delimiter segmentation (time-sliced so 100k+ posts never freeze a phone) ----
   A line that is only "-" opens or closes a post. Text found outside a post opens one
   implicitly, so both  "-\nA\n-\n\n-\nB\n-"  and shared dashes "-\nA\n-\nB\n-"  work. */
function makeSegmenter(T) {
  const st = { pos: 0, inside: false, start: 0 }, n = T.length;
  return {
    run(budgetMs, emit) {
      const t0 = performance.now();
      let { pos, inside, start } = st, c = 0;
      while (pos < n) {
        let nl = T.indexOf('\n', pos);
        if (nl < 0) nl = n;
        let a = pos;
        while (a < nl && T.charCodeAt(a) <= 32) a++;
        if (a < nl) {
          let delim = false;
          if (T.charCodeAt(a) === 45) {
            let b = a + 1;
            while (b < nl && T.charCodeAt(b) <= 32) b++;
            delim = b >= nl;
          }
          if (delim) {
            if (inside) { emit(start, pos); inside = false; }
            else { inside = true; start = nl + 1; }
          } else if (!inside) { inside = true; start = pos; }
        }
        pos = nl + 1;
        if ((++c & 127) === 0 && performance.now() - t0 > budgetMs) {
          st.pos = pos; st.inside = inside; st.start = start;
          return false;
        }
      }
      if (inside) emit(start, n);
      st.pos = n;
      return true;
    }
  };
}

/* ---- index: offsets + flags + permanent IDs. Post bodies are parsed on demand. ---- */
function newDB(text) {
  return {
    T: text, S: [], E: [], F: [], I: [], mediaTotal: 0, done: false,
    idMap: new Map(),   // ID -> post index | -1 retired | -2 duplicated
    dups: new Map(), problems: [], pc: 0, unpinned: [], maxNum: 0, width: 6,
    profile: null, retired: 0, cache: new Map()
  };
}
const addProblem = (db, msg) => { db.pc++; if (db.problems.length < 500) db.problems.push(msg); };
function trackNum(db, id) {
  const m = /^GREY-KNIGHT-(\d+)$/.exec(id);
  if (!m) return;
  db.maxNum = Math.max(db.maxNum, Number(m[1]));
  db.width = Math.max(db.width, m[1].length);
}
function claim(db, id, val) {
  if (db.idMap.has(id)) { db.dups.set(id, (db.dups.get(id) || 1) + 1); db.idMap.set(id, -2); }
  else db.idMap.set(id, val);
}
function register(db, s, e) {
  const raw = db.T.slice(s, e);
  if (!/\S/.test(raw)) return;
  let p = null;
  try { p = parsePost(raw); } catch (err) { /* handled below */ }
  if (!p) {
    addProblem(db, 'A record could not be parsed: ' + raw.slice(0, 60).replace(/\s+/g, ' '));
    p = { id: synthId(raw), synthetic: true, type: '', flags: 1, mediaCount: 0, idBad: false };
  }
  if (p.type === 'profile') { if (!db.profile) db.profile = p; return; }
  if (p.type === 'retired') {            // tombstone: keeps an ID reserved forever
    if (p.synthetic || p.idBad) { addProblem(db, 'A retired record needs a valid ID line.'); return; }
    trackNum(db, p.id); claim(db, p.id, -1); db.retired++;
    return;
  }
  const i = db.S.length;
  db.S.push(s); db.E.push(e); db.F.push(p.flags); db.I.push(p.idBad ? '' : p.id);
  db.mediaTotal += p.mediaCount;
  if (p.idBad) addProblem(db, 'Invalid ID “' + p.idRaw + '” — IDs must look like GREY-KNIGHT-000123.');
  else {
    if (p.synthetic) db.unpinned.push(i); else trackNum(db, p.id);
    claim(db, p.id, i);
  }
}
async function buildIndex(db, onTick) {
  const seg = makeSegmenter(db.T);
  for (;;) {
    const fin = seg.run(10, (s, e) => register(db, s, e));
    if (fin) break;
    onTick(false);
    await new Promise(r => setTimeout(r, 0));
  }
  db.done = true;
  onTick(true);
}
function getPost(db, i) {
  let p = db.cache.get(i);
  if (p) return p;
  const raw = db.T.slice(db.S[i], db.E[i]);
  try { p = parsePost(raw); }
  catch (e) { p = { broken: true, text: raw.slice(0, 2000), media: [], id: '', flags: 1 }; }
  db.cache.set(i, p);
  if (db.cache.size > 800) db.cache.delete(db.cache.keys().next().value);
  return p;
}
// Post.txt with ID lines added to every post that has none (new IDs continue after the highest one used)
function pinnedText(db) {
  let num = db.maxNum, out = '', prev = 0;
  for (const i of db.unpinned) {
    const s = db.S[i];
    num++;
    const p = getPost(db, i);
    out += db.T.slice(prev, s) + 'ID: ' + CONFIG.idPrefix + String(num).padStart(db.width, '0') + '\n' + (p.adv ? '' : 'TEXT:\n');
    prev = s;
  }
  return out + db.T.slice(prev);
}
if (typeof module !== 'undefined') {
  module.exports = { classify, parsePost, makeSegmenter, newDB, register, buildIndex, getPost, pinnedText, renderText, flagsOf, ghRaw, esc, CONFIG };
}
/*</core>*/

/* ============================== interface ============================== */
if (typeof document !== 'undefined') (function () {
  const $ = id => document.getElementById(id);
  const C = CONFIG.chunk, MAXSP = 6e6;
  const feedWrap = $('feedWrap'), topSp = $('topSpacer'), topS = $('topS'), rows = $('rows'), botS = $('botS'),
    tailEl = $('tail'), emptyEl = $('empty'), noticeEl = $('notice'), statusEl = $('status'),
    qEl = $('q'), barEl = $('bar'), chipsEl = $('chips');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = n => n.toLocaleString();
  const MEDIA_MASK = 2 | 4 | 8 | 32 | 64;

  let db = null, view = null, rev = false, mask = 0, terms = [], scanTok = 0, scanning = false;
  let started = false, syncedAt = 0, srcUsed = CONFIG.sources[0], permId = null, lock = null;
  let topH = 0, hSum = 0, hCnt = 0, skipNext = false, lastCheck = 0, newAvail = false, busy = false;
  const win = { first: 0, last: -1 }, chunkH = new Map();

  /* ---------- helpers ---------- */
  function permalink(id) {
    const u = new URL(location.href);
    u.hash = ''; u.search = '';
    u.pathname = u.pathname.replace(/index\.html$/, '');
    u.searchParams.set('post', id);
    return u.toString();
  }
  function copyText(s) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
    return new Promise((res, rej) => {
      const t = document.createElement('textarea');
      t.value = s; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
      t.remove();
    });
  }
  const smooth = () => (reduce ? 'auto' : 'smooth');
  const indexDone = () => new Promise(r => { const D = db; (function w() { if (!D || D.done || D !== db) r(); else setTimeout(w, 30); })(); });
  const vlen = () => (view ? view.length : db.S.length);
  const nChunks = () => Math.ceil(vlen() / C);
  const posToIdx = k => (view ? view[k] : rev ? db.S.length - 1 - k : k);
  const est = () => (hCnt ? hSum / hCnt : 1600);

  /* ---------- rendering one post ---------- */
  function cardHTML(m, label) {
    const name = m.label || shortUrl(m);
    return '<a class="m card src" href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer"><span class="ext">' + esc(label) +
      '</span><span class="t"><b>' + esc(name) + '</b><small>' + esc(m.bad || m.host || 'Open source') + '</small></span></a>';
  }
  function shortUrl(m) {
    const s = m.url.replace(/^https?:\/\/(www\.)?/, '');
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }
  function platform(m) {
    const root = m.host.split('.').slice(-2, -1)[0] || m.host;
    const map = { x: 'X', t: 'Telegram', wa: 'WhatsApp', fb: 'Facebook', redd: 'Reddit' };
    return map[root] || root.charAt(0).toUpperCase() + root.slice(1);
  }
  function itemHTML(m) {
    switch (m.kind) {
      case 'video':
        return '<figure class="m m-vid pend"><video controls playsinline preload="none" data-src="' + esc(m.url) + '"></video></figure>';
      case 'audio':
        return '<div class="m m-aud"><span class="fname">' + esc(m.name) + '</span><audio controls preload="none" data-src="' + esc(m.url) + '"></audio></div>';
      case 'yt': case 'short':
        return '<div class="m yt' + (m.kind === 'short' ? ' short' : '') + '" data-yt="' + esc(m.id) + '"><button type="button" class="yt-play" aria-label="Play video">' +
          '<img src="https://i.ytimg.com/vi/' + esc(m.id) + '/hqdefault.jpg" alt="" loading="lazy"></button></div>';
      case 'file': {
        const ext = (/\.([a-z0-9]{1,5})$/i.exec(m.name) || [, 'FILE'])[1].toUpperCase();
        return '<a class="m card file" href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer" download><span class="ext">' + esc(ext) +
          '</span><span class="t"><b>' + esc(m.name) + '</b><small>Download file</small></span></a>';
      }
      case 'github': return cardHTML(m, 'GitHub');
      case 'social': return cardHTML(m, platform(m));
      case 'bad': return '<div class="m card bad"><span class="t"><b>Unsupported link</b><small>' + esc(m.src) + '</small></span></div>';
      default: return cardHTML(m, 'Link');
    }
  }
  function mediaHTML(p) {
    let out = '', gal = [];
    const flush = () => { if (gal.length) { out += '<div class="gal c' + Math.min(gal.length, 4) + '">' + gal.join('') + '</div>'; gal = []; } };
    for (const m of p.media) {
      if (m.kind === 'photo') {
        gal.push('<figure class="m-img pend"><img src="' + esc(m.url) + '" alt="' + esc(p.title || ('Image in ' + (p.id || 'post'))) + '" loading="lazy" decoding="async" data-v></figure>');
      } else { flush(); out += itemHTML(m); }
    }
    flush();
    return out;
  }
  function postHTML(idx) {
    const D = db, p = getPost(D, idx);
    if (p.broken) {
      return '<article class="rec k-err"><div class="rec-in"><span class="spine"></span><div class="body"><p class="rec-err">This record could not be read.</p><pre>' + esc(p.text) + '</pre></div></div></article>';
    }
    const v = p.idBad ? null : D.idMap.get(p.id);
    let err = '';
    if (p.idBad) err = 'Invalid ID “' + p.idRaw + '”. IDs must start with ' + CONFIG.idPrefix + ' — this record has no permanent link.';
    else if (v === -2) err = 'Duplicate ID — ' + (D.dups.get(p.id) || 2) + ' records share this ID in Post.txt. It has no permanent link until that is fixed.';
    else if (v === -1) err = 'This ID is also marked as retired. Fix Post.txt so one ID identifies one post.';
    const link = err ? '' : permalink(p.id);
    const kind = err ? 'k-err' : p.media.length ? 'k-media' : 'k-text';
    let h = '<article class="rec ' + kind + '"' + (err ? '' : ' data-id="' + esc(p.id) + '"') + '><div class="rec-in"><span class="spine"></span><div class="body">';
    h += '<div class="rec-head">';
    h += link ? '<a class="rec-id" href="' + esc(link) + '">' + esc(p.id) + '</a>' : '<span class="rec-id">' + esc(p.id || 'No valid ID') + '</span>';
    if (p.date) h += '<time class="rec-date">' + esc(p.date) + '</time>';
    if (p.synthetic && !err) h += '<span class="rec-temp">Temporary ID — add an ID: line to Post.txt to make it permanent</span>';
    h += '</div>';
    if (err) h += '<p class="rec-err">' + esc(err) + '</p>';
    if (p.title) h += '<h2 class="rec-title">' + esc(p.title) + '</h2>';
    if (p.text) h += '<div class="rec-text">' + renderText(p.text) + '</div>';
    if (p.media.length) h += mediaHTML(p);
    if (link) h += '<div class="rec-foot"><button type="button" class="copy" data-copy="' + esc(link) + '">Copy link</button></div>';
    return h + '</div></div></article>';
  }

  /* ---------- windowed, chunked feed ---------- */
  const lazyIO = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) {
      const t = e.target; lazyIO.unobserve(t);
      t.preload = 'metadata'; t.src = t.dataset.src;
    }
  }, { rootMargin: '800px' });
  const observeLazy = el => el.querySelectorAll('[data-src]').forEach(x => lazyIO.observe(x));

  function setTop(h) { topH = Math.max(0, h); topSp.style.height = topH + 'px'; }
  function chunkEl(c) {
    const sec = document.createElement('section');
    sec.className = 'chunk'; sec.dataset.c = c;
    const a = c * C, b = Math.min(vlen(), a + C);
    let h = '';
    for (let k = a; k < b; k++) h += postHTML(posToIdx(k));
    sec.innerHTML = h; sec.dataset.n = b - a;
    return sec;
  }
  function appendChunk() {
    if (!db || (rev && !view && !db.done)) return false;
    const c = win.last + 1;
    if (c >= nChunks()) return false;
    const el = chunkEl(c);
    rows.appendChild(el); win.last = c; observeLazy(el);
    return true;
  }
  function topUpLast() {
    const el = rows.lastElementChild;
    if (!el || win.last < 0) return;
    const need = Math.min(C, vlen() - win.last * C), have = +el.dataset.n;
    if (need > have) {
      let h = '';
      for (let k = win.last * C + have; k < win.last * C + need; k++) h += postHTML(posToIdx(k));
      el.insertAdjacentHTML('beforeend', h);
      el.dataset.n = need;
      observeLazy(el);
    }
  }
  function anchorEl() {
    for (const ch of rows.children) {
      if (ch.getBoundingClientRect().bottom <= 0) continue;
      for (const a of ch.children) if (a.getBoundingClientRect().bottom > 0) return a;
    }
    return rows.firstElementChild && rows.firstElementChild.firstElementChild;
  }
  function prependChunk() {
    const c = win.first - 1;
    if (c < 0) return false;
    const anchor = anchorEl(), before = anchor ? anchor.getBoundingClientRect().top : 0;
    setTop(c === 0 ? 0 : topH - (chunkH.has(c) ? chunkH.get(c) : est()));
    const el = chunkEl(c);
    rows.insertBefore(el, rows.firstChild); win.first = c; observeLazy(el);
    if (anchor) {                       // keep what the reader is looking at exactly where it was
      const d = anchor.getBoundingClientRect().top - before;
      if (d) { skipNext = true; window.scrollBy(0, d); }
    }
    return true;
  }
  function remember(c, h) { if (!chunkH.has(c)) { hSum += h; hCnt++; } chunkH.set(c, h); }
  function trim() {                     // recycle chunks that are far off-screen
    const vh = innerHeight, far = Math.max(3500, vh * 3);
    while (win.last - win.first + 1 > CONFIG.maxChunks) {
      const fe = rows.firstElementChild, le = rows.lastElementChild;
      const dTop = -fe.getBoundingClientRect().bottom, dBot = le.getBoundingClientRect().top - vh;
      if (Math.max(dTop, dBot) < far) break;
      if (dTop >= dBot) {
        const h = fe.offsetHeight; remember(win.first, h);
        fe.remove(); win.first++; setTop(topH + h);   // spacer takes over the removed height exactly
      } else { le.remove(); win.last--; }
    }
  }
  function fill() {
    if (busy || !db || !started) return;
    busy = true;
    try {
      topUpLast();
      const vh = innerHeight, m = 1400;
      for (let g = 0; g < 12; g++) {
        if (botS.getBoundingClientRect().top < vh + m && win.last < nChunks() - 1 && appendChunk()) continue;
        if (win.first > 0 && topS.getBoundingClientRect().bottom > -m && prependChunk()) continue;
        break;
      }
      trim();
      if (db.done && !scanning && win.last >= nChunks() - 1 && botS.getBoundingClientRect().top < vh + 400) maybeRecheck();
    } finally { busy = false; }
  }
  new IntersectionObserver(() => fill(), { rootMargin: '1400px 0px' }).observe(topS);
  new IntersectionObserver(() => fill(), { rootMargin: '1400px 0px' }).observe(botS);
  addEventListener('resize', fill);

  function startFeed(jumpTop) {
    chunkH.clear(); rows.textContent = '';
    win.first = 0; win.last = -1; setTop(0);
    hideNotice(); feedWrap.hidden = false;
    if (jumpTop) scrollToFeed();
    appendChunk(); fill(); updateStatus();
  }
  function showFrom(c) {                // render around chunk c without rendering anything before it
    chunkH.clear(); rows.textContent = '';
    setTop(Math.min(c * est(), MAXSP));
    win.first = c; win.last = c - 1;
    appendChunk();
  }
  function scrollToFeed() {
    const y = Math.max(0, feedWrap.getBoundingClientRect().top + scrollY - barEl.offsetHeight - 8);
    if (scrollY > y) scrollTo(0, y);
  }

  /* ---------- permanent links ---------- */
  function focusEl(el) {
    el.scrollIntoView({ block: 'start' });
    el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 2800);
    lock = { el, until: performance.now() + 4000 };   // re-align while images above it finish loading
  }
  async function gotoPost(id) {
    permId = null;
    await indexDone();
    const D = db, v = D.idMap.get(id);
    if (v === undefined) return showNotice('notfound', id);
    if (v === -1) return showNotice('retired', id);
    if (v === -2) return showNotice('dup', id);
    hideNotice(); feedWrap.hidden = false;
    scanTok++; scanning = false; view = null; terms = []; mask = 0; qEl.value = ''; syncControls();
    document.title = id + ' — GREY KNIGHT';
    const k = rev ? D.S.length - 1 - v : v;
    showFrom(Math.floor(k / C));
    const el = rows.querySelector('[data-id="' + id + '"]');
    if (el) focusEl(el);
    updateStatus(); fill();
  }
  function showNotice(type, id) {
    feedWrap.hidden = true;
    const t = {
      notfound: ['POST NOT FOUND', 'No post with the ID <span class="id">' + esc(id) + '</span> exists in Post.txt. No other post has been substituted.'],
      retired: ['POST RETIRED', 'The ID <span class="id">' + esc(id) + '</span> was retired. It stays reserved and will never point to a different post.'],
      dup: ['DUPLICATE ID', 'Post.txt contains ' + ((db.dups.get(id) || 2)) + ' posts with the ID <span class="id">' + esc(id) + '</span>. One ID must identify exactly one post, so none of them is shown here. Fix Post.txt.']
    }[type];
    noticeEl.innerHTML = '<section class="notice"><h2>' + t[0] + '</h2><p>' + t[1] + '</p><button type="button" class="btn" data-act="browse">Browse the archive</button>' +
      (type === 'dup' ? ' <button type="button" class="btn" data-act="check">Open data check</button>' : '') + '</section>';
    updateStatus();
  }
  function hideNotice() { noticeEl.innerHTML = ''; renderBanner(); }
  function renderBanner() {
    if (!db || noticeEl.querySelector('.notice')) return;
    const n = db.dups.size + db.pc;
    noticeEl.innerHTML = n ? '<div class="notice-bar">Data error in Post.txt (' + n + '). <button type="button" class="linkish" data-act="check">Open data check</button></div>' : '';
  }
  noticeEl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'browse') {
      const u = new URL(location.href); u.searchParams.delete('post'); history.replaceState(null, '', u);
      document.title = 'GREY KNIGHT'; applyView(true);
    } else if (a === 'check') openCheck();
    else if (a === 'retry') boot();
  });

  /* ---------- search + filters ---------- */
  function match(D, k) {
    if (mask && !(D.F[k] & mask)) return false;
    if (!terms.length) return true;
    const low = D.T.slice(D.S[k], D.E[k]).toLowerCase() + '\n' + D.I[k].toLowerCase();
    const kw = kindWords(D.F[k]);
    for (const t of terms) if (!low.includes(t) && !kw.includes(t)) return false;
    return true;
  }
  function applyView(jumpTop) {
    const tok = ++scanTok;
    terms = qEl.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    scanning = false;
    syncControls();
    if (!terms.length && !mask) { view = null; startFeed(jumpTop); return; }
    view = []; startFeed(jumpTop);
    runScan(tok);
  }
  async function runScan(tok) {
    scanning = true; updateStatus();
    if (!db.done) { await indexDone(); if (tok !== scanTok) return; }
    const D = db, V = view, N = D.S.length, step = rev ? -1 : 1;
    let k = rev ? N - 1 : 0;
    while (k >= 0 && k < N) {
      const t0 = performance.now();
      while (k >= 0 && k < N && performance.now() - t0 < 8) {
        for (let j = 0; j < 200 && k >= 0 && k < N; j++, k += step) if (match(D, k)) V.push(k);
      }
      updateStatus(); fill();
      await new Promise(r => setTimeout(r, 0));
      if (tok !== scanTok) return;
    }
    scanning = false; updateStatus(); fill();
  }
  function syncControls() {
    chipsEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.f === mask)));
    document.querySelectorAll('[data-nav]').forEach(b => b.removeAttribute('aria-current'));
    const cur = mask === MEDIA_MASK ? 'media' : 'posts';
    const nb = document.querySelector('[data-nav="' + cur + '"]'); if (nb) nb.setAttribute('aria-current', 'true');
    $('qClear').hidden = !qEl.value;
  }
  function setMask(m) { mask = m; applyView(true); }
  chipsEl.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) setMask(+c.dataset.f); });
  let qTimer = 0;
  qEl.addEventListener('input', () => { $('qClear').hidden = !qEl.value; clearTimeout(qTimer); qTimer = setTimeout(() => applyView(true), 250); });
  $('qClear').addEventListener('click', () => { qEl.value = ''; applyView(true); qEl.focus(); });
  $('rev').addEventListener('click', e => {
    rev = !rev; e.currentTarget.setAttribute('aria-pressed', String(rev));
    e.currentTarget.textContent = rev ? 'File order' : 'Reverse order';
    applyView(true);
  });
  $('nav').addEventListener('click', e => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    const a = b.dataset.nav;
    if (a === 'profile') scrollTo({ top: 0, behavior: smooth() });
    else if (a === 'posts') { if (mask || terms.length) { qEl.value = ''; mask = 0; applyView(true); } else scrollToFeed(); }
    else if (a === 'media') { mask = MEDIA_MASK; applyView(true); }
    else if (a === 'search') { barEl.classList.remove('hide'); scrollToFeed(); qEl.focus(); }
  });

  function updateStatus() {
    if (!db) return;
    const L = vlen();
    let s;
    if (!db.done && !view) s = fmt(L) + ' records indexed…';
    else if (view) s = fmt(L) + (L === 1 ? ' match' : ' matches') + (scanning ? ' so far…' : '');
    else s = fmt(L) + (L === 1 ? ' record' : ' records');
    statusEl.textContent = s;
    const none = L === 0 && db.done && !scanning && !noticeEl.querySelector('.notice');
    emptyEl.hidden = !none;
    if (none) emptyEl.textContent = view ? 'No records match. Clear the search or choose another filter.' : 'No records yet. Add a post to Post.txt and it appears here.';
  }
  function setStats() {
    $('stRecords').textContent = fmt(db.S.length) + (db.done ? '' : '+');
    $('stMedia').textContent = fmt(db.mediaTotal) + (db.done ? '' : '+');
    $('stSync').textContent = syncedAt ? new Date(syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function renderTail() {
    tailEl.innerHTML = newAvail
      ? '<button type="button" class="btn" data-act="reload">New records available — load them</button>'
      : '<span>Synced ' + (syncedAt ? new Date(syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '</span>';
  }
  tailEl.addEventListener('click', e => { if (e.target.closest('[data-act=reload]')) boot(true); });
  async function maybeRecheck() {
    if (newAvail || document.hidden || Date.now() - lastCheck < CONFIG.recheckMs) return;
    lastCheck = Date.now();
    try {
      const r = await fetch(srcUsed, { cache: 'no-cache' });
      if (!r.ok) return;
      let t = await r.text();
      if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
      if (t !== db.T) { newAvail = true; renderTail(); }
    } catch (e) { /* offline: try again later */ }
  }

  /* ---------- loading ---------- */
  function tick(final) {
    setStats();
    if (!started) {
      if (permId !== null) { if (final) { started = true; gotoPost(permId); } }
      else if ((!rev && (db.S.length >= C || final)) || (rev && final)) { started = true; startFeed(false); }
    } else { fill(); updateStatus(); }
    if (final) { applyProfile(); updateCheckBadge(); renderBanner(); renderTail(); updateStatus(); }
  }
  async function load() {
    let text = null, err;
    for (const u of CONFIG.sources) {
      try {
        const r = await fetch(u, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        text = await r.text(); srcUsed = u; break;
      } catch (e) { err = e; }
    }
    if (text === null) throw err || new Error('No source answered');
    const D = newDB(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
    db = D; syncedAt = Date.now(); lastCheck = Date.now(); newAvail = false;
    if (started) applyView(false);
    buildIndex(D, fin => { if (D === db) tick(fin); });
  }
  async function boot(isReload) {
    statusEl.textContent = 'Loading Post.txt…';
    try { await load(); }
    catch (e) {
      feedWrap.hidden = true;
      noticeEl.innerHTML = '<section class="notice"><h2>POST.TXT UNAVAILABLE</h2><p>The archive could not be fetched (' + esc(e.message || e) +
        '). Check that Post.txt exists in the repository and that you are online.</p><button type="button" class="btn" data-act="retry">Try again</button></section>';
      statusEl.textContent = 'Could not load Post.txt';
    }
  }

  /* ---------- profile ---------- */
  const prof = { list: [], i: 0 };
  const plate = $('plate');
  function showPlate(i) {
    prof.i = i; plate.src = prof.list[i];
    document.querySelectorAll('.th').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  }
  function applyProfile() {
    const p = db && db.profile;
    if (!p) return;
    if (p.title) $('tagline').textContent = p.title;
    if (p.text) { $('bio').textContent = p.text; $('bio').hidden = false; }
    const extra = p.media.filter(m => m.kind === 'photo').map(m => m.url).filter(u => !prof.list.includes(u));
    if (extra.length) {
      prof.list = prof.list.slice(0, 1).concat(extra);
      const th = $('thumbs'); th.hidden = false; th.textContent = '';
      prof.list.forEach((u, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'th'; b.setAttribute('aria-label', 'Show profile photo ' + (i + 1));
        const im = document.createElement('img'); im.src = u; im.alt = ''; im.loading = 'lazy';
        b.appendChild(im); b.addEventListener('click', () => showPlate(i)); th.appendChild(b);
      });
      showPlate(prof.i);
    }
  }
  prof.list = [ghRaw(plate.dataset.photo)];
  plate.src = prof.list[0];
  plate.addEventListener('error', () => { plate.alt = 'Profile photo unavailable'; });
  $('plateBtn').addEventListener('click', () => vOpen(prof.list, prof.i));

  /* ---------- feed interactions (delegated) ---------- */
  feedWrap.addEventListener('click', e => {
    const t = e.target;
    const cp = t.closest('[data-copy]');
    if (cp) {
      copyText(cp.dataset.copy).then(() => 'Link copied', () => 'Copy failed').then(msg => {
        const old = cp.dataset.label || cp.textContent; cp.dataset.label = old; cp.textContent = msg;
        setTimeout(() => { cp.textContent = old; }, 1700);
      });
      return;
    }
    const img = t.closest('img[data-v]');
    if (img) {
      const imgs = Array.from(img.closest('.rec').querySelectorAll('img[data-v]'));
      vOpen(imgs.map(i => i.currentSrc || i.src), imgs.indexOf(img));
      return;
    }
    const yp = t.closest('.yt-play');
    if (yp) {
      const box = yp.closest('.yt'), f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(box.dataset.yt) + '?autoplay=1&rel=0&playsinline=1';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true; f.title = 'YouTube video player'; f.referrerPolicy = 'strict-origin-when-cross-origin';
      yp.replaceWith(f);
    }
  });
  // a broken image/video/audio never breaks the feed
  feedWrap.addEventListener('error', e => {
    const t = e.target;
    if (!t || !t.tagName) return;
    const src = t.getAttribute('src') || t.dataset.src || '';
    const box = t.closest('.m-img, .m-vid, .m-aud');
    if (box && /^(IMG|VIDEO|AUDIO)$/.test(t.tagName)) {
      box.classList.remove('pend');
      box.innerHTML = '<div class="fail">' + (t.tagName === 'IMG' ? 'Image' : t.tagName === 'VIDEO' ? 'Video' : 'Audio') +
        ' unavailable. <a href="' + esc(src) + '" target="_blank" rel="noopener noreferrer">Open source</a></div>';
    } else if (t.tagName === 'IMG' && t.closest('.yt')) t.style.display = 'none';
    realign();   // fallback boxes change heights above a jumped-to post
  }, true);
  function realign() {
    if (lock && performance.now() < lock.until && document.contains(lock.el)) lock.el.scrollIntoView({ block: 'start' });
  }
  function onMedia(e) {
    const p = e.target.closest && e.target.closest('.pend');
    if (p) p.classList.remove('pend');
    realign();
  }
  feedWrap.addEventListener('load', onMedia, true);
  feedWrap.addEventListener('loadedmetadata', onMedia, true);
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev => addEventListener(ev, () => { lock = null; }, { passive: true }));

  // the search bar slips away while reading downward on phones
  const small = matchMedia('(max-width: 979px)');
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (skipNext) { skipNext = false; lastY = y; return; }
    if (small.matches) {
      if (y > lastY + 8 && y > 240) barEl.classList.add('hide');
      else if (y < lastY - 8) barEl.classList.remove('hide');
    }
    lastY = y;
  }, { passive: true });
  barEl.addEventListener('focusin', () => barEl.classList.remove('hide'));

  /* ---------- data check ---------- */
  function updateCheckBadge() {
    const n = db.dups.size + db.pc, b = $('checkN');
    b.hidden = !n; b.textContent = n;
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function openCheck() {
    const D = db; if (!D) return;
    const errs = [];
    for (const [id, c] of D.dups) errs.push('Duplicate ID ' + id + ' — ' + c + ' records share it.');
    for (const m of D.problems) errs.push(m);
    const next = CONFIG.idPrefix + String(D.maxNum + 1).padStart(D.width, '0');
    let h = '<h2>Data check</h2><dl>' +
      '<dt>Records</dt><dd>' + fmt(D.S.length) + '</dd>' +
      '<dt>Retired IDs</dt><dd>' + fmt(D.retired) + '</dd>' +
      '<dt>Next free ID</dt><dd>' + esc(next) + '</dd>' +
      '<dt>Temporary IDs</dt><dd>' + fmt(D.unpinned.length) + (D.unpinned.length ? ' (posts with no ID line)' : '') + '</dd>' +
      '<dt>Source</dt><dd>' + esc(srcUsed) + '</dd></dl>';
    h += errs.length ? '<p>Problems found:</p><ul>' + errs.slice(0, 200).map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' +
      (errs.length > 200 ? '<p>…and ' + (errs.length - 200) + ' more.</p>' : '') : '<p>No ID problems found.</p>';
    if (D.unpinned.length) h += '<p>Posts without an ID line get a temporary ID built from their text, so their links break if the text is edited. Download a copy of Post.txt with permanent IDs added (numbered after the highest ID in use), then replace Post.txt in the repository with it.</p>';
    $('checkBody').innerHTML = h;
    const act = $('checkActions'); act.textContent = '';
    const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label; b.addEventListener('click', fn); act.appendChild(b); };
    if (D.unpinned.length) mk('Download Post.txt with IDs added', () => download('Post.txt', pinnedText(D)));
    mk('Reload Post.txt', () => { $('check').close(); boot(true); });
    mk('Close', () => $('check').close());
    $('check').showModal();
  }
  $('checkBtn').addEventListener('click', openCheck);

  /* ---------- image viewer: zoom, pan, pinch, swipe, fullscreen, prev/next ---------- */
  const V = { el: $('viewer'), img: $('vImg'), list: [], i: 0, s: 1, x: 0, y: 0, pts: new Map(), d0: 0, s0: 1, moved: false, sx: 0, sy: 0, tap: 0, from: null };
  const vApply = () => { V.img.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.s + ')'; };
  function vShow() {
    V.s = 1; V.x = 0; V.y = 0; vApply();
    V.img.src = V.list[V.i];
    $('vCount').textContent = V.list.length > 1 ? (V.i + 1) + ' / ' + V.list.length : '';
    $('vPrev').hidden = $('vNext').hidden = V.list.length < 2;
  }
  function vOpen(list, i) {
    V.list = list; V.i = i; V.from = document.activeElement; V.el.hidden = false;
    document.documentElement.style.overflow = 'hidden'; vShow(); $('vClose').focus();
  }
  function vClose() {
    V.el.hidden = true; document.documentElement.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen();
    if (V.from && V.from.focus) V.from.focus();
  }
  function vStep(d) { if (V.list.length > 1) { V.i = (V.i + d + V.list.length) % V.list.length; vShow(); } }
  function vZoom(f, cx, cy) {
    const ns = Math.min(8, Math.max(1, V.s * f));
    const r = V.el.getBoundingClientRect();
    const px = (cx === undefined ? r.left + r.width / 2 : cx) - r.left - r.width / 2;
    const py = (cy === undefined ? r.top + r.height / 2 : cy) - r.top - r.height / 2;
    V.x = px - (px - V.x) * (ns / V.s); V.y = py - (py - V.y) * (ns / V.s); V.s = ns;
    if (ns === 1) { V.x = 0; V.y = 0; }
    vApply();
  }
  $('vClose').addEventListener('click', vClose);
  $('vPrev').addEventListener('click', () => vStep(-1));
  $('vNext').addEventListener('click', () => vStep(1));
  $('vZoomIn').addEventListener('click', () => vZoom(1.5));
  $('vZoomOut').addEventListener('click', () => vZoom(1 / 1.5));
  $('vFull').addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : (V.el.requestFullscreen && V.el.requestFullscreen().catch(() => {})); });
  V.el.addEventListener('wheel', e => { e.preventDefault(); vZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
  V.el.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    V.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    V.moved = false; V.sx = e.clientX; V.sy = e.clientY;
    if (V.pts.size === 2) { const [a, b] = [...V.pts.values()]; V.d0 = Math.hypot(a.x - b.x, a.y - b.y); V.s0 = V.s; }
  });
  V.el.addEventListener('pointermove', e => {
    const p = V.pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (V.pts.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...V.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (V.d0) vZoom((V.s0 * d / V.d0) / V.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      V.moved = true;
    } else if (V.s > 1) { V.x += dx; V.y += dy; p.x = e.clientX; p.y = e.clientY; vApply(); V.moved = true; }
    else { p.x = e.clientX; p.y = e.clientY; if (Math.abs(e.clientX - V.sx) > 6) V.moved = true; }
  });
  function vUp(e) {
    const had = V.pts.delete(e.pointerId);
    if (!had || V.pts.size) return;
    const dx = e.clientX - V.sx, dy = e.clientY - V.sy;
    if (V.s === 1 && Math.abs(dx) > 60 && Math.abs(dy) < 50) { vStep(dx < 0 ? 1 : -1); return; }
    if (!V.moved) {
      const now = performance.now();
      if (now - V.tap < 320) { V.s > 1 ? vZoom(1 / V.s) : vZoom(2.5, e.clientX, e.clientY); V.tap = 0; }
      else V.tap = now;
    }
  }
  V.el.addEventListener('pointerup', vUp);
  V.el.addEventListener('pointercancel', e => V.pts.delete(e.pointerId));
  addEventListener('keydown', e => {
    if (V.el.hidden) return;
    if (e.key === 'Escape') vClose();
    else if (e.key === 'ArrowLeft') vStep(-1);
    else if (e.key === 'ArrowRight') vStep(1);
    else if (e.key === '+' || e.key === '=') vZoom(1.5);
    else if (e.key === '-') vZoom(1 / 1.5);
  });

  /* ---------- start ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const qp = new URLSearchParams(location.search).get('post');
  if (qp !== null) permId = qp.trim().toUpperCase();
  syncControls();
  boot();
})();
