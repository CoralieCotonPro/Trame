-- Schéma du tableau blanc : tables, contraintes, droits d'accès et écriture groupée.
-- Toute règle de sécurité est ici : le navigateur n'est jamais considéré comme fiable.

create schema if not exists app_private;
grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Sans titre' check (char_length(name) <= 120),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boards_owner_idx on public.boards (owner_id);

create table public.board_permissions (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index board_permissions_user_idx on public.board_permissions (user_id);

create table public.elements (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  type text not null check (type in ('postit', 'text')),
  x double precision not null check (abs(x) <= 10000000),
  y double precision not null check (abs(y) <= 10000000),
  width double precision not null check (width > 0 and width <= 10000),
  height double precision not null check (height >= 0 and height <= 100000),
  z_index double precision not null,
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and pg_column_size(content) <= 16000
    and char_length(coalesce(content ->> 'body', '')) <= 5000
    and char_length(coalesce(content ->> 'text', '')) <= 5000
  ),
  style jsonb not null check (jsonb_typeof(style) = 'object' and pg_column_size(style) <= 1000),
  revision bigint not null default 1,
  content_revision bigint not null default 1,
  last_content_op uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, board_id)
);
create index elements_board_idx on public.elements (board_id);

create table public.tag_categories (
  id uuid primary key,
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, board_id)
);
create unique index tag_categories_name_idx on public.tag_categories (board_id, lower(name));

