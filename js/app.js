import { site, stats, gapOptions, placeOptions, openers, stages, formats, ideas, times, faq, faqCats, door } from './content.js';
import { store, MODE } from './store.js';
import { config } from './config.js';
import { renderPhotostrip } from './photostrip.js';

const view = document.getElementById('app');
const ASSETS = {
  logo: 'assets/img/logo-sm.webp', // 2x of the 48 px shown on screen
  logoFull: 'assets/img/logo.webp', // full size for the 1080 px strip export
  enc: 'assets/img/encourager.svg',
  ovr: 'assets/img/overthinker.svg',
};
const ORDER = ['now', 'then', 'next'];
const IG_DM = 'https://www.instagram.com/direct/inbox/';

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, root = view) => root.querySelector(sel);
const $$ = (sel, root = view) => [...root.querySelectorAll(sel)];
const go = (hash) => { location.hash = hash; };
const LIVE = MODE === 'live';
const linkTo = (id) => (LIVE ? store.friendLink(id) || '' : `${location.origin}${location.pathname}#/s/${id}/friend`);
const roleOf = (s) => s.role || 'owner';
// Stage 3 is asymmetric: the owner proposes a plan, the friend replies.
const planOf = (s) => (roleOf(s) === 'friend' ? s.turns.next?.friend : s.turns.next?.me);
const replyOf = (s) => (roleOf(s) === 'friend' ? s.turns.next?.me : s.turns.next?.friend);
const saveError = (e) => (LIVE
  ? (e?.code === 'upload_failed' ? 'The photo didn’t upload. Check your connection or try a smaller photo.' : 'Couldn’t save that. Check your connection and try again.')
  : 'Your browser’s storage is full. Try a smaller photo.');

// Where this person should be on this strip, from the data (works for both roles).
function routeOf(s) {
  const role = roleOf(s), t = s.turns;
  const mine = (k) => t[k]?.me, theirs = (k) => t[k]?.friend;
  if (s.stage === 'done') return 'done';
  if (s.stage === 'meetup') return 'meetup';
  if (role === 'owner' && s.stage === 'invite') return 'invite';
  if (role === 'friend' && !mine('now') && !mine('then') && !mine('next')) return 'friend';
  for (const k of ['now', 'then']) {
    if (!mine(k)) return `stage/${k}`;
    if (!theirs(k)) return `wait/${k}`;
  }
  return mine('next') ? 'wait/next' : 'stage/next';
}
const ROUTE_LABEL = { invite: 'Invite not sent yet', friend: 'New from a friend', 'stage/now': 'Stage 1', 'wait/now': 'Stage 1', 'stage/then': 'Stage 2', 'wait/then': 'Stage 2', 'stage/next': 'Stage 3', 'wait/next': 'Stage 3', meetup: 'Waiting for your meet-up photo', done: 'Done' };

function showError(e, retry) {
  const code = e?.code || e?.message || '';
  let msg = 'Something went wrong on our side. Try again in a moment.';
  if (/turnstile/.test(code)) msg = 'The quick “are you a person” check didn’t load. Turn off any content blocker, or try another browser, then try again.';
  else if (/rate_limited/.test(code)) msg = 'That’s a lot of new photostrips in a day. Try again tomorrow.';
  else if (/Failed to fetch|NetworkError|Load failed/i.test(String(e?.message))) msg = 'We couldn’t reach the server. Check your connection and try again.';
  shell({
    title: 'photostrip', back: '#/',
    body: `<h1 class="heading">that didn’t work</h1><p class="muted" style="margin:0">${esc(msg)}</p>${tip('ovr', 'your photostrip is safe. nothing was lost.')}<p class="small muted" style="margin:0">Still stuck? ${reportLink('Tell us what happened')}.</p>`,
    actions: `<button class="btn btn-primary" id="retry">Try again</button><a class="btn btn-tertiary" href="#/">Back to home</a>`,
  });
  $('#retry').addEventListener('click', retry || (() => render()));
}

const icon = {
  back: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.8"/><path d="m13.5 13.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  chat: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true" width="16" height="16"><path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h7A2.5 2.5 0 0 1 15 4.5v5a2.5 2.5 0 0 1-2.5 2.5H8l-3.5 3v-3A1.5 1.5 0 0 1 3 10.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  pen: '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true" width="16" height="16"><path d="M3 15l1-4 8-8 3 3-8 8-4 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="20" height="20"><circle cx="12" cy="12" r="11" fill="#69455B"/><path d="m7.5 12.5 3 3 6-6.5" stroke="#FFF6E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tick: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" width="18" height="18"><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".2"/><path d="m6 10.5 2.6 2.6L14 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.8"/></svg>',
};

