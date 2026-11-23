-- 003: line the live pilot up with the proposal deck.
-- * Invite and return links work in at most 3 browsers per role ("this link has been used" after that).
-- * KPI counts survive when someone deletes a strip: events keep a random stand-in id, never the content.
-- * A strip only finishes with a photo of the pair (deck: "The strip only finishes with a photo of the two of them together").
-- * Site visits by source (?ref=boost3, ?ref=bio, ...) are counted without sign-in or identifiers.
-- * KPI views match the deck targets and windows. Devices tagged ?ref=test are left out.

-- ---------------------------------------------------------------- events outlive strips
alter table public.events drop constraint if exists events_strip_id_fkey;
create index if not exists events_strip_idx on public.events (strip_id);

create or replace function public.delete_strip(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id); k uuid := gen_random_uuid();
begin
  if r is null then raise exception 'not_member'; end if;
  -- Keep the counts, drop the link: swap the strip id for a random key nobody holds.
  update public.events set strip_id = k where strip_id = p_id;
  insert into public.events (name, strip_id, role) values ('strip_deleted', k, r);
  delete from public.strips where id = p_id;
end $$;

-- ---------------------------------------------------------------- link cap
create or replace function public.claim_strip(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); h text; s public.strips; r text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 80 then raise exception 'invalid_token'; end if;
  h := encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  select * into s from public.strips where owner_token_hash = h;
  if found then r := 'owner';
  else
    select * into s from public.strips where friend_token_hash = h;
    if found then r := 'friend'; end if;
  end if;
  if r is null then raise exception 'invalid_token'; end if;
  if exists (select 1 from public.strip_members m where m.strip_id = s.id and m.uid = v_uid and m.role <> r) then
    raise exception 'own_link';
  end if;
  if not exists (select 1 from public.strip_members m where m.strip_id = s.id and m.uid = v_uid) then
    -- Room for the same person on a few browsers (Instagram's in-app browser, Safari, Chrome), not for strangers.
    if (select count(*) from public.strip_members m where m.strip_id = s.id and m.role = r) >= 3 then
      raise exception 'link_used';
    end if;
    insert into public.strip_members (strip_id, uid, role) values (s.id, v_uid, r);
  end if;
  if r = 'friend' and s.friend_claimed_at is null then
    update public.strips set friend_claimed_at = now(), updated_at = now() where id = s.id;
    insert into public.events (name, strip_id, role, ref) values ('invite_opened', s.id, 'friend', s.ref);
  end if;
  return jsonb_build_object('id', s.id, 'role', r);
end $$;

-- ---------------------------------------------------------------- stricter saves
create or replace function public.save_turn(p_id uuid, p_stage text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id); clean jsonb := '{}'::jsonb; k text; v_ref text;
begin
  if r is null then raise exception 'not_member'; end if;
  if p_stage not in ('now','then','next','meetup') then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_input'; end if;
  foreach k in array array['text','format','askBack','idea','ideaId','time','caption'] loop
    if jsonb_typeof(p_payload->k) = 'string' then clean := clean || jsonb_build_object(k, left(p_payload->>k, 600)); end if;
  end loop;
  foreach k in array array['note','accepted'] loop
    if jsonb_typeof(p_payload->k) = 'boolean' then clean := clean || jsonb_build_object(k, (p_payload->>k)::boolean); end if;
  end loop;
  -- Only paths this site makes: {strip id}/{random uuid}.jpg
  if jsonb_typeof(p_payload->'photo') = 'string'
     and p_payload->>'photo' ~ ('^' || p_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$') then
    clean := clean || jsonb_build_object('photo', p_payload->>'photo');
  end if;

  insert into public.turns (strip_id, stage, role, payload) values (p_id, p_stage, r, clean)
  on conflict (strip_id, stage, role) do update set payload = excluded.payload, updated_at = now();
  update public.strips set updated_at = now() where id = p_id returning strips.ref into v_ref;
  insert into public.events (name, strip_id, role, ref, props)
  values ('turn_saved', p_id, r, v_ref, jsonb_build_object('stage', p_stage, 'photo', clean ? 'photo'));
  return private.strip_json(p_id, auth.uid());
end $$;

create or replace function public.update_strip(p_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id); s public.strips; ns text; has_photo boolean;
begin
  if r is null then raise exception 'not_member'; end if;
  select * into s from public.strips where id = p_id;

  if p_patch ? 'myName' and jsonb_typeof(p_patch->'myName') = 'string' then
    if length(btrim(p_patch->>'myName')) > 40 then raise exception 'invalid_input'; end if;
    if r = 'owner' then update public.strips set owner_name = btrim(p_patch->>'myName') where id = p_id;
    else update public.strips set friend_name = coalesce(nullif(btrim(p_patch->>'myName'), ''), s.friend_name) where id = p_id; end if;
  end if;
  if r = 'owner' and p_patch ? 'opener' and jsonb_typeof(p_patch->'opener') = 'string' then
    update public.strips set opener = left(p_patch->>'opener', 400) where id = p_id;
  end if;
  if p_patch ? 'stage' and jsonb_typeof(p_patch->'stage') = 'string' then
    ns := p_patch->>'stage';
    if private.stage_idx(ns) is null then raise exception 'invalid_input'; end if;
    if private.stage_idx(ns) > private.stage_idx(s.stage) then
      if ns = 'done' then
        -- Finishing needs the plan, the reply and a photo of the pair.
        has_photo := exists (select 1 from public.turns t where t.strip_id = p_id and t.stage = 'meetup' and t.payload ? 'photo');
        if not has_photo
           or (select count(*) from public.turns t where t.strip_id = p_id and t.stage = 'next') < 2 then
          raise exception 'needs_meetup_photo';
        end if;
        update public.strips set stage = 'done' where id = p_id;
        insert into public.events (name, strip_id, role, ref, props)
        values ('strip_done', p_id, r, s.ref, jsonb_build_object('pair_photo', true));
      elsif r = 'owner' and ns <> 'meetup' then
        update public.strips set stage = ns where id = p_id;
      end if;
    end if;
  end if;
  update public.strips set updated_at = now() where id = p_id;
  return private.strip_json(p_id, auth.uid());
end $$;

-- ---------------------------------------------------------------- visits by source (no sign-in, no identifiers)
create or replace function public.log_visit(p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r text := lower(btrim(coalesce(p_ref, '')));
begin
  if r !~ '^[a-z0-9_-]{1,24}$' then r := 'direct'; end if;
  -- Soft ceiling so a script can't flood the table.
  if (select count(*) from public.events e where e.name = 'visit' and e.created_at > now() - interval '1 minute') >= 120 then return; end if;
  insert into public.events (name, ref) values ('visit', r);
end $$;
revoke all on function public.log_visit(text) from public;
grant execute on function public.log_visit(text) to anon, authenticated;

-- ---------------------------------------------------------------- KPI views (private: read in the SQL editor)
drop view if exists private.kpi_summary;
drop view if exists private.kpi_door;
drop view if exists private.door_choices;

-- Window from the deck: re:frame is judged 30 Nov 2026 to 24 Jan 2027 (Singapore time); booth from 11 Jan.
create or replace view private.kpi_window as
select timestamptz '2026-11-30 00:00+08' as starts, timestamptz '2027-01-25 00:00+08' as ends,
       timestamptz '2027-01-11 00:00+08' as booth_starts;

-- One row per strip, rebuilt from events so deleted strips still count.
create or replace view private.kpi_strips as
select e.strip_id,
  min(e.created_at) filter (where e.name = 'strip_created') as created_at,
  coalesce(max(e.ref) filter (where e.name = 'strip_created'), 'none') as ref,
  bool_or(e.name = 'invite_shared') as shared,
  bool_or(e.name = 'invite_opened') as opened,
  bool_or(e.name = 'turn_saved' and e.role = 'friend') as friend_added,
  bool_or(e.name = 'strip_done' and coalesce((e.props->>'pair_photo')::boolean, false)) as finished_with_photo,
  bool_or(e.name = 'door_tap') as door_tapped,
  bool_or(e.name = 'door_tap' and e.role = 'owner') as door_tapped_owner,
  bool_or(e.name = 'door_tap' and e.role = 'friend') as door_tapped_friend,
  bool_or(e.name = 'door_submit') as door_submitted,
  bool_or(e.name = 'share_story') as story_tapped,
  bool_or(e.name = 'download_image') as image_saved,
  bool_or(e.name = 'strip_deleted') as deleted
from public.events e
where e.strip_id is not null
group by e.strip_id;

create or replace view private.kpi_deck as
with k as (
  select s.* , w.booth_starts from private.kpi_strips s, private.kpi_window w
  where s.created_at >= w.starts and s.created_at < w.ends and s.ref <> 'test'
), v as (
  select e.* from public.events e, private.kpi_window w
  where e.name = 'visit' and e.created_at >= w.starts and e.created_at < w.ends
), f as (
  select count(*) filter (where finished_with_photo) as fin,
         count(*) filter (where finished_with_photo and door_tapped) as tap from k
)
select 1 as n, 'Invites sent, all traffic' as kpi, '25 or more' as target,
  (select count(*) from k where shared)::text as result,
  (select count(*) from k where shared) >= 25 as met
union all
select 2, 'Invites sent by booth visitors (from 11 Jan)', '10 or more',
  (select count(*) from k where shared and ref = 'booth' and created_at >= booth_starts)::text,
  (select count(*) from k where shared and ref = 'booth' and created_at >= booth_starts) >= 10
union all
select 3, 'Invites opened by friends', 'Reported, no target',
  (select count(*) from k where opened)::text, null
union all
select 4, 'Finished strips with a photo of the pair', '10 or more',
  (select fin from f)::text, (select fin from f) >= 10
union all
select 5, '"Keep going together" taps on finished strips', '15% or more, and at least 3 taps',
  (select tap || ' of ' || fin || ' (' || coalesce(round(100.0 * tap / nullif(fin, 0)), 0) || '%)' from f),
  (select tap >= 3 and tap >= 0.15 * fin and fin > 0 from f)
union all
select 6, 're:frame visits from the 2 website boosts (?ref=boost...)', '20 or more',
  (select count(*) from v where ref like 'boost%')::text,
  (select count(*) from v where ref like 'boost%') >= 20
order by n;

-- Funnel by source tag, for the "site visits by source" line and the booth breakdown.
create or replace view private.kpi_by_source as
with w as (select * from private.kpi_window),
vis as (select e.ref, count(*) as visits from public.events e, w
        where e.name = 'visit' and e.created_at >= w.starts and e.created_at < w.ends group by e.ref),
st as (select s.ref, count(*) as strips_started, count(*) filter (where shared) as invites_sent,
         count(*) filter (where opened) as invites_opened, count(*) filter (where friend_added) as friend_added_frame,
         count(*) filter (where finished_with_photo) as finished_with_photo, count(*) filter (where story_tapped) as story_share_taps,
         count(*) filter (where deleted) as deleted_by_users
       from private.kpi_strips s, w where s.created_at >= w.starts and s.created_at < w.ends group by s.ref)
select coalesce(vis.ref, st.ref) as ref, coalesce(vis.visits, 0) as visits,
  coalesce(strips_started, 0) as strips_started, coalesce(invites_sent, 0) as invites_sent,
  coalesce(invites_opened, 0) as invites_opened, coalesce(friend_added_frame, 0) as friend_added_frame,
  coalesce(finished_with_photo, 0) as finished_with_photo, coalesce(story_share_taps, 0) as story_share_taps,
  coalesce(deleted_by_users, 0) as deleted_by_users
from vis full join st on st.ref = vis.ref
order by visits desc;

-- Fake door detail: who tapped and what they picked.
create or replace view private.kpi_door as
with k as (select s.* from private.kpi_strips s, private.kpi_window w
           where s.created_at >= w.starts and s.created_at < w.ends and s.ref <> 'test')
select count(*) filter (where finished_with_photo) as finished_strips,
  count(*) filter (where finished_with_photo and door_tapped) as finished_with_tap,
  count(*) filter (where door_tapped_owner) as tapped_by_owner,
  count(*) filter (where door_tapped_friend) as tapped_by_friend,
  count(*) filter (where door_submitted) as form_completed
from k;

create or replace view private.door_choices as
select choice, role, count(*) as n
from (select distinct on (e.strip_id, e.role) e.props->>'choice' as choice, e.role
      from public.events e where e.name = 'door_submit' order by e.strip_id, e.role, e.created_at desc) latest
group by 1, 2 order by n desc;

revoke all on private.kpi_window, private.kpi_strips, private.kpi_deck, private.kpi_by_source,
  private.kpi_door, private.door_choices from public, anon, authenticated;
