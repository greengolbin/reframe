// Public configuration. Everything here is safe to publish: the publishable key
// only works through the access rules in supabase/migrations/001_init.sql, and the
// Turnstile site key is public by design. Secrets never go in this repo.
// Launch switch. Keep false until the 14 Dec 2026 go-live so the public demo stays as it is.
// ?live in the address turns live mode on for this browser (remembered); ?demo turns it off.
// Invite links (#/j/…) and return links (#/r/…) always open live mode.
const LIVE_BY_DEFAULT = false;

// ?reset clears everything re:frame keeps on this device (demo strips, saved links, session, tags),
// then reloads without it. Use it on pitch and booth demo phones before presenting.
(function resetDevice() {
  if (!new URLSearchParams(location.search).has('reset')) return;
  try {
    for (const st of [localStorage, sessionStorage]) {
      Object.keys(st).filter((k) => /^(reframe|reconnect)\./.test(k)).forEach((k) => st.removeItem(k));
    }
  } catch { /* storage blocked */ }
  location.replace(location.pathname);
})();
const MODE_KEY = 'reframe.mode';
function resolveLive() {
  const q = new URLSearchParams(location.search);
  try {
    if (q.has('demo')) { localStorage.setItem(MODE_KEY, 'demo'); return false; }
    if (q.has('live')) { localStorage.setItem(MODE_KEY, 'live'); return true; }
    if (/^#\/[jr]\//.test(location.hash)) { localStorage.setItem(MODE_KEY, 'live'); return true; }
    const stored = localStorage.getItem(MODE_KEY);
    if (stored) return stored === 'live';
  } catch { /* storage blocked: fall through */ }
  return LIVE_BY_DEFAULT;
}

export const config = {
  supabaseUrl: 'https://icxzdcxilduoidryovkm.supabase.co',
  supabasePublishableKey: 'sb_publishable_uuqYyyHWo2zojpRhZX3A6A_Y8ibZTH2',
  turnstileSiteKey: '0x4AAAAAAGNISv4DiZSYAfSL',
  live: resolveLive(),
  // Fake door target from the proposal deck: "Keep going together" tapped on 15% or more of
  // finished strips, and at least 3 taps. The KPI view private.kpi_deck checks both.
  doorThreshold: 0.15,
  doorMinTaps: 3,
};