function toast(msg, { ok = false } = {}) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = `toast${ok ? ' toast-ok' : ''}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `${ok ? icon.tick : ''}<span>${esc(msg)}</span>`;
  document.body.append(t);
  setTimeout(() => t.remove(), ok ? 3500 : 3000);
}

// Instagram, Facebook, TikTok etc. open links in their own browser, which can't download files.
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp|Line\//i.test(navigator.userAgent);
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const TOUCH = matchMedia('(pointer: coarse)').matches;

// In-page sheet for saving the strip where the browser can't save files directly.
function saveSheet(src, { story = false } = {}) {
  document.querySelector('dialog.sheet')?.remove();
  const hold = IOS ? 'Tap <b>Save to Photos</b>.' : 'Tap <b>Download image</b>.';
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.setAttribute('aria-labelledby', 'sheet-title');
  d.innerHTML = `<div class="sheet-head"><h2 id="sheet-title" class="h2">${story ? 'Save it, then post it' : 'Save your strip'}</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon.close}</button></div>
    <img class="sheet-img" src="${src}" alt="Your photostrip">
    <ol class="sheet-steps"><li>Press and hold the strip above.</li><li>${hold}</li>${story ? `<li>Open Instagram and add it to your Story with ${esc(site.hashtag)}.</li>` : ''}</ol>
    <button class="btn btn-primary" type="button" data-close>Done</button>`;
  document.body.append(d);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

// ---------------- "Something not working?" report ----------------
// Works in demo and live mode, signed in or not: one plain call, no Supabase client needed.
// Sends the note plus the screen (ids and link codes removed), device type, OS, browser, mode
// and source tag. No names, no contact details (the server strips emails and phone numbers too).
const REPORTS_KEY = 'reframe.reports';
const reportLink = (text = 'Something not working?') => `<a href="#" data-report>${esc(text)}</a>`;
function clientInfo() {
  const ua = navigator.userAgent;
  const browser = /Instagram/i.test(ua) ? 'instagram' : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'facebook'
    : /musical_ly|BytedanceWebview|TikTok/i.test(ua) ? 'tiktok' : /Snapchat/i.test(ua) ? 'snapchat'
    : /LinkedInApp/i.test(ua) ? 'linkedin' : /Line\//i.test(ua) ? 'line' : /Telegram/i.test(ua) ? 'telegram'
    : /SamsungBrowser/i.test(ua) ? 'samsung' : /Edg\//i.test(ua) ? 'edge' : /Firefox|FxiOS/i.test(ua) ? 'firefox'
    : /CriOS|Chrome\//i.test(ua) ? 'chrome' : /Safari\//i.test(ua) ? 'safari' : 'other';
  const os = IOS ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : /Macintosh|Mac OS X/i.test(ua) ? 'mac' : 'other';
  const device = /iPad|Tablet/i.test(ua) || (IOS && !/iPhone|iPod/.test(ua)) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet' : TOUCH || /Mobi/i.test(ua) ? 'phone' : 'computer';
  let ref = null;
  try { ref = localStorage.getItem('reframe.ref'); } catch { /* blocked */ }
  return { device, os, browser, ref };
}
function recentReports() {
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]').filter((t) => Date.now() - t < 3600e3); } catch { return []; }
}
async function sendReport(note) {
  const { device, os, browser, ref } = clientInfo();
  const screen = (location.hash || '#/').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\/(j|r)\/[\w-]+/, '/$1/:link').slice(0, 60);
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/report_problem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
    body: JSON.stringify({ p_note: note, p_screen: screen, p_device: device, p_os: os, p_browser: browser, p_mode: MODE === 'demo' ? 'demo' : 'live', p_ref: ref }),
  });
  if (!res.ok) throw new Error(/rate_limited/.test(await res.text().catch(() => '')) ? 'rate_limited' : `http_${res.status}`);
  try { localStorage.setItem(REPORTS_KEY, JSON.stringify([...recentReports(), Date.now()])); } catch { /* blocked */ }
}
function reportSheet(opener) {
  document.querySelector('dialog.sheet')?.remove();
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.setAttribute('aria-labelledby', 'sheet-title');
  d.innerHTML = `<div class="sheet-head"><h2 id="sheet-title" class="h2">Something not working?</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon.close}</button></div>
    <form class="stack-sm" style="gap:10px" novalidate>
      <label class="label" for="report-note">What went wrong?</label>
      <textarea class="textarea" id="report-note" maxlength="500" rows="4" aria-describedby="report-hint report-err" placeholder="For example: I tapped Save image and nothing happened."></textarea>
      <p class="caption muted" id="report-hint" style="margin:0;text-transform:none;letter-spacing:0">Please don’t include names or contact details. We also get which screen you were on and your type of phone and browser, nothing else.</p>
      <p class="error" id="report-err" role="alert"></p>
      <button class="btn btn-primary" type="submit">Send</button>
    </form>`;
  document.body.append(d);
  const form = d.querySelector('form');
  const note = d.querySelector('#report-note');
  const err = d.querySelector('#report-err');
  const btn = form.querySelector('[type=submit]');
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.addEventListener('close', () => { d.remove(); opener?.focus?.(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = note.value.trim();
    err.textContent = '';
    if (text.length < 3) { err.textContent = 'Tell us a little about what happened.'; note.focus(); return; }
    if (recentReports().length >= 3) { err.textContent = 'You’ve sent a few already. Thanks, we’re looking into them.'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await sendReport(text);
      d.close();
      toast('Thanks. We got it.', { ok: true });
    } catch (ex) {
      btn.disabled = false; btn.textContent = 'Send';
      err.textContent = ex.message === 'rate_limited' ? 'Lots of reports right now. Try again in a few minutes.' : 'Couldn’t send. Check your connection and try again.';
    }
  });
  d.showModal();
  note.focus();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-report]');
  if (!a) return;
  e.preventDefault();
  reportSheet(a);
});

function shell({ title, back, body, actions = '', docTitle }) {
  document.title = `${docTitle || title || site.tool} · ${site.campaign}`;
  const header = title || back
    ? `<header class="topbar">
        ${back ? `<a class="icon-btn" href="${back}" aria-label="Back">${icon.back}</a>` : '<span></span>'}
        <p class="title">${esc(title || '')}</p><span></span>
      </header>`
    : '';
  view.innerHTML = `${header}
    <div class="view">
      <div class="content" id="main-content" tabindex="-1">${body}</div>
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>`;
}

function progress(current) {
  const idx = current === 'done' || current === 'meetup' ? 3 : ORDER.indexOf(current);
  return `<ol class="progress" aria-label="Photostrip progress">${ORDER.map((k, i) => {
    const state = i < idx ? 'done' : i === idx ? 'current' : '';
    return `<li class="${state === 'done' ? 'done' : ''}" ${state === 'current' ? 'aria-current="step"' : ''}>${i + 1} · ${stages[k].label}${state === 'done' ? '<span class="visually-hidden"> (done)</span>' : ''}</li>`;
  }).join('')}</ol>`;
}

const lockup = () => `<div class="lockup" aria-label="${esc(site.campaign)} ${esc(site.tagline)}">
  <img src="${ASSETS.logo}" alt="" width="48" height="35"><span class="sep" aria-hidden="true"></span>
  <span><span class="name">This Is<br>Random But…</span><span class="tag-line">${esc(site.tagline)}</span></span></div>`;

const tip = (mascot, text) => `<div class="tip"><img src="${ASSETS[mascot]}" alt="" width="50" height="45"><p class="bubble bubble-them">${esc(text)}</p></div>`;
const demoPill = () => MODE === 'demo' ? `<a class="demo-pill" href="#/about">Demo mode · nothing leaves this device</a>` : '';

// One frame of the shared photostrip: what one person added at a stage.
function frame({ who, stage, text, photo, isNew, plan }) {
  const inner = plan
    ? `<div class="inner plan"><span class="tag">the plan</span><span class="subheading">${esc(plan.idea)}</span><span class="small muted">${esc(plan.time)}</span></div>`
    : photo
      ? `<div class="inner"><img src="${esc(photo)}" alt="${esc(who)}’s photo"></div>`
      : `<div class="inner">${esc(text || '')}</div>`;
  return `<figure class="frame ${isNew ? 'new' : ''}">${inner}<figcaption>${esc(stage)} · ${esc(who)}</figcaption></figure>`;
}

async function compressImage(file, max = 1000) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

async function getStripOr404(id) {
  const s = await store.getStrip(id);
  if (!s) {
    shell({
      title: 'photostrip', back: '#/',
      body: `<h1 class="heading">we couldn’t find this photostrip</h1>
        <p class="muted" style="margin:0">${LIVE ? 'This photostrip isn’t linked to this browser. Open the link your friend sent you, or the return link you copied, in this browser.' : 'This is a demo, so photostrips only live on the phone or laptop that made them. In the real version, this link would open the shared strip on any phone.'}</p>
        ${tip('ovr', 'no stress. you can start a new one in a minute.')}`,
      actions: `<a class="btn btn-primary" href="#/start">Start a photostrip</a>`,
    });
  }
  return s;
}

/* ---------------- 01 landing ---------------- */
async function landing() {
  const strips = await store.listStrips().catch(() => []);
  const open = strips.find((s) => s.stage !== 'done');
  const resumeRow = open
    ? `<a class="list-row" href="#/s/${open.id}">Continue your photostrip with ${esc(open.friendName)} ${icon.chevron}</a>`
    : strips.length ? `<a class="list-row" href="#/strips">Your photostrips (${strips.length}) ${icon.chevron}</a>` : '';
  shell({
    docTitle: site.tool,
    body: `${demoPill()}
      ${lockup()}
      <div class="hero" aria-hidden="true"><img src="${ASSETS.ovr}" alt="" width="78" height="85"><img src="${ASSETS.enc}" alt="" width="96" height="87"></div>
      <h1 class="display">thinking of texting an <span class="highlight">old friend?</span></h1>
      <p class="body muted" style="margin:0">They’re probably hoping to hear from you too. re:frame makes going first feel a little less random, in three small steps.</p>
      <div class="card stat"><span class="stat-num">${stats.pleased}%</span>
        <div class="stack-sm" style="gap:4px"><p class="label" style="font-size:13px;line-height:18px">of youths we surveyed would be really happy if an old friend texted first. Only ${stats.thinkSame}% think their friend feels the same.</p>
        <p class="caption" style="text-transform:none;letter-spacing:0">Our survey of ${stats.n} youths aged 17 to 25</p></div></div>
      ${resumeRow}`,
    actions: `<a class="btn btn-primary" href="#/start">Start a photostrip</a>
      <a class="btn btn-tertiary" href="#/faq">Not ready? Read the reconnecting tips</a>
      <p class="footer-note">Student prototype, not an official MSF service. <a href="#/about">About</a> · ${reportLink('Report a problem')}</p>`,
  });
}

/* ---------------- 02 start ---------------- */
async function start() {
  const pre = JSON.parse(sessionStorage.getItem('reconnect.prefill') || '{}');
  const radios = (name, opts, checked) => opts.map((o) => `<label class="chip"><input type="radio" name="${name}" value="${esc(o.id)}" ${o.id === checked ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('');
  let me = '';
  try { me = localStorage.getItem('reconnect.me') || ''; } catch {}
  shell({
    title: 'start a photostrip', back: '#/',
    body: `<div class="stack-sm" style="gap:2px"><h1 class="heading">who’ve you been meaning to text?</h1>
      <p class="body muted" style="margin:0">First names are enough. No sign-up needed.${LIVE ? ' Only you two see the strip. <a href="#/about">What we keep</a>' : ''}</p></div>
      <form id="start-form" class="stack-sm" style="gap:14px" novalidate>
        <div class="two-col">
          <div class="field"><label class="label" for="friend">Their name</label>
            <input class="input" id="friend" name="friend" autocomplete="off" maxlength="30" required placeholder="Wei Ling" value="${esc(pre.friendName || '')}" aria-describedby="friend-err"></div>
          <div class="field"><label class="label" for="me">You <span class="muted">(optional)</span></label>
            <input class="input" id="me" name="me" autocomplete="given-name" maxlength="30" placeholder="Jia Hui" value="${esc(me)}"></div>
        </div>
        <p class="error" id="friend-err" hidden>Add their name so we can personalise your message.</p>
        <fieldset class="chips"><legend>Last proper chat was…</legend>${radios('gap', gapOptions, pre.gap || 'year')}</fieldset>
        <fieldset class="chips"><legend>You two got close at…</legend>${radios('place', placeOptions, pre.place || 'secondary school')}</fieldset>
      </form>
      ${tip('enc', 'you don’t need a whole paragraph. a simple hey works.')}`,
    actions: `<button class="btn btn-primary" type="submit" form="start-form">Next</button>`,
  });
  $('#start-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const friendName = String(f.get('friend') || '').trim();
    if (!friendName) {
      $('#friend-err').hidden = false;
      $('#friend').setAttribute('aria-invalid', 'true');
      $('#friend').focus();
      return;
    }
    const myName = String(f.get('me') || '').trim();
    try { localStorage.setItem('reconnect.me', myName); } catch {}
    sessionStorage.removeItem('reconnect.prefill');
    const btn = $('.actions .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Setting up…';
    try {
      const s = await store.createStrip({ friendName, myName, gap: f.get('gap'), place: f.get('place') });
      go(`#/s/${s.id}/invite`);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Next';
      showError(err, () => start());
    }
  });
}

