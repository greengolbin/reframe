-- 002: ping as SECURITY INVOKER (it reads no tables), and KPI views in the private schema
-- (not exposed through the API; read them from the Supabase SQL editor or the connector).

create or replace function public.ping()
returns timestamptz language sql stable set search_path = '' as $$ select now() $$;

-- One row per source tag (ref = 'booth', 'none', ...) plus an 'all' row.
create or replace view private.kpi_summary as
with s as (
  select st.*, coalesce(st.ref, 'none') as src,
    exists (select 1 from public.events e where e.strip_id = st.id and e.name = 'invite_shared') as shared,
    exists (select 1 from public.turns t where t.strip_id = st.id and t.role = 'friend') as friend_turned,
    exists (select 1 from public.events e where e.strip_id = st.id and e.name = 'door_tap') as door_tapped,
    exists (select 1 from public.door_responses d where d.strip_id = st.id) as door_submitted
  from public.strips st
), g as (
  select src, id, stage, friend_claimed_at, shared, friend_turned, door_tapped, door_submitted,
         (owner_share_ok and friend_share_ok) as both_share from s
)
select coalesce(src, 'all') as ref,
  count(*) as strips_started,
  count(*) filter (where shared) as invites_shared,            -- intent only
  count(*) filter (where friend_claimed_at is not null) as invites_opened, -- only confirmed contact
  count(*) filter (where friend_turned) as friend_added_frame,
  count(*) filter (where stage = 'done') as strips_finished,
  count(*) filter (where both_share) as share_consent_both,
  count(*) filter (where door_tapped) as door_tapped,
  count(*) filter (where door_submitted) as door_form_completed
from g group by rollup (src);

-- Fake door: strips with a tap / finished strips, split by who tapped.
create or replace view private.kpi_door as
select
  count(*) filter (where st.stage = 'done') as finished_strips,
  count(*) filter (where st.stage = 'done' and exists (select 1 from public.events e where e.strip_id = st.id and e.name = 'door_tap')) as finished_with_tap,
  count(*) filter (where exists (select 1 from public.events e where e.strip_id = st.id and e.name = 'door_tap' and e.role = 'owner')) as tapped_by_owner,
  count(*) filter (where exists (select 1 from public.events e where e.strip_id = st.id and e.name = 'door_tap' and e.role = 'friend')) as tapped_by_friend,
  count(*) filter (where exists (select 1 from public.door_responses d where d.strip_id = st.id)) as form_completed
from public.strips st;

create or replace view private.door_choices as
select choice, role, count(*) as n from public.door_responses group by choice, role order by n desc;

revoke all on private.kpi_summary, private.kpi_door, private.door_choices from public, anon, authenticated;
