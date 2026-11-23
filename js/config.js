// Public configuration. Everything here is safe to publish: the publishable key
// only works through the access rules in supabase/migrations/001_init.sql, and the
// Turnstile site key is public by design. Secrets never go in this repo.
// Launch switch. Keep false until the 14 Dec 2026 go-live so the public demo stays as it is.
// ?live in the address turns live mode on for this browser (remembered); ?demo turns it off.
// Invite links (#/j/…) and return links (#/r/…) always open live mode.
const LIVE_BY_DEFAULT = false;
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