create table public.tag_values (
  id uuid primary key,
  category_id uuid not null references public.tag_categories (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  unique (id, category_id)
);
create unique index tag_values_label_idx on public.tag_values (category_id, lower(label));

-- La clé primaire impose une seule valeur par catégorie et par post-it.
-- Les clés composées garantissent que post-it, catégorie et valeur sont du même tableau.
create table public.element_tags (
  element_id uuid not null,
  board_id uuid not null,
  category_id uuid not null,
  tag_value_id uuid not null,
  primary key (element_id, category_id),
  foreign key (element_id, board_id) references public.elements (id, board_id) on delete cascade,
  foreign key (category_id, board_id) references public.tag_categories (id, board_id) on delete cascade,
  foreign key (tag_value_id, category_id) references public.tag_values (id, category_id) on delete cascade
);
create index element_tags_board_idx on public.element_tags (board_id);
create index element_tags_value_idx on public.element_tags (tag_value_id);

-- ---------------------------------------------------------------------------
-- Fonctions de droits (hors du schéma exposé par l'API)
-- ---------------------------------------------------------------------------

create function app_private.board_role(p_board uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.board_permissions
  where board_id = p_board and user_id = (select auth.uid());
$$;

create function app_private.can_read(p_board uuid) returns boolean
language sql stable set search_path = ''
as $$ select app_private.board_role(p_board) is not null; $$;

create function app_private.can_edit(p_board uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(app_private.board_role(p_board) in ('owner', 'editor'), false); $$;

create function app_private.is_owner(p_board uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(app_private.board_role(p_board) = 'owner', false); $$;

create function app_private.category_board(p_category uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select board_id from public.tag_categories where id = p_category; $$;

revoke all on all functions in schema app_private from public;
grant execute on all functions in schema app_private to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers : champs que le navigateur ne peut pas falsifier
-- ---------------------------------------------------------------------------

create function app_private.add_owner_permission() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.board_permissions (board_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger boards_add_owner after insert on public.boards
for each row execute function app_private.add_owner_permission();

create function app_private.touch_board() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger boards_touch before update on public.boards
for each row execute function app_private.touch_board();

create function app_private.before_element_insert() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.elements where board_id = new.board_id) >= 2000 then
    raise exception 'Limite de 2000 éléments par tableau atteinte' using errcode = '54000';
  end if;
  new.revision := 1;
  new.content_revision := 1;
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger elements_before_insert before insert on public.elements
for each row execute function app_private.before_element_insert();

create function app_private.before_element_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.id := old.id;
  new.board_id := old.board_id;
  new.type := old.type;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.content_revision := old.content_revision
    + case when new.content is distinct from old.content then 1 else 0 end;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger elements_before_update before update on public.elements
for each row execute function app_private.before_element_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.boards enable row level security;
alter table public.board_permissions enable row level security;
alter table public.elements enable row level security;
alter table public.tag_categories enable row level security;
alter table public.tag_values enable row level security;
alter table public.element_tags enable row level security;

revoke all on public.boards, public.board_permissions, public.elements, public.tag_categories,
  public.tag_values, public.element_tags from anon;

-- Une session anonyme (invité) ne peut pas créer de tableau.
-- owner_id : à la création, le droit « owner » n'est pas encore visible par cette vérification.
create policy boards_select on public.boards for select to authenticated
  using (owner_id = (select auth.uid()) or (select app_private.can_read(id)));
create policy boards_insert on public.boards for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy boards_update on public.boards for update to authenticated
  using ((select app_private.can_edit(id)));
create policy boards_delete on public.boards for delete to authenticated
  using ((select app_private.is_owner(id)));

-- Seul le nom d'un tableau est modifiable : son propriétaire ne change pas.
revoke update on public.boards from authenticated;
grant update (name) on public.boards to authenticated;

-- Les droits ne s'écrivent pas depuis le navigateur.
create policy board_permissions_select on public.board_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_owner(board_id)));
revoke insert, update, delete on public.board_permissions from authenticated;

create policy elements_select on public.elements for select to authenticated
  using ((select app_private.can_read(board_id)));
create policy elements_insert on public.elements for insert to authenticated
  with check ((select app_private.can_edit(board_id)));
create policy elements_update on public.elements for update to authenticated
  using ((select app_private.can_edit(board_id)));
create policy elements_delete on public.elements for delete to authenticated
  using ((select app_private.can_edit(board_id)));

create policy tag_categories_select on public.tag_categories for select to authenticated
  using ((select app_private.can_read(board_id)));
create policy tag_categories_insert on public.tag_categories for insert to authenticated
  with check ((select app_private.can_edit(board_id)));
create policy tag_categories_update on public.tag_categories for update to authenticated
  using ((select app_private.can_edit(board_id)));
create policy tag_categories_delete on public.tag_categories for delete to authenticated
  using ((select app_private.can_edit(board_id)));

create policy tag_values_select on public.tag_values for select to authenticated
  using ((select app_private.can_read(app_private.category_board(category_id))));
create policy tag_values_insert on public.tag_values for insert to authenticated
  with check ((select app_private.can_edit(app_private.category_board(category_id))));
create policy tag_values_update on public.tag_values for update to authenticated
  using ((select app_private.can_edit(app_private.category_board(category_id))));
create policy tag_values_delete on public.tag_values for delete to authenticated
  using ((select app_private.can_edit(app_private.category_board(category_id))));

create policy element_tags_select on public.element_tags for select to authenticated
  using ((select app_private.can_read(board_id)));
create policy element_tags_insert on public.element_tags for insert to authenticated
  with check ((select app_private.can_edit(board_id)));
create policy element_tags_update on public.element_tags for update to authenticated
  using ((select app_private.can_edit(board_id)));
create policy element_tags_delete on public.element_tags for delete to authenticated
  using ((select app_private.can_edit(board_id)));

-- ---------------------------------------------------------------------------
-- Écriture groupée. Exécutée avec les droits de l'appelant : la RLS s'applique.
-- ---------------------------------------------------------------------------

create function app_private.write_tags(p_board uuid, p_element uuid, p_tags jsonb) returns void
language plpgsql set search_path = ''
as $$
declare
  v_category text;
  v_value jsonb;
begin
  for v_category, v_value in select key, value from jsonb_each(coalesce(p_tags, '{}'::jsonb)) loop
    if jsonb_typeof(v_value) = 'null' then
      delete from public.element_tags
      where element_id = p_element and category_id = v_category::uuid;
    else
      insert into public.element_tags (element_id, board_id, category_id, tag_value_id)
      values (p_element, p_board, v_category::uuid, (v_value #>> '{}')::uuid)
      on conflict (element_id, category_id)
      do update set tag_value_id = excluded.tag_value_id;
    end if;
  end loop;
end;
$$;

create function app_private.create_element(p_board uuid, p_op jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_el jsonb := p_op -> 'element';
  v_id uuid := (v_el ->> 'id')::uuid;
  v_revision bigint;
  v_content_revision bigint;
begin
  insert into public.elements (id, board_id, type, x, y, width, height, z_index, content, style)
  values (
    v_id, p_board, v_el ->> 'type', (v_el ->> 'x')::float8, (v_el ->> 'y')::float8,
    (v_el ->> 'width')::float8, (v_el ->> 'height')::float8, (v_el ->> 'z_index')::float8,
    v_el -> 'content', v_el -> 'style'
  )
  on conflict (id) do nothing;

  select revision, content_revision into v_revision, v_content_revision
  from public.elements where id = v_id and board_id = p_board;
  if not found then
    raise exception 'Identifiant déjà utilisé' using errcode = '23505';
  end if;

  perform app_private.write_tags(p_board, v_id, v_el -> 'tags');
  return jsonb_build_object('status', 'ok', 'revision', v_revision, 'content_revision', v_content_revision);
end;
$$;

create function app_private.patch_element(p_board uuid, p_op jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid := (p_op ->> 'element_id')::uuid;
  v_op_id uuid := (p_op ->> 'id')::uuid;
  v_fields jsonb := coalesce(p_op -> 'fields', '{}'::jsonb);
  v_content jsonb := p_op -> 'content';
  v_base bigint := (p_op ->> 'base_content_revision')::bigint;
  v_current public.elements;
  v_write_content boolean := false;
  v_conflict boolean := false;
  v_revision bigint;
  v_content_revision bigint;
  v_final_content jsonb;
begin
  select * into v_current from public.elements
  where id = v_id and board_id = p_board for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  if v_content is not null and v_current.last_content_op is distinct from v_op_id then
    -- Même opération déjà appliquée : un renvoi après une réponse perdue ne crée pas de conflit.
    if v_base is not null and v_base <> v_current.content_revision then
      v_conflict := true;
    else
      v_write_content := true;
    end if;
  end if;

  update public.elements set
    x = coalesce((v_fields ->> 'x')::float8, x),
    y = coalesce((v_fields ->> 'y')::float8, y),
    width = coalesce((v_fields ->> 'width')::float8, width),
    height = coalesce((v_fields ->> 'height')::float8, height),
    z_index = coalesce((v_fields ->> 'z_index')::float8, z_index),
    style = style || coalesce(v_fields -> 'style', '{}'::jsonb),
    content = case when v_write_content then content || v_content else content end,
    last_content_op = case when v_write_content then v_op_id else last_content_op end
  where id = v_id and board_id = p_board
  returning revision, content_revision, content
  into v_revision, v_content_revision, v_final_content;

  perform app_private.write_tags(p_board, v_id, p_op -> 'tags');

  return jsonb_build_object(
    'status', case when v_conflict then 'conflict' else 'ok' end,
    'revision', v_revision,
    'content_revision', v_content_revision,
    'server_content', case when v_conflict then v_final_content end
  );
end;
$$;

create function app_private.apply_op(p_board uuid, p_op jsonb) returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_kind text := p_op ->> 'kind';
  v_item jsonb;
begin
  case v_kind
    when 'element.create' then
      return app_private.create_element(p_board, p_op);
    when 'element.patch' then
      return app_private.patch_element(p_board, p_op);
    when 'element.delete' then
      delete from public.elements
      where id = (p_op ->> 'element_id')::uuid and board_id = p_board;
    when 'category.upsert' then
      v_item := p_op -> 'category';
      insert into public.tag_categories (id, board_id, name, sort_order)
      values ((v_item ->> 'id')::uuid, p_board, v_item ->> 'name', (v_item ->> 'sort_order')::int)
      on conflict (id) do update
        set name = excluded.name, sort_order = excluded.sort_order
        where public.tag_categories.board_id = p_board;
    when 'category.delete' then
      delete from public.tag_categories
      where id = (p_op ->> 'category_id')::uuid and board_id = p_board;
    when 'value.upsert' then
      v_item := p_op -> 'value';
      if app_private.category_board((v_item ->> 'category_id')::uuid) is distinct from p_board then
        raise exception 'Catégorie étrangère à ce tableau' using errcode = '23503';
      end if;
      insert into public.tag_values (id, category_id, label, color, sort_order)
      values (
        (v_item ->> 'id')::uuid, (v_item ->> 'category_id')::uuid, v_item ->> 'label',
        v_item ->> 'color', (v_item ->> 'sort_order')::int
      )
      on conflict (id) do update
        set label = excluded.label, color = excluded.color, sort_order = excluded.sort_order
        where public.tag_values.category_id = excluded.category_id;
    when 'value.delete' then
      delete from public.tag_values
      where id = (p_op ->> 'value_id')::uuid
        and app_private.category_board(category_id) = p_board;
    when 'board.rename' then
      update public.boards set name = p_op ->> 'name' where id = p_board;
    else
      raise exception 'Opération inconnue' using errcode = '22023';
  end case;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on all functions in schema app_private from public;
grant execute on all functions in schema app_private to authenticated;

-- Chaque opération est isolée : une opération refusée n'annule pas les autres.
create function public.apply_board_ops(p_board uuid, p_ops jsonb) returns jsonb
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

revoke all on function public.apply_board_ops(uuid, jsonb) from public, anon;
grant execute on function public.apply_board_ops(uuid, jsonb) to authenticated;
