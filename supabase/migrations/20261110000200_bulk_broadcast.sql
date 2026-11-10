-- Grosses modifications groupées (import, déplacement de toute une sélection) : un seul
-- message « rechargez » au lieu d'un message par ligne. Supabase refuse les envois au-delà
-- de son débit maximal, et les autres participants manqueraient alors des modifications.

create or replace function app_private.broadcast_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_board uuid;
  v_key uuid;
begin
  if current_setting('app.bulk', true) = 'on' then
    return null;
  end if;

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

create or replace function app_private.broadcast_bulk(p_board uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_key uuid;
begin
  select realtime_key into v_key from public.boards where id = p_board;
  if v_key is not null then
    perform realtime.send(
      jsonb_build_object('c', current_setting('app.client_id', true), 't', 'bulk'),
      'db',
      'board:' || p_board::text || ':' || v_key::text,
      true
    );
  end if;
end;
$$;

revoke all on function app_private.broadcast_bulk(uuid) from public;
grant execute on function app_private.broadcast_bulk(uuid) to authenticated;

create or replace function public.apply_board_ops(p_board uuid, p_ops jsonb, p_client text default null)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_op jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_bulk boolean;
begin
  if not app_private.can_edit(p_board) then
    raise exception 'Écriture non autorisée sur ce tableau' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'Lot invalide ou trop grand' using errcode = '22023';
  end if;

  v_bulk := jsonb_array_length(p_ops) >= 20;
  perform set_config('app.client_id', coalesce(left(p_client, 64), ''), true);
  perform set_config('app.bulk', case when v_bulk then 'on' else '' end, true);

  for v_op in select value from jsonb_array_elements(p_ops) loop
    begin
      v_result := app_private.apply_op(p_board, v_op);
    exception when others then
      v_result := jsonb_build_object('status', 'rejected', 'code', sqlstate);
    end;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  if v_bulk then
    perform set_config('app.bulk', '', true);
    perform app_private.broadcast_bulk(p_board);
  end if;

  return jsonb_build_object('results', v_results);
end;
$$;
