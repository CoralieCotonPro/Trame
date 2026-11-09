-- Partage par lien, gestion des droits et diffusion en temps réel.

-- ---------------------------------------------------------------------------
-- Liens de partage : seule l'empreinte du jeton est conservée.
-- ---------------------------------------------------------------------------

create table public.board_share_links (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index board_share_links_board_idx on public.board_share_links (board_id);

alter table public.board_share_links enable row level security;
revoke all on public.board_share_links from anon, authenticated;
grant select (id, board_id, role, expires_at, revoked_at, created_at)
  on public.board_share_links to authenticated;
create policy board_share_links_select on public.board_share_links for select to authenticated
  using ((select app_private.is_owner(board_id)));

-- Clé du canal temps réel. Une connexion déjà ouverte n'est pas revérifiée par le serveur :
-- renouveler la clé à chaque changement de droits rend l'ancien canal muet.
alter table public.boards add column realtime_key uuid not null default gen_random_uuid();

alter table public.board_permissions
  add column granted_by_link_id uuid references public.board_share_links (id) on delete cascade,
  add column display_name text check (char_length(display_name) <= 40);

-- ---------------------------------------------------------------------------
-- Fonctions réservées au propriétaire, et entrée par lien
-- ---------------------------------------------------------------------------

create function app_private.hash_token(p_token text) returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex'); $$;

create function app_private.notify_access_changed(p_board uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_key uuid;
begin
  select realtime_key into v_key from public.boards where id = p_board;
  perform realtime.send(
    '{}'::jsonb, 'access_changed', 'board:' || p_board::text || ':' || v_key::text, true
  );
  update public.boards set realtime_key = gen_random_uuid() where id = p_board;
end;
$$;

create function public.create_share_link(p_board uuid, p_role text, p_days integer default 7)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id uuid;
begin
  if not app_private.is_owner(p_board) then
    raise exception 'Réservé au propriétaire du tableau' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') or p_days is null or p_days not between 1 and 90 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  if (
    select count(*) from public.board_share_links
    where board_id = p_board and revoked_at is null and expires_at > now()
  ) >= 20 then
    raise exception 'Trop de liens actifs sur ce tableau' using errcode = '54000';
  end if;

  insert into public.board_share_links (board_id, role, token_hash, expires_at, created_by)
  values (p_board, p_role, app_private.hash_token(v_token), now() + make_interval(days => p_days), auth.uid())
  returning id into v_id;

  -- Le jeton en clair n'existe que dans cette réponse.
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create function public.revoke_share_link(p_link uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_board uuid;
begin
  select board_id into v_board from public.board_share_links where id = p_link;
  if v_board is null or not app_private.is_owner(v_board) then
    raise exception 'Réservé au propriétaire du tableau' using errcode = '42501';
  end if;
  update public.board_share_links set revoked_at = now() where id = p_link;
  delete from public.board_permissions where granted_by_link_id = p_link;
  perform app_private.notify_access_changed(v_board);
end;
$$;

create function public.redeem_share_link(p_token text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_link public.board_share_links;
  v_name text := left(coalesce(nullif(trim(p_display_name), ''), 'Invité'), 40);
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Session requise' using errcode = '42501';
  end if;

  select * into v_link from public.board_share_links
  where token_hash = app_private.hash_token(p_token)
    and revoked_at is null
    and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'Lien invalide, expiré ou révoqué' using errcode = '42501';
  end if;

  -- Un lien ne retire jamais un droit plus élevé déjà détenu.
  insert into public.board_permissions (board_id, user_id, role, granted_by_link_id, display_name)
  values (v_link.board_id, auth.uid(), v_link.role, v_link.id, v_name)
  on conflict (board_id, user_id) do update set
    display_name = excluded.display_name,
    granted_by_link_id = case
      when public.board_permissions.role = 'viewer' and excluded.role = 'editor'
        then excluded.granted_by_link_id
      else public.board_permissions.granted_by_link_id
    end,
    role = case
      when public.board_permissions.role = 'viewer' and excluded.role = 'editor' then 'editor'
      else public.board_permissions.role
    end
  returning role into v_role;

  return jsonb_build_object('board_id', v_link.board_id, 'role', v_role);
end;
$$;

create function public.set_member_role(p_board uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_owner(p_board) then
    raise exception 'Réservé au propriétaire du tableau' using errcode = '42501';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Rôle invalide' using errcode = '22023';
  end if;
  update public.board_permissions set role = p_role
  where board_id = p_board and user_id = p_user and role <> 'owner';
  perform app_private.notify_access_changed(p_board);
end;
$$;

create function public.remove_member(p_board uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not app_private.is_owner(p_board) then
    raise exception 'Réservé au propriétaire du tableau' using errcode = '42501';
  end if;
  delete from public.board_permissions
  where board_id = p_board and user_id = p_user and role <> 'owner';
  perform app_private.notify_access_changed(p_board);
end;
$$;

revoke all on function public.create_share_link(uuid, text, integer) from public, anon;
revoke all on function public.revoke_share_link(uuid) from public, anon;
revoke all on function public.redeem_share_link(text, text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.create_share_link(uuid, text, integer) to authenticated;
grant execute on function public.revoke_share_link(uuid) to authenticated;
grant execute on function public.redeem_share_link(text, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

revoke all on function app_private.hash_token(text) from public;
revoke all on function app_private.notify_access_changed(uuid) from public;

-- ---------------------------------------------------------------------------
-- Diffusion des changements durables : émise par la base, jamais par un navigateur.
-- ---------------------------------------------------------------------------

create function app_private.broadcast_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_board uuid;
  v_key uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_table_name = 'boards' then
    v_board := (v_row ->> 'id')::uuid;
  elsif tg_table_name = 'tag_values' then
    v_board := app_private.category_board((v_row ->> 'category_id')::uuid);
  else
    v_board := (v_row ->> 'board_id')::uuid;
  end if;

  select realtime_key into v_key from public.boards where id = v_board;
  if v_key is null and tg_table_name = 'boards' then
    v_key := (v_row ->> 'realtime_key')::uuid;
  end if;

  -- Absente lors d'une suppression en cascade : le parent est déjà diffusé.
  if v_key is not null then
    perform realtime.send(
      jsonb_build_object(
        'c', current_setting('app.client_id', true),
        't', tg_table_name,
        'o', left(tg_op, 1),
        'r', v_row - 'realtime_key'
      ),
      'db',
      'board:' || v_board::text || ':' || v_key::text,
      true
    );
  end if;
  return null;
end;
$$;

create trigger boards_broadcast after update or delete on public.boards
for each row execute function app_private.broadcast_change();
create trigger elements_broadcast after insert or update or delete on public.elements
for each row execute function app_private.broadcast_change();
create trigger element_tags_broadcast after insert or update or delete on public.element_tags
for each row execute function app_private.broadcast_change();
create trigger tag_categories_broadcast after insert or update or delete on public.tag_categories
for each row execute function app_private.broadcast_change();
create trigger tag_values_broadcast after insert or update or delete on public.tag_values
for each row execute function app_private.broadcast_change();

-- L'identifiant de l'onglet permet à l'émetteur d'ignorer ses propres changements.
drop function public.apply_board_ops(uuid, jsonb);

create function public.apply_board_ops(p_board uuid, p_ops jsonb, p_client text default null)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_op jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if not app_private.can_edit(p_board) then
    raise exception 'Écriture non autorisée sur ce tableau' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'Lot invalide ou trop grand' using errcode = '22023';
  end if;

  perform set_config('app.client_id', coalesce(left(p_client, 64), ''), true);

  for v_op in select value from jsonb_array_elements(p_ops) loop
    begin
      v_result := app_private.apply_op(p_board, v_op);
    exception when others then
      v_result := jsonb_build_object('status', 'rejected', 'code', sqlstate);
    end;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

revoke all on function public.apply_board_ops(uuid, jsonb, text) from public, anon;
grant execute on function public.apply_board_ops(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Autorisation des canaux temps réel
-- ---------------------------------------------------------------------------

-- Sujets : « board:<id>:<clé> » (données, glissements) et « board:<id>:<clé>:presence ».
-- Un sujet portant une clé périmée ne correspond à aucun tableau.
create function app_private.topic_board(p_topic text) returns uuid
language sql stable security definer set search_path = ''
as $$
  select b.id
  from public.boards b,
    regexp_match(
      p_topic,
      '^board:([0-9a-f-]{36}):([0-9a-f-]{36})(:presence)?$'
    ) as m
  where b.id = m[1]::uuid and b.realtime_key = m[2]::uuid;
$$;

revoke all on function app_private.topic_board(text) from public;
grant execute on function app_private.topic_board(text) to authenticated;

create policy board_channels_read on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and app_private.can_read(app_private.topic_board((select realtime.topic())))
  );

-- La présence et les curseurs sont ouverts aux membres ; le glissement, aux éditeurs.
create policy board_channels_write on realtime.messages for insert to authenticated
  with check (
    case
      when (select realtime.topic()) like '%:presence'
        then app_private.can_read(app_private.topic_board((select realtime.topic())))
      else extension = 'broadcast'
        and app_private.can_edit(app_private.topic_board((select realtime.topic())))
    end
  );