/* ---------------- 03 invite ---------------- */
async function invite(id) {
  const s = await getStripOr404(id);
  if (!s) return;
  const custom = sessionStorage.getItem('reconnect.opener');
  const list = openers(s);
  if (custom) list.unshift({ tag: 'From the tips', text: custom });
  let sel = 0;
  const texts = list.map((o) => o.text);
  shell({
    title: 'send the invite', back: '#/start',
    body: `<div class="stack-sm" style="gap:2px"><h1 class="heading">pick an opener</h1>
      <p class="body muted" style="margin:0">Tap one, make it sound like you, then send. Your link is added for you.</p></div>
      <div aria-label="Opening messages" role="group" class="stack-sm" id="openers" style="gap:8px"></div>`,
    actions: `<button class="btn btn-primary" id="send-main" type="button">Send on Instagram</button>
      <div class="row"><button class="btn btn-tertiary" data-app="whatsapp" type="button">WhatsApp</button>
      <button class="btn btn-tertiary" data-app="telegram" type="button">Telegram</button>
      <button class="btn btn-tertiary" data-app="copy" type="button">Copy</button></div>`,
  });
  const box = $('#openers');
  const draw = () => {
    box.innerHTML = list.map((o, i) => i === sel
      ? `<div class="bubble bubble-me opener" aria-current="true" data-i="${i}">
          <span class="tick">${icon.check}</span><label class="who" for="msg">${esc(o.tag)} · tap to edit</label>
          <textarea id="msg" class="opener-edit" maxlength="400" rows="3">${esc(texts[i])}</textarea></div>`
      : `<button type="button" class="bubble bubble-me opener" data-i="${i}" aria-label="Use this opener: ${esc(texts[i])}">
          <span class="who">${esc(o.tag)}</span>${esc(texts[i])}</button>`).join('');
    $$('button.opener', box).forEach((b) => b.addEventListener('click', () => {
      sel = +b.dataset.i;
      draw();
      $('#msg').focus();
    }));
    const ta = $('#msg');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', () => { texts[sel] = ta.value; fit(); });
    fit();
  };
  draw();
  const message = () => texts[sel].trim();
  const full = () => `${message()}\n${linkTo(id)}`;
  if (LIVE && !linkTo(id)) { toast('This browser can’t find your link. Start a new photostrip.'); }
  const done = async () => {
    store.logEvent?.('invite_shared', id);
    sessionStorage.removeItem('reconnect.opener');
    await store.updateStrip(id, { opener: message(), stage: s.stage === 'invite' ? 'now' : s.stage });
    go(`#/s/${id}/sent`);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(full()); return true; } catch { return false; }
  };
  $('#send-main').addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ text: message(), url: linkTo(id) }); return done(); } catch (e) { if (e.name === 'AbortError') return; }
    }
    const ok = await copy();
    toast(ok ? 'Message copied. Paste it into your Instagram DM.' : 'Copy your message, then paste it into Instagram.');
    window.open(IG_DM, '_blank', 'noopener');
    done();
  });
  $$('[data-app]').forEach((b) => b.addEventListener('click', async () => {
    const a = b.dataset.app;
    if (a === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(full())}`, '_blank', 'noopener');
    if (a === 'telegram') window.open(`https://t.me/share/url?url=${encodeURIComponent(linkTo(id))}&text=${encodeURIComponent(message())}`, '_blank', 'noopener');
    if (a === 'copy') toast((await copy()) ? 'Copied. Paste it wherever you chat.' : 'Couldn’t copy automatically. Select the text and copy it.');
    done();
  }));
}

/* ---------------- invite sent ---------------- */
async function sent(id) {
  const s = await getStripOr404(id);
  if (!s) return;
  shell({
    title: 'invite sent', back: `#/s/${id}/invite`,
    body: `<h1 class="display">sent. that’s the hardest part done.</h1>
      <p class="body muted" style="margin:0">${esc(s.friendName)} gets your message in their DMs, with a link to your shared photostrip. You add the first frame, then it’s their turn.</p>
      <div class="polaroids" aria-hidden="true">
        <figure class="polaroid tilt-l" style="margin:0"><div class="ph empty">+</div><figcaption>now</figcaption></figure>
        <figure class="polaroid" style="margin:0"><div class="ph empty">+</div><figcaption>then</figcaption></figure>
        <figure class="polaroid tilt-r" style="margin:0"><div class="ph empty">+</div><figcaption>next</figcaption></figure></div>
      ${LIVE
        ? `<p class="status-row ${s.friendClaimed ? 'ok' : ''}"><span class="dot"></span>${s.friendClaimed ? `${esc(s.friendName)} opened your link.` : `${esc(s.friendName)} hasn’t opened the link yet.`}</p>`
        : `<p class="notice">Demo: ${esc(s.friendName)}’s side is simulated. Tap “preview” to see what the link opens for them.</p>`}`,
    actions: `<a class="btn btn-primary" href="#/s/${id}/stage/now">Add the first frame</a>
      ${LIVE
        ? `<button class="btn btn-tertiary" id="copy-link" type="button">Copy the link again</button>`
        : `<a class="btn btn-tertiary" href="#/s/${id}/friend">Preview what ${esc(s.friendName)} sees</a>`}`,
  });
  $('#copy-link')?.addEventListener('click', async () => {
    const link = linkTo(id);
    if (!link) return toast('This browser doesn’t have the invite link. Copy it from the phone you started on.');
    try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { toast('Couldn’t copy. Open the invite screen to share it again.'); }
  });
}

