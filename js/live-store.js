// LiveStore: the real two-person version, on Supabase.
//
// Same method names as DemoStore. Strips come back from the viewer's side:
// `me` is the viewer's turn, `friend` is the other person's, `role` is 'owner' or
// 'friend', and photo paths are swapped for short-lived signed URLs.
// All reads and writes go through the SECURITY DEFINER functions in
// supabase/migrations/001_init.sql; the browser never touches the tables directly.

import { createClient } from './vendor/supabase.js';
import { config } from './config.js';
import { getCaptchaToken } from './turnstile.js';

const REG_KEY = 'reframe.live.v1';
const REF_KEY = 'reframe.ref';
const VISIT_KEY = 'reframe.visits';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_MS = 8000;
const SIGN_TTL = 3600;

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

// First-touch source tag, e.g. https://…/reframe/?ref=booth. Kept for the whole pilot on this device.
(function captureRef() {
  try {
    const r = (new URLSearchParams(location.search).get('ref') || '').toLowerCase();
    if (/^[a-z0-9_-]{1,24}$/.test(r) && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, r);
  } catch { /* storage blocked: no tag */ }
})();

class LiveStore {
  #sb = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'reframe.auth' },
  });
  #signing = null;

  constructor() {
    this.#logVisit();
  }

  // One count per source per day on this browser. No sign-in and nothing that identifies the person.
  // Source: ?ref=… on the address (booth, boost3, boost7, bio, …), friend links count as 'invite'.
  #logVisit() {
    try {
      const q = (new URLSearchParams(location.search).get('ref') || '').toLowerCase();
      const ref = /^[a-z0-9_-]{1,24}$/.test(q) ? q : /^#\/j\//.test(location.hash) ? 'invite' : /^#\/r\//.test(location.hash) ? 'return' : 'direct';
      const day = new Date().toISOString().slice(0, 10);
      const seen = JSON.parse(localStorage.getItem(VISIT_KEY) || '{}');
      if (seen[ref] === day) return;
      seen[ref] = day;
      localStorage.setItem(VISIT_KEY, JSON.stringify(seen));
      this.#sb.rpc('log_visit', { p_ref: ref }).then(() => {}, () => {});
    } catch { /* storage blocked: skip the count */ }
  }
  #signed = new Map(); // storage path -> { url, exp }
  #urlToPath = new Map(); // signed URL or data URL -> storage path

  /* ---------- device registry: secret link tokens kept on this device ---------- */
  #reg() {
    try { return JSON.parse(localStorage.getItem(REG_KEY)) || { tokens: {} }; } catch { return { tokens: {} }; }
  }
  #saveReg(r) {
    try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  }
  #remember(id, kind, token) {
    const r = this.#reg();
    r.tokens[id] = { ...(r.tokens[id] || {}), [kind]: token };
    this.#saveReg(r);
  }
  tokens(id) {
    return this.#reg().tokens[id] || {};
  }
  hasLocalStrips() {
    return Object.keys(this.#reg().tokens).length > 0;
  }
  get ref() {
    try { return localStorage.getItem(REF_KEY) || null; } catch { return null; }
  }

  /* ---------- session ---------- */
  async #hasSession() {
    const { data } = await this.#sb.auth.getSession();
    return !!data.session;
  }
  async #ensureSession() {
    if (await this.#hasSession()) return;
    this.#signing ||= (async () => {
      const captchaToken = await getCaptchaToken();
      const { error } = await this.#sb.auth.signInAnonymously({ options: { captchaToken } });
      if (error) throw Object.assign(new Error(error.message), { code: 'sign_in_failed' });
    })().finally(() => { this.#signing = null; });
    await this.#signing;
  }
  async #rpc(name, args = {}, { signIn = true, retry = true } = {}) {
    if (signIn) await this.#ensureSession();
    else if (!(await this.#hasSession())) return null;
    const { data, error } = await this.#sb.rpc(name, args);
    if (error) {
      // Session no longer valid on the server (e.g. user removed): start a fresh one once.
      if (retry && (error.code === 'PGRST301' || /jwt/i.test(error.message))) {
        await this.#sb.auth.signOut({ scope: 'local' });
        return this.#rpc(name, args, { signIn, retry: false });
      }
      throw Object.assign(new Error(error.message), { code: error.message });
    }
    return data;
  }

  /* ---------- photos ---------- */
  async #sign(paths) {
    const now = Date.now();
    const need = [...new Set(paths)].filter((p) => !(this.#signed.get(p)?.exp > now + 60000));
    if (need.length) {
      const { data } = await this.#sb.storage.from('photos').createSignedUrls(need, SIGN_TTL);
      for (const row of data || []) {
        if (row.signedUrl) {
          this.#signed.set(row.path, { url: row.signedUrl, exp: now + SIGN_TTL * 1000 });
          this.#urlToPath.set(row.signedUrl, row.path);
        }
      }
    }
    return (p) => this.#signed.get(p)?.url || null;
  }
  async #upload(id, dataUrl) {
    if (this.#urlToPath.has(dataUrl)) return this.#urlToPath.get(dataUrl);
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${id}/${crypto.randomUUID()}.jpg`;
    const { error } = await this.#sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw Object.assign(new Error(error.message), { code: 'upload_failed' });
    this.#urlToPath.set(dataUrl, path);
    return path;
  }

  async #normalise(s) {
    if (!s) return null;
    const turns = s.turns || {};
    const paths = [];
    for (const st of ['now', 'then', 'next', 'meetup']) {
      for (const w of ['me', 'friend']) {
        const p = turns[st]?.[w]?.photo;
        if (p) paths.push(p);
      }
    }
    const url = paths.length ? await this.#sign(paths) : () => null;
    for (const st of ['now', 'then', 'next', 'meetup']) {
      for (const w of ['me', 'friend']) {
        const t = turns[st]?.[w];
        if (t?.photo) t.photo = url(t.photo);
      }
    }
    // The meet-up frame is shared: show mine if I added one, otherwise theirs.
    const mu = turns.meetup || {};
    turns.meetup = mu.me || mu.friend || {};
    s.turns = { now: turns.now || {}, then: turns.then || {}, next: turns.next || {}, meetup: turns.meetup };
    s.createdAt = Date.parse(s.createdAt);
    s.updatedAt = Date.parse(s.updatedAt);
    return s;
  }

  /* ---------- the DemoStore interface ---------- */
  async createStrip({ friendName, gap, place, myName = '' }) {
    const r = await this.#rpc('create_strip', {
      p_owner_name: myName, p_friend_name: friendName, p_gap: gap || '', p_place: place || '', p_ref: this.ref,
    });
    this.#remember(r.id, 'o', r.ownerToken);
    this.#remember(r.id, 'f', r.friendToken);
    const s = await this.getStrip(r.id);
    return { ...s, friendToken: r.friendToken, ownerToken: r.ownerToken };
  }

  async getStrip(id) {
    if (!UUID.test(id || '')) return null;
    let d = await this.#rpc('get_strip', { p_id: id }, { signIn: false });
    if (!d) {
      // Not a member from this browser session. If this device holds the link, re-claim it.
      const t = this.tokens(id);
      const token = t.o || t.f;
      if (token) {
        try {
          await this.#rpc('claim_strip', { p_token: token });
          d = await this.#rpc('get_strip', { p_id: id });
        } catch { /* link no longer valid */ }
      }
    }
    return this.#normalise(d);
  }

  async listStrips() {
    if (!(await this.#hasSession()) && !this.hasLocalStrips()) return [];
    const list = (await this.#rpc('list_strips')) || [];
    return list.map((s) => {
      s.createdAt = Date.parse(s.createdAt);
      s.updatedAt = Date.parse(s.updatedAt);
      for (const st of Object.values(s.turns || {})) for (const t of Object.values(st)) if (t && 'photo' in t) t.photo = null;
      return s;
    });
  }

  async updateStrip(id, patch) {
    const { turns, ...rest } = patch;
    let s = null;
    if (turns?.meetup) s = await this.saveTurn(id, 'meetup', 'me', turns.meetup);
    const body = {};
    for (const k of ['myName', 'opener', 'stage']) if (rest[k] !== undefined) body[k] = rest[k];
    if (Object.keys(body).length) s = await this.#normalise(await this.#rpc('update_strip', { p_id: id, p_patch: body }));
    return s || this.getStrip(id);
  }

  async saveTurn(id, stage, _who, payload) {
    const p = { ...payload };
    delete p.at;
    if (p.photo) {
      if (p.photo.startsWith('data:')) p.photo = await this.#upload(id, p.photo);
      else if (this.#urlToPath.has(p.photo)) p.photo = this.#urlToPath.get(p.photo);
      else if (!p.photo.startsWith(`${id}/`)) delete p.photo;
    } else delete p.photo;
    return this.#normalise(await this.#rpc('save_turn', { p_id: id, p_stage: stage, p_payload: p }));
  }

  // Polls until the other person's turn for this stage exists. Resolves with the strip.
  async waitForFriend(id, stage, { signal } = {}) {
    for (;;) {
      const s = await this.getStrip(id);
      if (s?.turns?.[stage]?.friend) return s;
      await sleep(POLL_MS, signal);
    }
  }

  async deleteStrip(id) {
    const paths = (await this.#rpc('strip_photo_paths', { p_id: id })) || [];
    if (paths.length) await this.#sb.storage.from('photos').remove(paths);
    await this.#rpc('delete_strip', { p_id: id });
    const r = this.#reg();
    delete r.tokens[id];
    this.#saveReg(r);
  }

  async deleteAll() {
    const list = await this.listStrips();
    for (const s of list) await this.deleteStrip(s.id);
    return list.length;
  }

  // Live mode has no "clear demo data"; this removes this device's session and saved links only.
  async reset() {
    try { await this.#sb.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    try { localStorage.removeItem(REG_KEY); } catch { /* ignore */ }
  }

  /* ---------- live-only ---------- */
  async claim(token) {
    const r = await this.#rpc('claim_strip', { p_token: token });
    this.#remember(r.id, r.role === 'owner' ? 'o' : 'f', token);
    // People who arrive through a friend's link and later start their own strip are tagged 'invite'.
    if (r.role === 'friend') {
      try { if (!localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, 'invite'); } catch { /* ignore */ }
    }
    return r;
  }
  async setShareOk(id, value) {
    return this.#normalise(await this.#rpc('set_share_ok', { p_id: id, p_value: !!value }));
  }
  async doorResponse(id, choice, note = '') {
    return this.#normalise(await this.#rpc('door_response', { p_id: id, p_choice: choice, p_note: note }));
  }
  logEvent(name, id = null, props = {}) {
    return this.#rpc('log_event', { p_name: name, p_id: id, p_props: props }, { signIn: false }).catch(() => {});
  }
  friendLink(id) {
    const f = this.tokens(id).f;
    return f ? `${location.origin}${location.pathname}#/j/${f}` : null;
  }
  returnLink(id, role) {
    const t = this.tokens(id);
    const tok = role === 'friend' ? t.f : t.o;
    return tok ? `${location.origin}${location.pathname}#/${role === 'friend' ? 'j' : 'r'}/${tok}` : null;
  }
}

export const liveStore = new LiveStore();
