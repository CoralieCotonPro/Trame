import type { Op, OpResult, BoardSnapshot } from '../lib/ops';
import { categoryOp, valueOp } from '../lib/ops';
import { supabase } from '../lib/supabase';
import { createDefaultCatalog } from '../stores/tagStore';
import type { BoardElement } from '../types/board';

export interface BoardSummary {
  id: string;
  name: string;
  updated_at: string;
  owner_id: string;
}

export type BoardRole = 'owner' | 'editor' | 'viewer';

export interface ElementRow {
  id: string;
  type: BoardElement['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  content: Record<string, string>;
  style: Record<string, string>;
  revision: number;
  content_revision: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export class NetworkOrServerError extends Error {
  constructor(
    message: string,
    /** Vrai si réessayer peut suffire (réseau, serveur indisponible, session expirée). */
    readonly transient: boolean,
  ) {
    super(message);
  }
}

function isTransient(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

export async function listBoards(): Promise<BoardSummary[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('id, name, updated_at, owner_id')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteBoard(boardId: string) {
  const { error } = await supabase.from('boards').delete().eq('id', boardId);
  if (error) throw new Error(error.message);
}

/** `null` si la personne n'a pas (ou plus) accès à ce tableau. */
export async function loadRole(boardId: string, userId: string): Promise<BoardRole | null> {
  const { data, error, status } = await supabase
    .from('board_permissions')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new NetworkOrServerError(error.message, isTransient(status));
  return (data?.role as BoardRole | undefined) ?? null;
}

/** Clé du canal temps réel, renouvelée à chaque changement de droits. */
export async function loadRealtimeKey(boardId: string): Promise<string | null> {
  const { data, error, status } = await supabase
    .from('boards')
    .select('realtime_key')
    .eq('id', boardId)
    .maybeSingle();
  if (error) throw new NetworkOrServerError(error.message, isTransient(status));
  return (data?.realtime_key as string | undefined) ?? null;
}

export function elementFromRow(row: ElementRow, tags: Record<string, string>): BoardElement {
  return {
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.z_index,
    content: row.content,
    style: row.style,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorId: row.created_by,
    ...(row.type === 'postit' ? { tags } : {}),
  } as BoardElement;
}

export async function applyOps(
  boardId: string,
  ops: Op[],
  clientId?: string,
): Promise<OpResult[]> {
  const { data, error, status } = await supabase.rpc('apply_board_ops', {
    p_board: boardId,
    p_ops: ops,
    p_client: clientId ?? null,
  });
  if (error) throw new NetworkOrServerError(error.message, isTransient(status));
  return (data as { results: OpResult[] }).results;
}

export async function createBoard(name: string): Promise<string> {
  const { data: session } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('boards')
    .insert({ name, owner_id: session.user?.id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const catalog = createDefaultCatalog();
  await applyOps(data.id, [...catalog.categories.map(categoryOp), ...catalog.values.map(valueOp)]);
  return data.id;
}

export interface LoadedBoard {
  snapshot: BoardSnapshot;
  contentRevisions: Map<string, number>;
  revisions: Map<string, number>;
}

/** Renvoie `null` si le tableau n'existe pas ou n'est pas accessible. */
export async function loadBoard(boardId: string): Promise<LoadedBoard | null> {
  const [board, elements, categories, tags] = await Promise.all([
    supabase.from('boards').select('name').eq('id', boardId).maybeSingle(),
    supabase.from('elements').select('*').eq('board_id', boardId),
    supabase.from('tag_categories').select('*').eq('board_id', boardId),
    supabase.from('element_tags').select('*').eq('board_id', boardId),
  ]);
  const failure = board.error ?? elements.error ?? categories.error ?? tags.error;
  if (failure) {
    throw new NetworkOrServerError(failure.message, isTransient(board.status));
  }
  if (!board.data) return null;

  const categoryIds = (categories.data ?? []).map((category) => category.id as string);
  const values = await supabase.from('tag_values').select('*').in('category_id', categoryIds);
  if (values.error) throw new NetworkOrServerError(values.error.message, isTransient(values.status));

  const tagsByElement = new Map<string, Record<string, string>>();
  for (const row of tags.data ?? []) {
    const entry = tagsByElement.get(row.element_id as string) ?? {};
    entry[row.category_id as string] = row.tag_value_id as string;
    tagsByElement.set(row.element_id as string, entry);
  }

  const contentRevisions = new Map<string, number>();
  const revisions = new Map<string, number>();
  const mapped: Record<string, BoardElement> = {};
  for (const row of (elements.data ?? []) as ElementRow[]) {
    contentRevisions.set(row.id, row.content_revision);
    revisions.set(row.id, row.revision);
    mapped[row.id] = elementFromRow(row, tagsByElement.get(row.id) ?? {});
  }

  return {
    contentRevisions,
    revisions,
    snapshot: {
      name: board.data.name,
      elements: mapped,
      categories: (categories.data ?? []).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        sortOrder: row.sort_order as number,
      })),
      values: (values.data ?? []).map((row) => ({
        id: row.id as string,
        categoryId: row.category_id as string,
        label: row.label as string,
        color: row.color as string,
        sortOrder: row.sort_order as number,
      })),
    },
  };
}