/* ---------------- 04 friend view ---------------- */
async function friendView(id) {
  const s = await getStripOr404(id);
  if (!s) return;
  const asFriend = roleOf(s) === 'friend';
  // The sender is the other person when I'm the friend; in the owner's preview it's me.
  const sender = (asFriend ? s.friendName : s.myName) || 'An old friend';
  const sentFrame = asFriend ? s.turns.now?.friend : s.turns.now?.me;
  const note = s.opener || (asFriend ? '' : openers(s)[0].text);
  shell({
    docTitle: `${sender} wants to reconnect`,
    body: `${!asFriend && !LIVE ? `<p class="notice">Preview: what ${esc(s.friendName)} sees after tapping your link.</p>` : ''}
      <div class="card" style="display:flex;gap:10px;align-items:center;box-shadow:var(--shadow)">
        <img src="${ASSETS.logo}" alt="" width="36" height="27">
        <div><p class="caption">${esc(sender)} sent you</p><p class="small" style="margin:0">${esc(note || 'a photostrip to pick up where you left off')}</p></div></div>
      <h1 class="display">${esc(sender)} wants to pick up where you left off.</h1>
      <div class="polaroids" aria-hidden="true">
        <figure class="polaroid tilt-l" style="margin:0"><div class="ph ${sentFrame ? '' : 'empty'}">${sentFrame?.photo ? `<img src="${sentFrame.photo}" alt="">` : sentFrame ? '' : '+'}</div><figcaption>now${sentFrame ? ' · ' + esc(sender) : ''}</figcaption></figure>
        <figure class="polaroid" style="margin:0"><div class="ph empty">+</div><figcaption>then</figcaption></figure>
        <figure class="polaroid tilt-r" style="margin:0"><div class="ph empty">+</div><figcaption>next</figcaption></figure></div>
      ${asFriend ? `<div class="field"><label class="label" for="my-name">Your name on the strip</label>
        <input class="input" id="my-name" maxlength="30" autocomplete="given-name" value="${esc(s.myName || '')}"></div>
        <p class="small muted" style="margin:0">Only you two can see this strip. You can delete it any time from <a href="#/about">About</a>.</p>`
        : tip('enc', 'they started a photostrip for you two. just add one thing back.')}`,
    actions: `<button class="btn btn-primary" id="add-part" type="button">Add my part</button>
      <a class="btn btn-tertiary" href="${asFriend ? '#/' : `#/s/${id}`}">${asFriend ? 'Maybe later (they won’t be told)' : 'Back to my side (demo)'}</a>`,
  });
  $('#add-part').addEventListener('click', async () => {
    if (!asFriend) return toast(`Demo: ${s.friendName}’s side is simulated. Head back to continue as you.`);
    const name = $('#my-name').value.trim();
    try {
      if (name && name !== s.myName) await store.updateStrip(id, { myName: name });
      go(`#/s/${id}/stage/now`);
    } catch (e) { toast(saveError(e)); }
  });
}

/* ---------------- 05 / 07 stage 1 & 2 ---------------- */
async function stageView(id, key, signal) {
  const s = await getStripOr404(id);
  if (!s) return;
  if (key === 'next') return nextStage(s, signal);
  const st = stages[key];
  const prevKey = ORDER[ORDER.indexOf(key) - 1];
  const mine = s.turns[key]?.me || {};
  let photo = mine.photo || null;
  const theyAdded = !!s.turns[key]?.friend;
  const lead = theyAdded
    ? `${esc(s.friendName)} already added theirs. Now add yours.`
    : key === 'now' ? (roleOf(s) === 'friend' ? 'Add your frame.' : `You add the first frame. ${esc(s.friendName)} adds theirs next.`) : 'Your turn to start this one.';
  shell({
    title: `stage ${st.n} · ${st.label}`, back: prevKey ? `#/s/${id}/wait/${prevKey}` : (roleOf(s) === 'friend' ? `#/s/${id}/friend` : `#/s/${id}/sent`),
    body: `${progress(key)}
      <div class="stack-sm" style="gap:2px"><h1 class="heading">${esc(st.title)}</h1>
      <p class="body muted" style="margin:0">${lead}</p></div>
      <form id="turn" class="card card-yellow stack-sm" style="gap:10px" novalidate>
        <label class="subheading" for="answer">${esc(st.question)}</label>
        <fieldset class="chips scroll" aria-label="How do you want to answer?">${formats.map((f) => `<label class="chip"><input type="radio" name="format" value="${f.id}" ${(mine.format || 'text') === f.id ? 'checked' : ''}><span>${f.label}</span></label>`).join('')}</fieldset>
        <div id="photo-wrap" class="photo-pick" ${mine.format === 'photo' ? '' : 'hidden'}>
          <img class="thumb" id="thumb" alt="Your photo" ${photo ? `src="${photo}"` : 'hidden'}>
          <label class="btn btn-secondary file-label" style="width:auto;min-height:40px;padding:8px 16px">${icon.camera}<span id="photo-btn">${photo ? 'Change photo' : 'Add a photo'}</span><input type="file" id="photo" accept="image/*"></label></div>
        <textarea class="textarea" id="answer" name="answer" maxlength="280" placeholder="${esc(st.placeholder)}" ${mine.note ? 'style="font:400 21px/1.2 var(--font-hand)"' : ''}>${esc(mine.text || '')}</textarea>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button type="button" class="chip-btn" id="askback" aria-pressed="${mine.askBack ? 'true' : 'false'}" style="flex:1 1 auto">${icon.chat} Ask back: “${esc(st.askBack)}”</button>
          ${key === 'then' ? `<button type="button" class="chip-btn" id="note-toggle" aria-pressed="${mine.note ? 'true' : 'false'}" style="flex:0 0 auto">${icon.pen} Write it as a note</button>` : ''}
        </div>
      </form>
      <p class="hint">${esc(st.note)}</p>`,
    actions: `<button class="btn btn-primary" type="submit" form="turn" id="submit">Add to our photostrip</button>`,
  });

  const answer = $('#answer');
  const submit = $('#submit');
  const refresh = () => submit.toggleAttribute('disabled', !(answer.value.trim() || photo));
  answer.addEventListener('input', refresh);
  refresh();

  $$('input[name=format]').forEach((r) => r.addEventListener('change', () => {
    const f = formats.find((x) => x.id === r.value);
    $('#photo-wrap').hidden = r.value !== 'photo';
    answer.placeholder = r.value === 'text' ? st.placeholder : f.hint;
  }));
  $('#photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photo = await compressImage(file);
      $('#thumb').src = photo;
      $('#thumb').hidden = false;
      $('#photo-btn').textContent = 'Change photo';
      refresh();
    } catch {
      toast('That photo couldn’t be opened. Try another one.');
    }
  });
  const toggle = (b) => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
  $('#askback').addEventListener('click', (e) => toggle(e.currentTarget));
  $('#note-toggle')?.addEventListener('click', (e) => {
    toggle(e.currentTarget);
    const on = e.currentTarget.getAttribute('aria-pressed') === 'true';
    answer.style.font = on ? '400 21px/1.2 var(--font-hand)' : '';
    answer.placeholder = on ? `dear ${s.friendName.toLowerCase()}, remember when we…` : st.placeholder;
    answer.focus();
  });
  $('#turn').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    const format = $('input[name=format]:checked')?.value || 'text';
    try {
      await store.saveTurn(id, key, 'me', {
        text: answer.value.trim(),
        photo,
        format,
        askBack: $('#askback').getAttribute('aria-pressed') === 'true' ? st.askBack : '',
        note: $('#note-toggle')?.getAttribute('aria-pressed') === 'true',
      });
      if (roleOf(s) !== 'friend') await store.updateStrip(id, { stage: key });
      go(`#/s/${id}/wait/${key}`);
    } catch (e) {
      console.error(e);
      submit.disabled = false;
      toast(saveError(e));
    }
  });
}

