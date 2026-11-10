-- Projets (Envergo, GUH) et accès d'équipe.
-- Toute personne qui a un compte, donc pas un invité anonyme, peut lire et modifier tous les tableaux.
-- Supprimer un tableau, le partager et gérer ses membres restent réservés à son propriétaire.
-- Seules les adresses @beta.gouv.fr peuvent se créer un compte : voir app_private.before_user_created.

-- ---------------------------------------------------------------------------
-- Projets
-- ---------------------------------------------------------------------------

create table public.projects (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  sort_order integer not null default 0
);

insert into public.projects (id, name, sort_order) values
  ('envergo', 'Envergo', 0),
  ('guh', 'GUH', 1);

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select on public.projects to authenticated;
create policy projects_select on public.projects for select to authenticated using (true);

-- Les tableaux existants vont dans Envergo. Ensuite, chaque création doit choisir son projet.
alter table public.boards
  add column project_id text not null default 'envergo' references public.projects (id);
alter table public.boards alter column project_id drop default;
create index boards_project_idx on public.boards (project_id);

-- ---------------------------------------------------------------------------
-- Droits : un compte est éditeur de tous les tableaux
-- ---------------------------------------------------------------------------

create or replace function app_private.is_member() returns boolean
language sql stable set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) = false;
$$;

-- Un rôle explicite « owner » ou « editor » est conservé ; un « viewer » est relevé en « editor »
-- pour un compte. Un invité anonyme n'a que les droits obtenus par lien.
create or replace function app_private.board_role(p_board uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when explicit.role = 'owner' then 'owner'
    when app_private.is_member()
      and (explicit.role is not null or exists (select 1 from public.boards where id = p_board))
      then 'editor'
    else explicit.role
  end
  from (
    select (
      select role from public.board_permissions
      where board_id = p_board and user_id = (select auth.uid())
    ) as role
  ) as explicit;
$$;

revoke all on function app_private.is_member() from public;
grant execute on function app_private.is_member() to authenticated;

-- Le navigateur lisait son rôle dans board_permissions, où le rôle d'équipe n'apparaît pas.
create function public.my_board_role(p_board uuid) returns text
language sql stable set search_path = ''
as $$ select app_private.board_role(p_board); $$;

revoke all on function public.my_board_role(uuid) from public, anon;
grant execute on function public.my_board_role(uuid) to authenticated;

-- Liste des tableaux accessibles, avec l'e-mail du créateur (jamais pour un invité anonyme).
create function public.list_boards()
returns table (
  id uuid,
  name text,
  updated_at timestamptz,
  owner_id uuid,
  project_id text,
  owner_email text
)
language sql stable security definer set search_path = ''
as $$
  select
    b.id,
    b.name,
    b.updated_at,
    b.owner_id,
    b.project_id,
    case when app_private.is_member() then u.email::text end
  from public.boards b
  left join auth.users u on u.id = b.owner_id
  where app_private.can_read(b.id)
  order by b.updated_at desc;
$$;

revoke all on function public.list_boards() from public, anon;
grant execute on function public.list_boards() to authenticated;

-- ---------------------------------------------------------------------------
-- Création de comptes
-- ---------------------------------------------------------------------------

-- Hook « Before User Created » : depuis le site, seuls peuvent se créer
--   - les invités anonymes ;
--   - les adresses @beta.gouv.fr, dont la possession est prouvée par le lien de confirmation
--     (« Confirm email » doit rester activé).
-- Un administrateur peut créer d'autres comptes (tableau de bord → Users → Create new user) :
-- cette voie ne déclenche pas ce hook.
create function app_private.before_user_created(event jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
begin
  if coalesce((event -> 'user' ->> 'is_anonymous')::boolean, false)
    or lower(coalesce(event -> 'user' ->> 'email', '')) ~ '^[^@\s]+@beta\.gouv\.fr$'
  then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Seules les adresses @beta.gouv.fr peuvent créer un compte.'
    )
  );
end;
$$;

grant usage on schema app_private to supabase_auth_admin;
revoke all on function app_private.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function app_private.before_user_created(jsonb) to supabase_auth_admin;
