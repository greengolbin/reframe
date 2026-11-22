// Cloudflare Turnstile (Managed mode). Loaded only when a sign-in is needed, so
// people who only read the tips never load it.
import { config } from './config.js';

let scriptReady;
function loadScript() {
  scriptReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('turnstile_blocked'));
    document.head.append(s);
  });
  return scriptReady;
}

// Resolves with a one-time token. In Managed mode the widget stays invisible for
// most people and shows a small check only when Cloudflare is unsure.
export async function getCaptchaToken() {
  await loadScript();
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    box.className = 'turnstile-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Quick check that you’re a person');
    box.innerHTML = '<p class="small" style="margin:0 0 8px">One quick check…</p><div class="ts-mount"></div>';
    box.hidden = true;
    document.body.append(box);
    const done = (fn, v) => { try { window.turnstile.remove(id); } catch {} box.remove(); fn(v); };
    const id = window.turnstile.render(box.querySelector('.ts-mount'), {
      sitekey: config.turnstileSiteKey,
      callback: (t) => done(resolve, t),
      'error-callback': () => done(reject, new Error('turnstile_failed')),
      'timeout-callback': () => done(reject, new Error('turnstile_timeout')),
      'before-interactive-callback': () => { box.hidden = false; },
    });
    setTimeout(() => { if (box.isConnected) done(reject, new Error('turnstile_timeout')); }, 45000);
  });
}