/* ---------------- 08 stage 3 ---------------- */
function rankIdeas(s) {
  const text = [s.place, s.turns.now?.me?.text, s.turns.now?.friend?.text, s.turns.then?.me?.text, s.turns.then?.friend?.text].join(' ').toLowerCase();
  const scored = ideas.map((i) => ({ ...i, score: i.match.filter((w) => text.includes(w)).length }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((i) => i.tag !== 'Online').slice(0, 2);
  return [...top, ideas.find((i) => i.tag === 'Online')];
}

async function replyStage(s, signal) {
  const id = s.id, them = s.friendName, plan = planOf(s);
  if (!plan) {
    shell({
      title: 'stage 3 · next', back: `#/s/${id}/wait/then`,
      body: `${progress('next')}
        <div class="stack-sm" style="gap:2px"><h1 class="heading">${esc(them)} is picking a plan</h1>
        <p class="body muted" style="margin:0">They’ll suggest something based on what you both added. It shows up here when it’s ready.</p></div>
        <div class="polaroids" aria-hidden="true"><figure class="polaroid tilt-r" style="margin:0"><div class="ph waiting"><span class="dots"><i></i><i></i><i></i></span></div><figcaption>${esc(them)}…</figcaption></figure></div>
        ${tip('ovr', 'no rush. replies can take a day or two.')}`,
      actions: `<button class="btn btn-primary" id="refresh" type="button">Check again</button><a class="btn btn-tertiary" href="#/">Back to home</a>`,
    });
    $('#refresh').addEventListener('click', () => render());
    try {
      await store.waitForFriend(id, 'next', { signal });
      if (location.hash.endsWith('/stage/next')) render();
    } catch { /* navigated away */ }
    return;
  }
  shell({
    title: 'stage 3 · next', back: `#/s/${id}/wait/then`,
    body: `${progress('next')}
      <div class="stack-sm" style="gap:2px"><h1 class="display">${esc(them)} has a plan</h1>
      <p class="body muted" style="margin:0">Say yes if it works. You can sort out the details in your own chat.</p></div>
      <div class="frames">${frame({ who: them, stage: 'next', plan: { idea: plan.idea, time: plan.time }, isNew: true })}</div>`,
    actions: `<button class="btn btn-primary" id="yes" type="button">I’m in!</button><button class="btn btn-tertiary" id="no" type="button">Not this time</button>`,
  });
  const reply = async (accepted) => {
    try {
      await store.saveTurn(id, 'next', 'me', { text: accepted ? 'I’m in!' : 'Maybe another time', accepted });
      go(`#/s/${id}/wait/next`);
    } catch (e) { toast(saveError(e)); }
  };
  $('#yes').addEventListener('click', () => reply(true));
  $('#no').addEventListener('click', () => reply(false));
}

async function nextStage(s, signal) {
  if (roleOf(s) === 'friend') return replyStage(s, signal);
  const id = s.id;
  const list = rankIdeas(s);
  const mine = s.turns.next?.me || {};
  shell({
    title: 'stage 3 · next', back: `#/s/${id}/wait/then`,
    body: `${progress('next')}
      <div class="stack-sm" style="gap:2px"><h1 class="heading">make a new memory</h1>
      <p class="body muted" style="margin:0">Ideas based on what you both added:</p></div>
      <form id="plan" class="stack-sm" style="gap:14px">
        <fieldset class="ideas"><legend class="visually-hidden">Pick an idea</legend>
          ${list.map((i, n) => `<label class="idea"><input type="radio" name="idea" value="${i.id}" ${(mine.ideaId ? mine.ideaId === i.id : n === 0) ? 'checked' : ''}>
            <span class="txt"><span class="subheading">${esc(i.title)}</span><span class="small muted"><span class="tag">${esc(i.tag)}</span> ${esc(i.why)}</span></span><span class="ring" aria-hidden="true"></span></label>`).join('')}
        </fieldset>
        <fieldset class="chips"><legend>When works?</legend>
          ${times.map((t, n) => `<label class="chip"><input type="radio" name="time" value="${esc(t)}" ${(mine.time ? mine.time === t : n === 0) ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}
        </fieldset>
      </form>`,
    actions: `<button class="btn btn-primary" type="submit" form="plan">Suggest this to ${esc(s.friendName)}</button>
      <a class="btn btn-tertiary" href="#/strips">Not now, just keep chatting</a>`,
  });
  $('#plan').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const idea = ideas.find((i) => i.id === f.get('idea'));
    const btn = $('.actions .btn-primary');
    btn.disabled = true;
    try {
      await store.saveTurn(id, 'next', 'me', { ideaId: idea.id, idea: idea.title, time: f.get('time') });
      await store.updateStrip(id, { stage: 'next' });
      go(`#/s/${id}/wait/next`);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      toast(saveError(err));
    }
  });
}

/* ---------------- 06 waiting / their frame arrives ---------------- */
async function waitPlan(s, signal) {
  const id = s.id, owner = roleOf(s) === 'owner', you = s.myName || 'you', them = s.friendName;
  const plan = planOf(s), reply = replyOf(s);
  if (reply && reply.accepted === false) {
    shell({
      title: 'stage 3 · next', back: `#/s/${id}/stage/next`,
      body: `${progress('next')}<div class="stack-sm" style="gap:2px"><h1 class="display">${owner ? `${esc(them)} can’t make it this time` : 'maybe another time'}</h1>
        <p class="body muted" style="margin:0">${owner ? 'That’s okay. Plans change. You could suggest something different.' : 'No problem. They’ve been told.'}</p></div>
        ${tip('enc', 'a no to one plan isn’t a no to you.')}`,
      actions: owner ? `<a class="btn btn-primary" href="#/s/${id}/stage/next">Suggest something else</a><a class="btn btn-tertiary" href="#/strips">Not now, just keep chatting</a>` : `<a class="btn btn-primary" href="#/strips">Back to my photostrips</a>`,
    });
    return;
  }
  if (reply) {
    shell({
      title: 'stage 3 · next', back: `#/s/${id}/stage/next`,
      body: `${progress('meetup')}
        <div class="stack-sm" style="gap:2px"><h1 class="display">${owner ? `${esc(them)}’s in!` : 'you’re in!'}</h1>
        <p class="body muted" style="margin:0">The plan is on the strip. Sort out the details wherever you two chat.</p></div>
        <div class="frames">
          ${frame({ who: owner ? you : them, stage: 'next', plan: { idea: plan.idea, time: plan.time } })}
          ${frame({ who: owner ? them : you, stage: 'next', text: reply.text || '“I’m in!”', isNew: owner })}
        </div>
        <div class="handoff">${icon.chat}<p>Pick a time and place in your chat.</p><a href="${IG_DM}" target="_blank" rel="noopener">Open Instagram</a></div>`,
      actions: `<a class="btn btn-primary" href="#/s/${id}/meetup">We met up · add our photo</a><a class="btn btn-tertiary" href="#/strips">Do this after the meet-up</a>`,
    });
    return;
  }
  shell({
    title: 'our photostrip', back: `#/s/${id}/stage/next`,
    body: `${progress('next')}
      <div class="stack-sm" style="gap:2px"><h1 class="display">plan sent. nice one!</h1>
      <p class="body muted" style="margin:0">${esc(them)} will see your plan next time they open the link. Replies can take a day or two, and that’s normal.</p></div>
      <div class="frames">${frame({ who: you, stage: 'next', plan: { idea: plan?.idea, time: plan?.time } })}</div>
      ${tip('ovr', 'no reply yet doesn’t mean no. life gets busy.')}`,
    actions: MODE === 'demo'
      ? `<button class="btn btn-primary" id="skip">Skip the wait (demo)</button><a class="btn btn-tertiary" href="#/">Back to home</a>`
      : `<button class="btn btn-primary" id="refresh" type="button">Check for ${esc(them)}’s reply</button><a class="btn btn-tertiary" href="#/">Back to home</a>`,
  });
  $('#refresh')?.addEventListener('click', () => render());
  $('#skip')?.addEventListener('click', () => store.waitForFriend(id, 'next', { delay: 0 }).then(() => location.hash.endsWith('/wait/next') && render()));
  try {
    await store.waitForFriend(id, 'next', { delay: 6000, signal });
    if (location.hash.endsWith('/wait/next')) render();
  } catch { /* navigated away */ }
}

async function waitView(id, key, signal) {
  const s = await getStripOr404(id);
  if (!s) return;
  const st = stages[key];
  const me = s.turns[key]?.me;
  if (!me) return go(`#/s/${id}/stage/${key}`);
  if (key === 'next') return waitPlan(s, signal);
  const friend = s.turns[key]?.friend;
  const nextKey = ORDER[ORDER.indexOf(key) + 1];
  const you = s.myName || 'you';

  if (friend) {
    // Not a chat: the other person's part shows up as a new frame on the shared strip.
    // The conversation itself carries on in their own messaging app.
    shell({
      title: `stage ${st.n} · ${st.label}`, back: `#/s/${id}/stage/${key}`,
      body: `${progress(nextKey)}
        <div class="stack-sm" style="gap:2px"><h1 class="display">${esc(s.friendName)} added theirs</h1>
        <p class="body muted" style="margin:0">Their frame is on your photostrip now.${me.askBack ? ' They answered your ask-back too.' : ''}${friend.askBack ? ` They asked: “${esc(friend.askBack)}”` : ''}</p></div>
        <div class="frames">
          ${frame({ who: you, stage: st.label, text: me.text, photo: me.photo })}
          ${frame({ who: s.friendName, stage: st.label, text: friend.text, photo: friend.photo, isNew: true })}
        </div>
        <div class="handoff">${icon.chat}<p>Something to reply to? Keep the chat going in your DMs.</p><a href="${IG_DM}" target="_blank" rel="noopener">Open Instagram</a></div>`,
      actions: `<a class="btn btn-primary" href="#/s/${id}/stage/${nextKey}">On to stage ${st.n + 1}: ${stages[nextKey].label}</a>`,
    });
    return;
  }

  shell({
    title: 'our photostrip', back: `#/s/${id}/stage/${key}`,
    body: `${progress(key)}
      <div class="stack-sm" style="gap:2px"><h1 class="display">added. nice one!</h1>
      <p class="body muted" style="margin:0">${esc(s.friendName)} will see your frame next time they open the link. Replies can take a day or two, and that’s normal.</p></div>
      <div class="polaroids" aria-hidden="true">
        <figure class="polaroid tilt-l" style="margin:0"><div class="ph">${me.photo ? `<img src="${me.photo}" alt="">` : ''}</div><figcaption>you · done</figcaption></figure>
        <figure class="polaroid tilt-r" style="margin:0"><div class="ph waiting"><span class="dots"><i></i><i></i><i></i></span></div><figcaption>${esc(s.friendName)}…</figcaption></figure></div>
      <p class="visually-hidden" role="status" aria-live="polite">Waiting for ${esc(s.friendName)} to add theirs.</p>
      ${tip('ovr', 'no reply yet doesn’t mean no. life gets busy.')}
      <a class="list-row" href="#/faq">What if they reply with one word? ${icon.chevron}</a>`,
    actions: MODE === 'demo'
      ? `<button class="btn btn-primary" id="skip">Skip the wait (demo)</button><a class="btn btn-tertiary" href="#/">Back to home</a>`
      : `<button class="btn btn-primary" id="refresh" type="button">Check for ${esc(s.friendName)}’s frame</button><a class="btn btn-tertiary" href="#/">Back to home</a>`,
  });
  $('#refresh')?.addEventListener('click', () => render());
  $('#skip')?.addEventListener('click', () => {
    store.waitForFriend(id, key, { delay: 0 }).then(() => location.hash.endsWith(`/wait/${key}`) && render());
  });
  try {
    await store.waitForFriend(id, key, { delay: 6000, signal });
    if (location.hash.endsWith(`/wait/${key}`)) render();
  } catch { /* navigated away */ }
}

/* ---------------- meet-up photo ---------------- */
async function meetupView(id) {
  const s = await getStripOr404(id);
  if (!s) return;
  let photo = s.turns.meetup?.photo || null;
  shell({
    title: 'last frame', back: `#/s/${id}/wait/next`,
    body: `${progress('meetup')}
      <div class="stack-sm" style="gap:2px"><h1 class="display">you met up. nice.</h1>
      <p class="body muted" style="margin:0">Add a photo from your ${esc(planOf(s)?.idea || 'meet-up')} to finish the strip.</p></div>
      <div class="photo-pick"><img class="thumb" id="thumb" alt="Your meet-up photo" ${photo ? `src="${photo}"` : 'hidden'}>
        <label class="btn btn-secondary file-label" style="width:auto">${icon.camera}<span id="photo-btn">${photo ? 'Change photo' : 'Add a photo'}</span><input type="file" id="photo" accept="image/*"></label></div>
      <div class="field"><label class="label" for="cap">Caption <span class="muted">(optional)</span></label>
        <input class="input" id="cap" maxlength="28" placeholder="e.g. badminton + supper" value="${esc(s.turns.meetup?.caption || '')}"></div>
      ${tip('enc', 'one photo of you two together finishes the strip.')}`,
    actions: `<button class="btn btn-primary" id="finish">Finish our photostrip</button>
      <a class="btn btn-tertiary" href="#/strips">We haven’t met up yet</a>`,
  });
  $('#photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      photo = await compressImage(file);
      $('#thumb').src = photo;
      $('#thumb').hidden = false;
      $('#photo-btn').textContent = 'Change photo';
    } catch {
      toast('That photo couldn’t be opened. Try another one.');
    }
  });
  const finish = async () => {
    const btn = $('#finish');
    btn.disabled = true;
    try {
      await store.updateStrip(id, { stage: 'done', turns: { meetup: { photo, caption: $('#cap').value.trim() } } });
      go(`#/s/${id}/done`);
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      toast(saveError(e));
    }
  };
  $('#finish').addEventListener('click', () => (photo ? finish() : (toast('Add a photo of you two first.'), $('#photo').click())));
}

