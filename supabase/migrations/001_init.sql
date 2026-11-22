-- re:frame live pilot, migration 001
-- Access model: no direct table access for anon/authenticated. Everything goes through
-- SECURITY DEFINER functions. Supabase anonymous sign-ins carry the session (role
-- 'authenticated', is_anonymous = true); the secret link tokens are the real credentials.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated; -- needed so storage policies can call the one helper below

-- ---------------------------------------------------------------- tables
create table public.strips (
  id uuid primary key default gen_random_uuid(),
  owner_token_hash text not null unique,
  friend_token_hash text not null unique,
  owner_name text not null default '',
  friend_name text not null default '',
  gap text not null default '',
  place text not null default '',
  opener text not null default '',
  stage text not null default 'invite' check (stage in ('invite','now','then','next','meetup','done')),
  ref text,
  friend_claimed_at timestamptz,
  owner_share_ok boolean not null default false,
  friend_share_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strip_members (
  strip_id uuid not null references public.strips(id) on delete cascade,
  uid uuid not null,
  role text not null check (role in ('owner','friend')),
  created_at timestamptz not null default now(),
  primary key (strip_id, uid)
);
create index strip_members_uid_idx on public.strip_members (uid);

create table public.turns (
  strip_id uuid not null references public.strips(id) on delete cascade,
  stage text not null check (stage in ('now','then','next','meetup')),
  role text not null check (role in ('owner','friend')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (strip_id, stage, role)
);

create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  strip_id uuid references public.strips(id) on delete set null,
  role text,
  ref text,
  props jsonb not null default '{}'::jsonb
);
create index events_name_idx on public.events (name, created_at);

create table public.door_responses (
  strip_id uuid not null references public.strips(id) on delete cascade,
  role text not null check (role in ('owner','friend')),
  choice text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (strip_id, role)
);

alter table public.strips enable row level security;
alter table public.strip_members enable row level security;
alter table public.turns enable row level security;
alter table public.events enable row level security;
alter table public.door_responses enable row level security;
revoke all on public.strips, public.strip_members, public.turns, public.events, public.door_responses from anon, authenticated;

-- ---------------------------------------------------------------- helpers (private)
create or replace function private.strip_json(p_id uuid, p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.strips; r text; o jsonb;
begin
  select * into s from public.strips where id = p_id;
  select role into r from public.strip_members where strip_id = p_id and uid = p_uid;
  if s.id is null or r is null then return null; end if;

  select coalesce(jsonb_object_agg(st.stage, jsonb_strip_nulls(jsonb_build_object(
      'me',     (select t.payload from public.turns t where t.strip_id = p_id and t.stage = st.stage and t.role = r),
      'friend', (select t.payload from public.turns t where t.strip_id = p_id and t.stage = st.stage and t.role <> r)
    ))), '{}'::jsonb)
  into o
  from (select unnest(array['now','then','next','meetup']) as stage) st;

  return jsonb_build_object(
    'id', s.id,
    'role', r,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at,
    'myName', case when r = 'owner' then s.owner_name else s.friend_name end,
    'friendName', case when r = 'owner' then s.friend_name else s.owner_name end,
    'gap', s.gap, 'place', s.place, 'opener', s.opener, 'stage', s.stage,
    'friendClaimed', s.friend_claimed_at is not null,
    'shareOk', jsonb_build_object(
      'me',     case when r = 'owner' then s.owner_share_ok else s.friend_share_ok end,
      'friend', case when r = 'owner' then s.friend_share_ok else s.owner_share_ok end),
    'doorDone', exists (select 1 from public.door_responses d where d.strip_id = p_id and d.role = r),
    'turns', o
  );
end $$;

create or replace function private.role_of(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.strip_members where strip_id = p_id and uid = auth.uid()
$$;

create or replace function private.stage_idx(p text)
returns int language sql immutable set search_path = '' as $$
  select array_position(array['invite','now','then','next','meetup','done'], p)
$$;

create or replace function private.can_access_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare sid uuid;
begin
  begin sid := split_part(p_name, '/', 1)::uuid; exception when others then return false; end;
  return exists (select 1 from public.strip_members where strip_id = sid and uid = auth.uid());
end $$;

revoke all on function private.strip_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.role_of(uuid) from public, anon, authenticated;
revoke all on function private.stage_idx(text) from public, anon, authenticated;
revoke all on function private.can_access_photo(text) from public, anon;
grant execute on function private.can_access_photo(text) to authenticated;

-- ---------------------------------------------------------------- public RPCs
create or replace function public.create_strip(p_owner_name text, p_friend_name text, p_gap text, p_place text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); sid uuid; ot text; ft text; fn text := btrim(coalesce(p_friend_name, '')); r text := nullif(btrim(coalesce(p_ref, '')), '');
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if length(fn) < 1 or length(fn) > 40 then raise exception 'invalid_input'; end if;
  if length(coalesce(p_owner_name,'')) > 40 or length(coalesce(p_gap,'')) > 40 or length(coalesce(p_place,'')) > 80 then raise exception 'invalid_input'; end if;
  if r is not null and r !~ '^[a-z0-9_-]{1,24}$' then r := null; end if;
  if (select count(*) from public.strip_members m where m.uid = v_uid and m.role = 'owner' and m.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'rate_limited';
  end if;

  ot := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
  ft := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40);
  insert into public.strips (owner_token_hash, friend_token_hash, owner_name, friend_name, gap, place, ref)
  values (encode(sha256(convert_to(ot, 'utf8')), 'hex'), encode(sha256(convert_to(ft, 'utf8')), 'hex'),
          btrim(coalesce(p_owner_name, '')), fn, btrim(coalesce(p_gap, '')), btrim(coalesce(p_place, '')), r)
  returning id into sid;
  insert into public.strip_members (strip_id, uid, role) values (sid, v_uid, 'owner');
  insert into public.events (name, strip_id, role, ref) values ('strip_created', sid, 'owner', r);
  return jsonb_build_object('id', sid, 'ownerToken', ot, 'friendToken', ft);
end $$;

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
  insert into public.strip_members (strip_id, uid, role) values (s.id, v_uid, r) on conflict do nothing;
  if r = 'friend' and s.friend_claimed_at is null then
    update public.strips set friend_claimed_at = now(), updated_at = now() where id = s.id;
    insert into public.events (name, strip_id, role, ref) values ('invite_opened', s.id, 'friend', s.ref);
  end if;
  return jsonb_build_object('id', s.id, 'role', r);
end $$;

create or replace function public.get_strip(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.strip_json(p_id, auth.uid())
$$;

create or replace function public.list_strips()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(j order by (j->>'updatedAt') desc), '[]'::jsonb)
  from (select private.strip_json(m.strip_id, auth.uid()) as j
        from public.strip_members m where m.uid = auth.uid()) x
  where j is not null
$$;

create or replace function public.update_strip(p_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id); s public.strips; ns text;
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
    if private.stage_idx(ns) > private.stage_idx(s.stage) and (r = 'owner' or ns = 'done') then
      update public.strips set stage = ns where id = p_id;
      if ns = 'done' then insert into public.events (name, strip_id, role, ref) values ('strip_done', p_id, r, s.ref); end if;
    end if;
  end if;
  update public.strips set updated_at = now() where id = p_id;
  return private.strip_json(p_id, auth.uid());
end $$;

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
  if jsonb_typeof(p_payload->'photo') = 'string' and starts_with(p_payload->>'photo', p_id::text || '/') and length(p_payload->>'photo') <= 200 then
    clean := clean || jsonb_build_object('photo', p_payload->>'photo');
  end if;

  insert into public.turns (strip_id, stage, role, payload) values (p_id, p_stage, r, clean)
  on conflict (strip_id, stage, role) do update set payload = excluded.payload, updated_at = now();
  update public.strips set updated_at = now() where id = p_id returning strips.ref into v_ref;
  insert into public.events (name, strip_id, role, ref, props) values ('turn_saved', p_id, r, v_ref, jsonb_build_object('stage', p_stage));
  return private.strip_json(p_id, auth.uid());
end $$;

create or replace function public.set_share_ok(p_id uuid, p_value boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id);
begin
  if r is null then raise exception 'not_member'; end if;
  if r = 'owner' then update public.strips set owner_share_ok = coalesce(p_value, false), updated_at = now() where id = p_id;
  else update public.strips set friend_share_ok = coalesce(p_value, false), updated_at = now() where id = p_id; end if;
  insert into public.events (name, strip_id, role, props) values ('share_consent', p_id, r, jsonb_build_object('value', coalesce(p_value, false)));
  return private.strip_json(p_id, auth.uid());
end $$;

create or replace function public.log_event(p_name text, p_id uuid default null, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r text; v_ref text;
begin
  if auth.uid() is null then return; end if;
  if p_name not in ('invite_shared','door_tap','share_story','download_image','strip_viewed_done') then return; end if;
  if p_id is not null then
    r := private.role_of(p_id);
    if r is null then return; end if;
    select s.ref into v_ref from public.strips s where s.id = p_id;
  end if;
  if p_props is null or jsonb_typeof(p_props) <> 'object' or pg_column_size(p_props) > 400 then p_props := '{}'::jsonb; end if;
  insert into public.events (name, strip_id, role, ref, props) values (p_name, p_id, r, v_ref, p_props);
end $$;

create or replace function public.door_response(p_id uuid, p_choice text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id); v_ref text;
begin
  if r is null then raise exception 'not_member'; end if;
  if p_choice is null or length(p_choice) < 1 or length(p_choice) > 40 then raise exception 'invalid_input'; end if;
  insert into public.door_responses (strip_id, role, choice, note)
  values (p_id, r, p_choice, left(coalesce(p_note, ''), 300))
  on conflict (strip_id, role) do update set choice = excluded.choice, note = excluded.note;
  select s.ref into v_ref from public.strips s where s.id = p_id;
  insert into public.events (name, strip_id, role, ref, props) values ('door_submit', p_id, r, v_ref, jsonb_build_object('choice', p_choice));
  return private.strip_json(p_id, auth.uid());
end $$;

create or replace function public.strip_photo_paths(p_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(t.payload->>'photo'), '{}')
  from public.turns t
  where t.strip_id = p_id and private.role_of(p_id) is not null and t.payload ? 'photo'
$$;

create or replace function public.delete_strip(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r text := private.role_of(p_id);
begin
  if r is null then raise exception 'not_member'; end if;
  insert into public.events (name, strip_id, role) values ('strip_deleted', null, r);
  delete from public.strips where id = p_id;
end $$;

create or replace function public.ping()
returns timestamptz language sql stable security definer set search_path = '' as $$ select now() $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.create_strip(text,text,text,text,text) from public, anon;
revoke all on function public.claim_strip(text) from public, anon;
revoke all on function public.get_strip(uuid) from public, anon;
revoke all on function public.list_strips() from public, anon;
revoke all on function public.update_strip(uuid,jsonb) from public, anon;
revoke all on function public.save_turn(uuid,text,jsonb) from public, anon;
revoke all on function public.set_share_ok(uuid,boolean) from public, anon;
revoke all on function public.log_event(text,uuid,jsonb) from public, anon;
revoke all on function public.door_response(uuid,text,text) from public, anon;
revoke all on function public.strip_photo_paths(uuid) from public, anon;
revoke all on function public.delete_strip(uuid) from public, anon;
revoke all on function public.ping() from public;

grant execute on function public.create_strip(text,text,text,text,text) to authenticated;
grant execute on function public.claim_strip(text) to authenticated;
grant execute on function public.get_strip(uuid) to authenticated;
grant execute on function public.list_strips() to authenticated;
grant execute on function public.update_strip(uuid,jsonb) to authenticated;
grant execute on function public.save_turn(uuid,text,jsonb) to authenticated;
grant execute on function public.set_share_ok(uuid,boolean) to authenticated;
grant execute on function public.log_event(text,uuid,jsonb) to authenticated;
grant execute on function public.door_response(uuid,text,text) to authenticated;
grant execute on function public.strip_photo_paths(uuid) to authenticated;
grant execute on function public.delete_strip(uuid) to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------- storage (private bucket, members only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 1572864, array['image/jpeg'])
on conflict (id) do nothing;

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and private.can_access_photo(name));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and private.can_access_photo(name));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and private.can_access_photo(name));
