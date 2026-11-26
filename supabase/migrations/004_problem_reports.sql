-- 004: "Something not working?" problem reports.
-- Anyone on the site (demo or live, signed in or not) can send a short report through
-- public.report_problem. Reports live in the private schema: nobody can read them through
-- the API, only in the SQL editor:  select * from private.reports order by created_at desc;

create table if not exists private.reports (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  note       text not null check (char_length(note) between 1 and 500),
  screen     text not null default 'unknown' check (char_length(screen) <= 60),
  device     text not null default 'unknown' check (device in ('phone','tablet','computer','unknown')),
  os         text not null default 'other'   check (os in ('ios','android','windows','mac','other')),
  browser    text not null default 'other'   check (char_length(browser) <= 16),
  mode       text not null default 'unknown' check (mode in ('live','demo','unknown')),
  ref        text check (ref is null or ref ~ '^[a-z0-9_-]{1,24}$'),
  status     text not null default 'new' check (status in ('new','fixed','wontfix','duplicate'))
);
alter table private.reports enable row level security;
revoke all on private.reports from public, anon, authenticated;
create index if not exists reports_created_at_idx on private.reports (created_at desc);

create or replace function public.report_problem(
  p_note text, p_screen text default null, p_device text default null, p_os text default null,
  p_browser text default null, p_mode text default null, p_ref text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  n text := btrim(coalesce(p_note, ''));
  scr text := left(coalesce(p_screen, ''), 60);
  b text := lower(coalesce(p_browser, ''));
  r text := lower(btrim(coalesce(p_ref, '')));
begin
  if char_length(n) < 3 then raise exception 'note_too_short'; end if;
  n := left(n, 500);
  -- Keep contact details out even if someone types them in.
  n := regexp_replace(n, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[email removed]', 'g');
  n := regexp_replace(n, '\+?[0-9]{4}[ -]?[0-9]{4,}', '[number removed]', 'g');
  -- Strip ids and link tokens out of the screen, keep only the route shape.
  scr := regexp_replace(scr, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi');
  scr := regexp_replace(scr, '/(j|r)/[A-Za-z0-9_-]+', '/\1/:link', 'g');
  scr := regexp_replace(scr, '[^#/:a-z0-9_-]', '', 'gi');
  if scr = '' then scr := 'unknown'; end if;
  if b !~ '^[a-z-]{1,16}$' then b := 'other'; end if;
  if r !~ '^[a-z0-9_-]{1,24}$' then r := null; end if;

  -- Ceilings so a script can't flood the table (per-browser limit is in the app).
  if (select count(*) from private.reports where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limited';
  end if;
  if (select count(*) from private.reports where created_at > now() - interval '1 day') >= 300 then
    raise exception 'rate_limited';
  end if;

  insert into private.reports (note, screen, device, os, browser, mode, ref)
  values (
    n, scr,
    case when p_device in ('phone','tablet','computer') then p_device else 'unknown' end,
    case when p_os in ('ios','android','windows','mac') then p_os else 'other' end,
    b,
    case when p_mode in ('live','demo') then p_mode else 'unknown' end,
    r
  );
end $$;
revoke all on function public.report_problem(text, text, text, text, text, text, text) from public;
grant execute on function public.report_problem(text, text, text, text, text, text, text) to anon, authenticated;