/* ---------------- 09 done ---------------- */
function doorBlock(s) {
  if (s.doorDone) return `<div class="door-card" id="door"><p class="small" style="margin:0">${esc(door.thanks)}</p></div>`;
  return `<div class="door-card" id="door"><div id="door-start" class="stack-sm" style="gap:8px">
      <button class="btn btn-secondary" id="door-btn" type="button">${esc(door.button)}</button>
      <p class="small muted" style="margin:0">${esc(door.hint)}</p></div></div>`;
}

async function doneView(id, signal) {
  const s = await getStripOr404(id);
  if (!s) return;
  let shareOk = s.shareOk || { me: true, friend: true };
  const them = s.friendName;
  const canShare = () => !LIVE || (shareOk.me && shareOk.friend);
  shell({
    title: 'our photostrip', back: '#/strips',
    body: `${progress('done')}
      <h1 class="display">your photostrip is done!</h1>
      <div class="strip-preview"><p class="muted small" id="rendering">Making your strip…</p></div>
      <p class="small muted" style="margin:0">It’s private to you two. For the Photostrip Challenge, share it to your Story${site.igHandle ? ` and tag ${esc(site.igHandle)}` : ''} with ${esc(site.hashtag)}.${MODE === 'demo' ? ` In the real version, ${esc(them)} is asked first.` : ' Posting needs a yes from both of you.'}</p>
      ${LIVE ? `<div class="card stack-sm" style="gap:8px">
        <label class="switch-row"><input type="checkbox" id="share-ok" ${shareOk.me ? 'checked' : ''}><span>I’m happy for this strip, with both our photos and words, to be posted on Instagram.</span></label>
        <p class="status-row ${shareOk.friend ? 'ok' : ''}" id="friend-ok" role="status"><span class="dot"></span><span id="friend-ok-text"></span></p></div>` : ''}
      ${LIVE ? doorBlock(s) : ''}`,
    actions: `<button class="btn btn-primary" id="share" disabled>${icon.share} Share to my Story</button>
      <div class="row"><button class="btn btn-tertiary" id="download" disabled>${icon.download} Save image</button>
      ${LIVE ? '' : '<button class="btn btn-tertiary" id="again">Start another</button>'}</div>`,
  });
  let ready = false;
  const sync = () => {
    $('#share').disabled = !(ready && canShare());
    const el = $('#friend-ok-text');
    if (el) {
      el.textContent = shareOk.friend ? `${them} said yes to sharing.` : `${them} hasn’t said yes to sharing yet. Saving the image for yourself is always fine.`;
      $('#friend-ok').classList.toggle('ok', !!shareOk.friend);
    }
  };
  sync();
  $('#share-ok')?.addEventListener('change', async (e) => {
    try { shareOk = (await store.setShareOk(id, e.target.checked)).shareOk; } catch (err) { e.target.checked = !e.target.checked; toast(saveError(err)); }
    sync();
  });

  // Fake door: tapping reveals honestly that it isn't built, then asks what they'd want.
  $('#door-btn')?.addEventListener('click', () => {
    store.logEvent?.('door_tap', id);
    $('#door').innerHTML = `<form id="door-form" class="stack-sm" style="gap:10px"><p class="small" style="margin:0">${esc(door.reveal)}</p>
      <fieldset class="chips"><legend class="visually-hidden">What would you want?</legend>${door.options.map((o, i) => `<label class="chip"><input type="radio" name="choice" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</fieldset>
      <label class="label" for="door-note">Anything else? <span class="muted">(optional)</span></label>
      <input class="input" id="door-note" maxlength="200" autocomplete="off">
      <div class="row"><button class="btn btn-primary" type="submit">Send</button><button class="btn btn-tertiary" type="button" id="door-skip">No thanks</button></div></form>`;
    $('#door-skip').addEventListener('click', () => { $('#door').innerHTML = `<p class="small" style="margin:0">No problem.</p>`; });
    $('#door-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await store.doorResponse(id, $('input[name=choice]:checked').value, $('#door-note').value.trim());
        $('#door').innerHTML = `<p class="small" style="margin:0">${esc(door.thanks)}</p>`;
      } catch (err) { toast(saveError(err)); }
    });
  });

  let blob;
  try {
    blob = await renderPhotostrip(s, { logo: ASSETS.logoFull, hashtag: site.hashtag });
  } catch (e) {
    console.error(e);
    $('#rendering').innerHTML = `Couldn’t draw the strip on this browser. ${reportLink('Tell us')}.`;
    return;
  }
  const url = URL.createObjectURL(blob);
  $('.strip-preview').innerHTML = `<img src="${url}" alt="Your photostrip with ${esc(them)}: now, then and next frames">`;
  ready = true;
  $('#download').disabled = false;
  sync();
  const fname = `reframe-photostrip-${them.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  // A data: URL survives press-and-hold saving in in-app browsers better than a blob: URL.
  const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
  const file = new File([blob], fname, { type: 'image/png' });
  const canShareFile = () => { try { return !!navigator.canShare?.({ files: [file] }); } catch { return false; } };
  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
  };
  // Phones: the share sheet's "Save Image" puts it in Photos. In-app browsers and phones
  // without that get an in-page sheet (press and hold). Computers download the file.
  const save = async ({ story = false } = {}) => {
    if (canShareFile()) {
      try {
        await navigator.share(story ? { files: [file], text: `${site.hashtag} we picked up where we left off.` } : { files: [file] });
        toast(story ? 'Done. Post it to your Story when you’re ready.' : 'Done. If you tapped Save Image, it’s in Photos.', { ok: true });
        return 'share';
      } catch (e) {
        if (e.name === 'AbortError') return 'cancelled';
      }
    }
    if (TOUCH || IN_APP) { saveSheet(dataUrl, { story }); return 'sheet'; }
    download();
    toast(story ? `Saved to your Downloads folder. Post it to your Story with ${site.hashtag}.` : 'Saved to your Downloads folder.', { ok: true });
    return 'download';
  };
  $('#download').addEventListener('click', async () => {
    const method = await save();
    store.logEvent?.('download_image', id, { method });
  });
  $('#share').addEventListener('click', async () => {
    if (!canShare()) return;
    const method = await save({ story: true });
    store.logEvent?.('share_story', id, { method });
  });
  $('#again')?.addEventListener('click', () => {
    sessionStorage.setItem('reconnect.prefill', JSON.stringify({ friendName: s.friendName, gap: 'months', place: s.place }));
    go('#/start');
  });

  // Live: keep the other person's sharing answer fresh while this screen is open.
  if (LIVE) {
    try {
      for (;;) {
        await new Promise((res, rej) => { const t = setTimeout(res, 8000); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }); });
        const fresh = await store.getStrip(id);
        if (fresh?.shareOk) { shareOk = fresh.shareOk; sync(); }
      }
    } catch { /* navigated away */ }
  }
}

