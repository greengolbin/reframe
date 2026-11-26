# Re:frame · This Is Random But…

A mobile-first web prototype of **Re:frame**, the friendship photostrip tool for the
*This Is Random But…* campaign (MSF Youth and Relationships brief, Ngee Ann Polytechnic IMP capstone).

**Live site:** https://greengolbin.github.io/reframe/

> Student project prototype. Not an official MSF service.

## What it does

1. **Landing:** the perception-gap hook (73% vs 23%, our survey of 124 youths aged 17–25).
2. **Start a photostrip:** friend's name, how long it's been, where you got close. No sign-up.
3. **Send the invite:** personalised openers, editable, shared via Instagram / WhatsApp / Telegram / copy.
4. **Friend's view:** what the friend sees when they open the link.
5. **Stage 1 · now, Stage 2 · then, Stage 3 · next:** prompts with "ask back", photo upload, optional note, activity ideas matched to what you both wrote.
6. **Waiting / their frame arrives:** the friend's part appears as a new frame on the shared strip. Re:frame has no chat; the conversation carries on in Instagram, Telegram or WhatsApp.
7. **Photostrip done:** draws a 1080×1920 Story-sized image with five frames (now and then from each of you, plus the photo you take together when you meet up) that you can save or share (Photostrip Challenge).
8. **Reconnecting FAQ:** searchable, curated tips, "use this as my opener".

## Demo mode

Everything is stored in the visitor's own browser (`localStorage`). Nothing is sent to a server,
and the friend's replies are simulated (`js/store.js` → `waitForFriend`). Visitors can clear their
data from the About page.

## Editing copy

All the words live in **`js/content.js`** (openers, prompts, activity ideas, FAQ, survey stats,
disclaimer). Change text there; no other file needs to change.

To confirm before launch: the campaign hashtag (`site.hashtag`, currently `#ThisIsRandomBut`).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | Page shell, meta tags, link preview |
| `css/styles.css` | Design tokens and components (matches the v2 Figma) |
| `js/content.js` | All copy |
| `js/store.js` | Data layer: demo store now, swap for a real backend later |
| `js/app.js` | Screens and routing (hash routes, e.g. `#/start`) |
| `js/photostrip.js` | Draws the downloadable photostrip |
| `assets/` | Self-hosted fonts (Fredoka, DM Sans, Caveat), logo, character SVGs (Encourager, Overthinker), icons |

No build step and no dependencies. GitHub Pages serves the files as they are.

## Accessibility and performance

- Text contrast meets WCAG 2.2 AA (Deep Plum on cream is 7.5:1); orange, yellow and coral are never used as text colours.
- Fits a standard phone screen without scrolling (tested at 390×664 and 412×780; small phones such as the iPhone SE may scroll slightly on a few screens). Buttons 48 px, chips 36 px, inputs 16 px so iOS doesn't zoom, visible keyboard focus, form labels, focus moves to each screen's heading.
- Respects "reduce motion". Fonts are self-hosted (no third-party requests). First load is about 250 KB.
- Automated checks: axe-core (WCAG 2.0/2.1/2.2 A and AA) reported no violations on every screen.

## Path to the real two-person version (phase 2)

`js/store.js` already defines the methods the screens use (`createStrip`, `getStrip`, `saveTurn`,
`waitForFriend`, …). A real version replaces `DemoStore` with a class that calls a backend
(e.g. Supabase, Singapore region) with:

- private, unguessable links per strip and row-level security so only the two friends can read it;
- photo storage with size limits;
- realtime updates instead of the simulated reply;
- a consent notice, PDPA-compliant retention (delete after the pilot) and opt-in sharing by both friends.

## Live two-person mode (Supabase)

- Off by default until go-live. Turn it on for a browser with `?live` on the address (for example `https://greengolbin.github.io/reframe/?live`); `?demo` turns it off again. Friend links (`#/j/…`) and return links (`#/r/…`) always open live mode. To launch for everyone, set `LIVE_BY_DEFAULT = true` in `js/config.js`.
- Database: `supabase/migrations/001_init.sql` (tables, access rules, functions, private photo bucket), `002_kpi_and_ping.sql` (ping), `003_deck_kpis.sql` (link cap, KPI views matching the proposal deck) and `004_problem_reports.sql` (problem reports). All access is through functions; the browser never reads tables directly.
- Each invite or return link opens in at most 3 browsers per person (for example Instagram's in-app browser, Safari and Chrome). After that it shows "this link has been used".
- A strip only finishes with a photo of the pair, as in the deck.
- Sign-in: Supabase anonymous sign-ins with a Cloudflare Turnstile check. The secret link tokens are the real credentials and are stored hashed.
- KPI views (run in the Supabase SQL editor). They cover the deck's window, 30 Nov 2026 to 24 Jan 2027, and still count strips people delete (only a random stand-in id is kept):
  - `select * from private.kpi_deck;` every re:frame KPI from the deck with its target, result and whether it is met
  - `select * from private.kpi_by_source;` visits, strips, invites and finished strips per source tag
  - `select * from private.kpi_door;` and `select * from private.door_choices;` the "Keep going together" detail
- Problem reports: "Report a problem" in the landing footer and on the About page, and "Tell us what happened" on error screens, open a short form. It works in demo and live mode. Each report keeps the note (emails and phone numbers are stripped), the screen with ids and link codes removed, phone/tablet/computer, OS, browser (including Instagram and other in-app browsers), mode and source tag. Limits: 3 per browser per hour, 30 per 10 minutes and 300 per day overall. Read them with `select * from private.reports where status = 'new' order by created_at desc;` and mark one handled with `update private.reports set status = 'fixed' where id = …;` (or `wontfix`, `duplicate`).
- Source tags: add `?ref=` to every link you control. Use `booth` on the take-home card QR, `boost3` and `boost7` on the two website boosts, `bio` on the Instagram and TikTok bio links. A visit is counted once per tag per day per browser, with no identifiers. The first tag a browser sees is saved onto the strips it starts; people who arrive from a friend's link are tagged `invite`. Team testing: open the site once with `?ref=test` on each test phone first, so test strips are left out of the KPIs.
- Keep-alive: `.github/workflows/keepalive.yml` pings the database twice a week so the free project does not pause.
- `js/vendor/supabase.js` is a bundled copy of `@supabase/supabase-js` 2.119.2.
