(()=>{'use strict';
const set=s=>new Set(s.split(' ')),$=s=>document.querySelector(s),PROFILE_IMAGE='https://github.com/uuhjeike/GREY-KNIGHT/blob/main/file_00000000476081f68d9ae1965a7f37e6.png',CHUNK=20;
const IMGX=set('jpg jpeg png gif webp avif bmp svg'),VIDX=set('mp4 webm ogv mov m4v'),AUDX=set('mp3 wav ogg oga m4a flac aac opus'),FILX=set('pdf zip rar 7z gz tar txt html htm css js json csv doc docx xls xlsx ppt pptx md apk epub');
const KEYS=set('ID DATE TYPE TITLE CONTENT MEDIA FILES LINKS SOURCE TAGS ORDER'),VIS=set('photo video youtube shorts');
const st={posts:[],byId:new Map(),view:[],filter:'all',q:'',skipped:0};let blocks=0,avg=320;
const feed=$('#feed'),qEl=$('#q'),stateEl=$('#state');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=u=>{u=u.trim();const m=u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i);return m?`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`.replace(/\?(raw|plain)=\w+$/,''):u};
const pageUrl=()=>location.href.split(/[?#]/)[0],link=id=>pageUrl()+'?post='+encodeURIComponent(id);
function classify(line){const [u0,cap]=line.split(/\s+\|\s+/);const url=u0.trim();if(!url||/\s/.test(url)||url[0]==='#')return null;
let m=url.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\/([\w-]{6,})/i);if(m)return{k:'shorts',id:m[1],url,cap};
m=url.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{6,})/i)||url.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/i)||url.match(/^https?:\/\/(?:www\.)?youtube\.com\/(?:embed|live)\/([\w-]{6,})/i);if(m)return{k:'youtube',id:m[1],url,cap};
const src=norm(url),e=((src.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase();
if(IMGX.has(e))return{k:'photo',url:src,cap};if(VIDX.has(e))return{k:'video',url:src,cap};if(AUDX.has(e))return{k:'audio',url:src,cap};if(FILX.has(e))return{k:'file',url:src,cap,ext:e};
let host=url;try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}return{k:'link',url,cap,host}}
function parseBlock(ls,file){const f={};let sec=null,fence=false;
for(const l of ls){const m=l.match(/^([A-Z_]+):\s?(.*)$/);
if(m&&KEYS.has(m[1])&&!fence){sec=m[1];fence=false;f[sec]=(f[sec]!=null?f[sec]+'\n':'')+m[2]}else if(sec){if(sec==='CONTENT'&&/^```/.test(l))fence=!fence;f[sec]+='\n'+l}}
const id=(f.ID||'').trim();if(!/^[\w.-]+$/.test(id))throw 0;
const content=(f.CONTENT||'').replace(/^(\s*\n)+/,'').trimEnd(),media=[];
for(const k of['MEDIA','FILES','LINKS'])for(const l of(f[k]||'').split('\n')){const c=classify(l.trim());if(c)media.push(c)}
const types=new Set();if(content)types.add('text');for(const m of media)types.add(m.k);if(!types.size)types.add('text');
const date=(f.DATE||'').trim(),title=(f.TITLE||'').trim(),ord=parseFloat(f.ORDER);
const h=[id,title,date,content,[...types].join(' '),types.has('photo')?'image':'',media.map(m=>m.url).join(' ')].join(' ').toLowerCase();
return{id,date,ts:Date.parse(date)||0,title,content,media,types,src:(f.SOURCE||'').trim(),ord:isNaN(ord)?null:ord,h,file}}
function parseFile(text,file){const out=[];let cur=[];const flush=()=>{if(cur.some(l=>l.trim())){try{out.push(parseBlock(cur,file))}catch{st.skipped++;console.warn('Skipped malformed post in',file,'\n'+cur.slice(0,4).join('\n'))}}cur=[]};
for(const l of text.replace(/^\uFEFF/,'').split(/\r?\n/)){if(l.trim()==='-')flush();else cur.push(l)}flush();return out}
const lk=t=>t.replace(/https?:\/\/[^\s<]+/g,u=>{let t='';while(/[.,;:!?)]$/.test(u)){t=u.slice(-1)+t;u=u.slice(0,-1)}return`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>${t}`});
function textHTML(t){let o='',buf=[],code=null;const fl=()=>{if(buf.length){o+='<p>'+lk(esc(buf.join('\n')))+'</p>';buf=[]}},pre=()=>'<pre><code>'+esc(code.join('\n'))+'</code></pre>';
for(const l of t.split('\n')){if(/^```/.test(l)){if(code){o+=pre();code=null}else{fl();code=[]}continue}if(code){code.push(l);continue}
if(!l.trim()){fl();continue}if(/^>/.test(l)){fl();o+='<blockquote>'+lk(esc(l.replace(/^>\s?/,'')))+'</blockquote>';continue}buf.push(l)}
if(code)o+=pre();fl();return o}
const cap=m=>m.cap?`<span class="cap">${esc(m.cap)}</span>`:'',fname=u=>{try{return decodeURIComponent(u.split(/[?#]/)[0].split('/').pop())||u}catch{return u}};
function vis(m,p){const a=esc(m.cap||p.title||'Post media');
if(m.k==='photo')return`<figure class="m"><button class="zoom" data-lb="${esc(m.url)}" aria-label="Open image in viewer"><img src="${esc(m.url)}" alt="${a}" loading="lazy" decoding="async"></button>${cap(m)}</figure>`;
if(m.k==='video')return`<figure class="m"><video controls preload="metadata" playsinline src="${esc(m.url)}"></video>${cap(m)}</figure>`;
return`<figure class="m yt${m.k==='shorts'?' sh':''}"><button class="ytb" data-yt="${esc(m.id)}" aria-label="Play YouTube ${m.k==='shorts'?'Short':'video'}"><img src="https://i.ytimg.com/vi/${esc(m.id)}/hqdefault.jpg" alt="" loading="lazy"></button></figure>`}
function postHTML(p){const v=p.media.filter(m=>VIS.has(m.k)),n=v.length,gc=n>3?'nn':'n'+n;
let h=`<article class="post" data-id="${esc(p.id)}"><header><time datetime="${esc(p.date)}">${esc(p.date||'Undated')}</time><span>${[...p.types].join(' / ')}${p.media.length>1?' · '+p.media.length+' items':''}</span></header>`;
if(p.title)h+=`<h2>${esc(p.title)}</h2>`;
if(p.content){const long=p.content.length>1800||p.content.split('\n').length>30;h+=`<div class="txt${long?' long':''}">${textHTML(p.content)}</div>`+(long?'<button class="more" data-act="more">Read full record</button>':'')}
if(n)h+=`<div class="mg ${gc}">${v.map(m=>vis(m,p)).join('')}</div>`;
for(const m of p.media){if(m.k==='audio')h+=`<div class="au"><span>${esc(m.cap||fname(m.url))}</span><audio controls preload="none" src="${esc(m.url)}"></audio></div>`;
else if(m.k==='file')h+=`<a class="file" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(m.ext.toUpperCase())}</b><span>${esc(m.cap||fname(m.url))}</span><em>Open / download</em></a>`;
else if(m.k==='link')h+=`<a class="lnk" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(m.host)}</span><span>${esc(m.cap||m.url)}</span></a>`;
else if(m.k==='youtube'||m.k==='shorts')h+=`<p class="src">Source: <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">YouTube</a></p>`}
if(p.src)h+=`<p class="src">Source: ${/^https?:\/\//i.test(p.src)?`<a href="${esc(p.src)}" target="_blank" rel="noopener noreferrer">${esc(p.src)}</a>`:esc(p.src)}</p>`;
return h+`<footer><code>${esc(p.id)}</code><button data-act="copy">Copy permanent link</button><a href="${esc(link(p.id))}" data-act="open">Open post</a></footer></article>`}
const chunkHTML=i=>st.view.slice(i*CHUNK,(i+1)*CHUNK).map(p=>{try{return postHTML(p)}catch{return`<article class="post"><div class="fb">This post could not be displayed (${esc(p.id)}).</div></article>`}}).join('');
const bo=new IntersectionObserver(es=>{for(const e of es){const b=e.target;if(e.isIntersecting){if(!b.firstChild){b.innerHTML=chunkHTML(+b.dataset.i);b.style.minHeight=''}}else if(b.firstChild){const h=b.offsetHeight,n=b.children.length||1;avg=avg*.8+(h/n)*.2;b.style.minHeight=h+'px';b.textContent=''}}},{rootMargin:'150% 0px'});
const so=new IntersectionObserver(e=>{if(e[0].isIntersecting&&addBlock()){so.unobserve($('#sent'));so.observe($('#sent'))}},{rootMargin:'100% 0px'});
function addBlock(){const i=blocks;if(i*CHUNK>=st.view.length)return false;const b=document.createElement('div');b.dataset.i=i;b.style.minHeight=Math.round(Math.min(CHUNK,st.view.length-i*CHUNK)*avg)+'px';feed.append(b);bo.observe(b);blocks++;return true}
function renderFeed(){bo.disconnect();so.disconnect();feed.textContent='';blocks=0;
stateEl.textContent=st.view.length?'':(st.posts.length?'No posts match. Clear the search or choose All.':'No posts found. Add posts to the files listed in posts/index.txt.');
if(addBlock())so.observe($('#sent'))}
const has=(p,f)=>f==='all'||(f==='media'?p.types.has('photo')||p.types.has('video'):p.types.has(f));
function apply(){const t=st.q.toLowerCase().split(/\s+/).filter(Boolean);st.view=st.posts.filter(p=>has(p,st.filter)&&t.every(w=>p.h.includes(w)));renderFeed()}
const syncChips=()=>document.querySelectorAll('.chips button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.f===st.filter))
let toastT;const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2200)};
async function copy(t){try{await navigator.clipboard.writeText(t)}catch{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove()}toast('Permanent link copied')}
let moved=false;['wheel','touchstart','keydown','mousedown'].forEach(n=>addEventListener(n,()=>{moved=true},{passive:true}));
function openPost(id,push){const p=st.byId.get(id);if(!p){toast('No post with ID '+id);return}
if(push)history.pushState(null,'',link(id));
let idx=st.view.indexOf(p);if(idx<0){st.filter='all';st.q='';qEl.value='';syncChips();st.view=st.posts;renderFeed();idx=st.view.indexOf(p)}
const bi=Math.floor(idx/CHUNK);while(blocks<=bi)addBlock();const b=feed.children[bi];if(!b.firstChild){b.innerHTML=chunkHTML(bi);b.style.minHeight=''}
const el=b.querySelector('[data-id="'+id+'"]');if(!el)return;const l=el.querySelector('.long');if(l){l.classList.add('open')}
moved=false;el.scrollIntoView({block:'start'});for(const d of[500,1400])setTimeout(()=>{if(!moved&&el.isConnected)el.scrollIntoView({block:'start'})},d);el.classList.add('hit');setTimeout(()=>el.classList.remove('hit'),3000)}
const lb=$('#lb'),lbi=lb.querySelector('img');let ls=[],li=0,opener;
function showLb(){lbi.src=ls[li];lb.classList.remove('z');$('#lbc').textContent=(li+1)+' / '+ls.length;$('#lbp').hidden=$('#lbn').hidden=ls.length<2}
const closeLb=()=>{lb.hidden=true;document.body.style.overflow='';if(document.fullscreenElement)document.exitFullscreen();opener&&opener.focus()};
feed.addEventListener('click',e=>{const t=e.target.closest('[data-act],[data-lb],[data-yt]');if(!t)return;const art=t.closest('.post'),id=art&&art.dataset.id;
if(t.dataset.act==='copy')copy(link(id));
else if(t.dataset.act==='open'){e.preventDefault();openPost(id,true)}
else if(t.dataset.act==='more'){t.previousElementSibling.classList.add('open')}
else if(t.dataset.lb){opener=t;ls=[...art.querySelectorAll('[data-lb]')].map(x=>x.dataset.lb);li=ls.indexOf(t.dataset.lb);lb.hidden=false;document.body.style.overflow='hidden';showLb();$('#lbx').focus()}
else if(t.dataset.yt){const f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(t.dataset.yt)+'?autoplay=1&rel=0&playsinline=1';f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.allowFullscreen=true;f.title='YouTube player';t.replaceWith(f)}});
document.addEventListener('error',e=>{const t=e.target;if(!t.tagName||!['IMG','VIDEO','AUDIO'].includes(t.tagName)||!t.closest('#feed'))return;if(t.closest('.ytb')){t.remove();return}
const s=t.currentSrc||t.src,d=document.createElement('div');d.className='fb';d.innerHTML='Media could not be loaded. <a href="'+esc(s)+'" target="_blank" rel="noopener noreferrer">Open source</a>';(t.closest('.zoom')||t).replaceWith(d)},true);
document.addEventListener('load',e=>{const t=e.target;if(t.tagName==='IMG'&&t.naturalHeight&&t.naturalWidth/t.naturalHeight>1.4&&t.closest('.mg'))t.closest('.m').classList.add('wide')},true);
document.addEventListener('loadedmetadata',e=>{const t=e.target;if(t.tagName==='VIDEO'&&t.videoWidth>=t.videoHeight&&t.closest('.mg'))t.closest('.m').classList.add('wide')},true);
$('#lbx').onclick=closeLb;$('#lbp').onclick=()=>{li=(li+ls.length-1)%ls.length;showLb()};$('#lbn').onclick=()=>{li=(li+1)%ls.length;showLb()};$('#lbz').onclick=()=>lb.classList.toggle('z');$('#lbf').onclick=()=>lb.requestFullscreen&&lb.requestFullscreen();
document.addEventListener('keydown',e=>{if(lb.hidden)return;if(e.key==='Escape')closeLb();if(ls.length>1&&e.key==='ArrowLeft')$('#lbp').click();if(ls.length>1&&e.key==='ArrowRight')$('#lbn').click()});
document.querySelector('.chips').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;st.filter=b.dataset.f;syncChips();apply()});
let qt;qEl.addEventListener('input',()=>{clearTimeout(qt);qt=setTimeout(()=>{st.q=qEl.value.trim();apply()},200)});
$('#nav').addEventListener('click',e=>{const a=e.target.closest('[data-nav]');if(!a)return;const n=a.dataset.nav;
if(n==='profile')scrollTo({top:0});else if(n==='posts')feed.scrollIntoView();else if(n==='media'){st.filter='media';syncChips();apply();feed.scrollIntoView()}else{$('#srch').classList.add('open');qEl.focus()}});
addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('post');if(id)openPost(id,false)});
async function ingest(name){try{const r=await fetch('posts/'+name);if(!r.ok)return null;return parseFile(await r.text(),name)}catch{return undefined}}
async function load(){const pf=$('#pf');pf.src=norm(PROFILE_IMAGE);pf.onerror=()=>{if(!pf.dataset.t){pf.dataset.t=1;pf.src='assets/profile.png'}};
let files=[],meta={},res=[];
try{const r=await fetch('posts/index.txt',{cache:'no-cache'});if(r.ok)for(const l of(await r.text()).split(/\r?\n/)){const t=l.trim();if(!t||t[0]==='#')continue;const m=t.match(/^@(\w+)\s+(.+)$/);if(t[0]==='@'){if(m)meta[m[1]]=m[2]}else files.push(t)}}catch{}
if(meta.status)$('#status').textContent=meta.status;if(meta.bio)$('#bio').textContent=meta.bio;
if(files.length){let next=0,done=0,failed=0;const w=async()=>{while(next<files.length){const i=next++;const r=await ingest(files[i]);if(!r){failed++;console.warn('Could not load posts/'+files[i])}res[i]=r||[];stateEl.textContent=`Reading the archive… ${++done} of ${files.length} files`}};await Promise.all([w(),w(),w(),w()]);if(failed)st.skipped+=0}
else for(let i=1;;i++){const r=await ingest('posts-'+String(i).padStart(3,'0')+'.txt');if(!r)break;res.push(r)}
for(const arr of res)for(const p of arr){if(st.byId.has(p.id)){st.skipped++;console.warn('Duplicate ID ignored; the first one keeps the link:',p.id,p.file);continue}st.byId.set(p.id,p);st.posts.push(p)}
st.posts.sort((a,b)=>b.ts-a.ts||((a.ord??0)-(b.ord??0))||(a.id<b.id?1:-1));
$('#nPosts').textContent=st.posts.length.toLocaleString();$('#nMedia').textContent=st.posts.reduce((n,p)=>n+p.media.filter(m=>m.k!=='link'&&m.k!=='file').length,0).toLocaleString();
st.view=st.posts;renderFeed();const id=new URLSearchParams(location.search).get('post');if(id)openPost(id,false)}
load()})();