/* ---------------- 10 FAQ ---------------- */
async function faqView() {
  shell({
    title: 'reconnecting FAQ', back: '#/',
    body: `<h1 class="visually-hidden">Reconnecting FAQ</h1>
      <div class="search"><label class="visually-hidden" for="q">Search the tips</label>${icon.search}
        <input class="input" id="q" type="search" placeholder="Search, e.g. ‘it’s been a year’" autocomplete="off"></div>
      <fieldset class="chips scroll"><legend class="visually-hidden">Filter by topic</legend>
        ${faqCats.map((c, i) => `<label class="chip"><input type="radio" name="cat" value="${esc(c)}" ${i === 0 ? 'checked' : ''}><span>${esc(c.toLowerCase())}</span></label>`).join('')}</fieldset>
      <div id="list" class="stack-sm" style="gap:6px"></div>
      <p id="empty" class="muted" hidden>No match. Try “awkward”, “reply” or “meet up”.</p>`,
    actions: `<a class="btn btn-primary" href="#/start">Start a photostrip</a>`,
  });
  const list = $('#list');
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const cat = $('input[name=cat]:checked').value;
    // Searching looks across every topic; otherwise show the chosen topic.
    const items = faq.filter((f) => (q ? (f.q + ' ' + f.a + ' ' + f.cat).toLowerCase().includes(q) : f.cat === cat));
    $('#empty').hidden = items.length > 0;
    list.innerHTML = items.map((f, i) => `<details class="faq-item" ${i === 0 && !q ? 'open' : ''}><summary>${esc(f.q)}</summary>
      <div class="faq-body"><p class="small muted" style="margin:0">${esc(f.a)}</p>
      <p class="bubble bubble-me" style="max-width:none;font-size:14px"><span class="who">Try</span>${esc(f.try)}</p>
      <button class="btn btn-tertiary" style="justify-content:flex-start;text-decoration:underline;min-height:40px;padding:6px 0" data-use="${esc(f.id)}">Use this as my opener</button></div></details>`).join('');
    $$('[data-use]', list).forEach((b) => b.addEventListener('click', () => {
      const f = faq.find((x) => x.id === b.dataset.use);
      sessionStorage.setItem('reconnect.opener', f.try);
      toast('Saved. It’ll be at the top of your openers.');
      go('#/start');
    }));
  };
  $('#q').addEventListener('input', draw);
  $$('input[name=cat]').forEach((r) => r.addEventListener('change', draw));
  draw();
}

/* ---------------- your strips ---------------- */
async function stripsView() {
  const strips = await store.listStrips();
  const rows = strips.map((s) => `<a class="list-row" href="#/s/${s.id}"><span><span class="subheading" style="display:block">${esc(s.friendName)}</span><span class="small muted">${ROUTE_LABEL[routeOf(s)] || ''}</span></span>${icon.chevron}</a>`);
  shell({
    title: 'your photostrips', back: '#/',
    body: `<h1 class="heading">your photostrips</h1>
      ${strips.length ? `<div class="stack-sm" style="gap:8px">${rows.join('')}</div>` : `${tip('ovr', 'nothing here yet. your first photostrip is one message away.')}`}
      ${LIVE && strips.length ? `<div class="card stack-sm" style="gap:8px"><h2 class="subheading">Using another phone or browser?</h2>
        <p class="small muted" style="margin:0">Photostrips are tied to the browser you made them in. Copy a return link to open one somewhere else. Keep it private: anyone with it can open that strip.</p>
        ${strips.map((s) => `<button class="btn btn-tertiary" style="justify-content:flex-start;min-height:40px" data-return="${s.id}" data-role="${roleOf(s)}">Copy return link · ${esc(s.friendName)}</button>`).join('')}</div>` : ''}`,
    actions: `<a class="btn btn-primary" href="#/start">Start a new photostrip</a>`,
  });
  $$('[data-return]').forEach((b) => b.addEventListener('click', async () => {
    const link = store.returnLink(b.dataset.return, b.dataset.role);
    if (!link) return toast('This browser doesn’t hold the link for that strip.');
    try { await navigator.clipboard.writeText(link); toast('Return link copied.'); } catch { toast('Couldn’t copy automatically.'); }
  }));
}

/* ---------------- about ---------------- */
async function aboutView() {
  shell({
    title: 'about', back: '#/',
    body: `<h1 class="heading">about re:frame</h1>
      <p class="body" style="margin:0">${esc(site.disclaimer)}</p>
      ${LIVE ? `
      <div class="card stack-sm"><h2 class="subheading">What we keep</h2>
        <p class="small muted" style="margin:0">Names you type, your words, your photos, simple counts like “link opened” so we can see if the pilot works, and any problem reports you send. No accounts, no contact details, no tracking of what you do elsewhere.</p></div>
      <div class="card stack-sm"><h2 class="subheading">Who can see it</h2>
        <p class="small muted" style="margin:0">Only the two of you, through your private links. Nothing is posted anywhere unless you both say yes on the finished strip. Photos are stored privately and shown through short-lived links.</p></div>
      <div class="card stack-sm"><h2 class="subheading">How long</h2>
        <p class="small muted" style="margin:0">Everything is deleted after the pilot, by ${esc(site.retention)}. You can delete your photostrips earlier, below.</p></div>
      <div class="card stack-sm"><h2 class="subheading">Where it runs</h2>
        <p class="small muted" style="margin:0">Data is stored with Supabase (Singapore). A Cloudflare check confirms you’re a person before a strip is created.</p></div>
      <button class="btn btn-secondary" id="delete-all" type="button">Delete all my photostrips</button>
      <button class="btn btn-tertiary" id="forget" type="button">Sign out of this browser</button>`
      : `
      <div class="card stack-sm"><h2 class="subheading">Demo mode</h2>
        <p class="small muted" style="margin:0">Everything you type and any photos you add stay in this browser on this device. Nothing is sent to a server unless you send us a problem report, and your friend’s side is simulated so you can try the full journey on your own.</p></div>
      <button class="btn btn-secondary" id="reset">Clear demo data on this device</button>`}
      <div class="card stack-sm"><h2 class="subheading">Something not working?</h2>
        <p class="small muted" style="margin:0">Tell us what happened and we’ll look into it. ${reportLink('Report a problem')}</p></div>`,
  });
  $('#reset')?.addEventListener('click', async () => {
    if (!confirm('Delete all demo photostrips on this device?')) return;
    await store.reset();
    toast('Demo data cleared.');
    go('#/');
  });
  $('#delete-all')?.addEventListener('click', async (e) => {
    if (!confirm('Delete every photostrip you’re part of from this browser? This removes it for your friend too and can’t be undone.')) return;
    e.currentTarget.disabled = true;
    try {
      const n = await store.deleteAll();
      toast(n ? 'Deleted.' : 'Nothing to delete.');
      go('#/');
    } catch (err) { e.currentTarget.disabled = false; toast(saveError(err)); }
  });
  $('#forget')?.addEventListener('click', async () => {
    if (!confirm('Sign out here? Your photostrips stay safe, but you’ll need your return links to open them again.')) return;
    await store.reset();
    toast('Signed out of this browser.');
    go('#/');
  });
}

/* ---------------- join / return links (live) ---------------- */
async function claimView(token, signal, kind) {
  shell({ body: `<p class="muted" style="margin:40px 0;text-align:center">Opening your photostrip…</p>` });
  if (!LIVE) return go('#/');
  try {
    const r = await store.claim(token);
    location.replace(`#/s/${r.id}`);
  } catch (e) {
    const code = e?.code || e?.message || '';
    if (/own_link/.test(code)) {
      shell({ title: 'photostrip', back: '#/', body: `<h1 class="heading">that’s your own link</h1><p class="muted" style="margin:0">This link is for your friend. Send it to them, and open your own photostrip from the home screen.</p>`, actions: `<a class="btn btn-primary" href="#/strips">My photostrips</a>` });
    } else if (/link_used/.test(code)) {
      shell({ title: 'photostrip', back: '#/', body: `<h1 class="heading">this link has been used</h1><p class="muted" style="margin:0">This photostrip is already open on other phones or browsers, so it can’t be opened here. If it’s yours, use the phone or browser you started on.</p>${tip('ovr', 'want your own? starting one takes a minute.')}<p class="small muted" style="margin:0">Think this is a mistake? ${reportLink('Tell us')}.</p>`, actions: `<a class="btn btn-primary" href="#/start">Start a photostrip</a>` });
    } else if (/invalid_token/.test(code)) {
      shell({ title: 'photostrip', back: '#/', body: `<h1 class="heading">this link isn’t working</h1><p class="muted" style="margin:0">It may have been typed wrong, cut off, or the photostrip was deleted. Ask your friend to send it again.</p>${tip('ovr', 'no stress. links get cut off sometimes.')}<p class="small muted" style="margin:0">Think this is a mistake? ${reportLink('Tell us')}.</p>`, actions: `<a class="btn btn-primary" href="#/start">Start a photostrip</a>` });
    } else showError(e, () => claimView(token, signal, kind));
  }
}

async function resume(id) {
  const s = await getStripOr404(id);
  if (!s) return;
  location.replace(`#/s/${id}/${routeOf(s)}`);
}

/* ---------------- router ---------------- */
const routes = [
  [/^#?\/?$/, landing],
  [/^#\/start$/, start],
  [/^#\/faq$/, faqView],
  [/^#\/strips$/, stripsView],
  [/^#\/about$/, aboutView],
  [/^#\/j\/([\w-]+)$/, (token, signal) => claimView(token, signal, 'j')],
  [/^#\/r\/([\w-]+)$/, (token, signal) => claimView(token, signal, 'r')],
  [/^#\/s\/([\w-]+)$/, resume],
  [/^#\/s\/([\w-]+)\/invite$/, invite],
  [/^#\/s\/([\w-]+)\/sent$/, sent],
  [/^#\/s\/([\w-]+)\/friend$/, friendView],
  [/^#\/s\/([\w-]+)\/stage\/(now|then|next)$/, stageView],
  [/^#\/s\/([\w-]+)\/wait\/(now|then|next)$/, waitView],
  [/^#\/s\/([\w-]+)\/meetup$/, meetupView],
  [/^#\/s\/([\w-]+)\/done$/, doneView],
];

let controller;
let first = true;
async function render() {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const h = location.hash || '#/';
  const match = routes.map(([re, fn]) => [h.match(re), fn]).find(([m]) => m);
  window.scrollTo(0, 0);
  if (!match) return go('#/');
  const [m, fn] = match;
  const p = fn(...m.slice(1), signal);
  // After navigating, move focus to the new screen so screen readers announce it.
  if (!first) setTimeout(() => $('#main-content')?.focus({ preventScroll: true }), 0);
  first = false;
  try { await p; } catch (e) { if (e?.name !== 'AbortError') { console.error(e); showError(e); } }
}

window.addEventListener('hashchange', render);
render();
