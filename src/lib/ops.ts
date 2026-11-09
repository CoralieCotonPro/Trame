import type { BoardElement, TagCategory, TagValue } from '../types/board';

/**
 * Opérations envoyées au serveur. Le format correspond à `apply_board_ops`
 * (voir supabase/migrations) : noms en snake_case, identifiants générés côté client.
 */
export interface ElementPayload {
  id: string;
  type: BoardElement['type'];
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  content: Record<string, string>;
  style: Record<string, string>;
  tags: Record<string, string>;
}

export interface PatchFields {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  style?: Record<string, string>;
}

interface OpBase {
  id: string;
}

export interface CreateOp extends OpBase {
  kind: 'element.create';
  element: ElementPayload;
}

export interface PatchOp extends OpBase {
  kind: 'element.patch';
  element_id: string;
  fields?: PatchFields;
  content?: Record<string, string>;
  base_content_revision?: number;
  tags?: Record<string, string | null>;
}

export interface DeleteOp extends OpBase {
  kind: 'element.delete';
  element_id: string;
}

export interface CategoryUpsertOp extends OpBase {
  kind: 'category.upsert';
  category: { id: string; name: string; sort_order: number };
}

export interface CategoryDeleteOp extends OpBase {
  kind: 'category.delete';
  category_id: string;
}

export interface ValueUpsertOp extends OpBase {
  kind: 'value.upsert';
  value: { id: string; category_id: string; label: string; color: string; sort_order: number };
}

export interface ValueDeleteOp extends OpBase {
  kind: 'value.delete';
  value_id: string;
}

export interface RenameOp extends OpBase {
  kind: 'board.rename';
  name: string;
}

export type Op =
  | CreateOp
  | PatchOp
  | DeleteOp
  | CategoryUpsertOp
  | CategoryDeleteOp
  | ValueUpsertOp
  | ValueDeleteOp
  | RenameOp;

export interface OpResult {
  status: 'ok' | 'conflict' | 'missing' | 'rejected';
  revision?: number;
  content_revision?: number;
  server_content?: Record<string, string>;
  code?: string;
}

type Elements = Record<string, BoardElement>;

const newId = () => crypto.randomUUID();

function validTags(element: BoardElement, knownValues: ReadonlySet<string>): Record<string, string> {
  if (element.type !== 'postit') return {};
  return Object.fromEntries(Object.entries(element.tags).filter(([, id]) => knownValues.has(id)));
}

export function toPayload(element: BoardElement, knownValues: ReadonlySet<string>): ElementPayload {
  return {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    z_index: element.zIndex,
    content: element.content as Record<string, string>,
    style: element.style as Record<string, string>,
    tags: validTags(element, knownValues),
  };
}

function diffRecord(
  before: Record<string, string>,
  after: Record<string, string>,
): Record<string, string> | undefined {
  const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] !== v));
  return Object.keys(changed).length > 0 ? changed : undefined;
}

function patchOp(
  before: BoardElement,
  after: BoardElement,
  knownValues: ReadonlySet<string>,
): PatchOp | null {
  const fields: PatchFields = {};
  if (before.x !== after.x) fields.x = after.x;
  if (before.y !== after.y) fields.y = after.y;
  if (before.width !== after.width) fields.width = after.width;
  if (before.height !== after.height) fields.height = after.height;
  if (before.zIndex !== after.zIndex) fields.z_index = after.zIndex;
  const style = diffRecord(
    before.style as Record<string, string>,
    after.style as Record<string, string>,
  );
  if (style) fields.style = style;

  const content = diffRecord(
    before.content as Record<string, string>,
    after.content as Record<string, string>,
  );

  const tagsBefore = before.type === 'postit' ? before.tags : {};
  const tagsAfter = validTags(after, knownValues);
  const tags: Record<string, string | null> = { ...diffRecord(tagsBefore, tagsAfter) };
  for (const categoryId of Object.keys(tagsBefore)) {
    if (!(categoryId in tagsAfter)) tags[categoryId] = null;
  }

  const hasFields = Object.keys(fields).length > 0;
  const hasTags = Object.keys(tags).length > 0;
  if (!hasFields && !content && !hasTags) return null;

  return {
    id: newId(),
    kind: 'element.patch',
    element_id: after.id,
    ...(hasFields ? { fields } : {}),
    ...(content ? { content } : {}),
    ...(hasTags ? { tags } : {}),
  };
}

/** Ne produit que ce qui a changé : on n'envoie jamais le tableau entier. */
export function diffElements(
  previous: Elements,
  next: Elements,
  knownValues: ReadonlySet<string>,
): Op[] {
  const ops: Op[] = [];
  for (const [id, after] of Object.entries(next)) {
    const before = previous[id];
    if (before === after) continue;
    if (!before) {
      ops.push({ id: newId(), kind: 'element.create', element: toPayload(after, knownValues) });
    } else {
      const op = patchOp(before, after, knownValues);
      if (op) ops.push(op);
    }
  }
  for (const id of Object.keys(previous)) {
    if (!next[id]) ops.push({ id: newId(), kind: 'element.delete', element_id: id });
  }
  return ops;
}

function changed<T extends { id: string }>(previous: T[], next: T[]) {
  const before = new Map(previous.map((item) => [item.id, item]));
  const after = new Set(next.map((item) => item.id));
  return {
    upserted: next.filter((item) => before.get(item.id) !== item),
    deleted: previous.filter((item) => !after.has(item.id)),
  };
}

export function categoryOp(category: TagCategory): CategoryUpsertOp {
  return {
    id: newId(),
    kind: 'category.upsert',
    category: { id: category.id, name: category.name, sort_order: category.sortOrder },
  };
}

export function valueOp(value: TagValue): ValueUpsertOp {
  return {
    id: newId(),
    kind: 'value.upsert',
    value: {
      id: value.id,
      category_id: value.categoryId,
      label: value.label,
      color: value.color,
      sort_order: value.sortOrder,
    },
  };
}

/** Catégories avant valeurs à la création ; valeurs avant catégories à la suppression. */
export function diffCatalog(
  previous: { categories: TagCategory[]; values: TagValue[] },
  next: { categories: TagCategory[]; values: TagValue[] },
): Op[] {
  const categories = changed(previous.categories, next.categories);
  const values = changed(previous.values, next.values);
  return [
    ...categories.upserted.map(categoryOp),
    ...values.upserted.map(valueOp),
    ...values.deleted.map(
      (value): ValueDeleteOp => ({ id: newId(), kind: 'value.delete', value_id: value.id }),
    ),
    ...categories.deleted.map(
      (category): CategoryDeleteOp => ({
        id: newId(),
        kind: 'category.delete',
        category_id: category.id,
      }),
    ),
  ];
}

function isCatalogOp(op: Op): boolean {
  return op.kind.startsWith('category.') || op.kind.startsWith('value.');
}

function mergePatch(target: PatchOp, patch: PatchOp): PatchOp {
  const style = { ...target.fields?.style, ...patch.fields?.style };
  const fields = {
    ...target.fields,
    ...patch.fields,
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };
  const content = { ...target.content, ...patch.content };
  const tags = { ...target.tags, ...patch.tags };
  return {
    ...target,
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(Object.keys(content).length > 0 ? { content } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
  };
}

function mergeIntoCreate(target: CreateOp, patch: PatchOp): CreateOp {
  const tags = { ...target.element.tags };
  for (const [categoryId, valueId] of Object.entries(patch.tags ?? {})) {
    if (valueId) tags[categoryId] = valueId;
    else delete tags[categoryId];
  }
  return {
    ...target,
    element: {
      ...target.element,
      ...patch.fields,
      style: { ...target.element.style, ...patch.fields?.style },
      content: { ...target.element.content, ...patch.content },
      tags,
    },
  };
}

/**
 * Ajoute une opération à la file, en la fusionnant si possible avec une précédente.
 * `lockedCount` protège les opérations déjà en cours d'envoi. On ne remonte jamais
 * au-delà d'une opération de catalogue : un tag doit rester envoyé après sa valeur.
 */
export function enqueue(queue: Op[], op: Op, lockedCount: number): Op[] {
  if (op.kind === 'board.rename') {
    for (let i = queue.length - 1; i >= lockedCount; i -= 1) {
      if (queue[i]?.kind === 'board.rename') {
        return queue.map((item, index) => (index === i ? { ...op, id: item.id } : item));
      }
    }
    return [...queue, op];
  }
  if (op.kind !== 'element.patch') return [...queue, op];

  for (let i = queue.length - 1; i >= lockedCount; i -= 1) {
    const item = queue[i] as Op;
    if (isCatalogOp(item)) break;
    const matches =
      (item.kind === 'element.patch' && item.element_id === op.element_id) ||
      (item.kind === 'element.create' && item.element.id === op.element_id);
    if (matches) {
      const merged = item.kind === 'element.create'
        ? mergeIntoCreate(item, op)
        : mergePatch(item as PatchOp, op);
      return queue.map((entry, index) => (index === i ? merged : entry));
    }
    if (item.kind === 'element.delete' && item.element_id === op.element_id) break;
  }
  return [...queue, op];
}

export interface BoardSnapshot {
  name: string;
  elements: Elements;
  categories: TagCategory[];
  values: TagValue[];
}

function applyElementPatch(element: BoardElement, op: PatchOp): BoardElement {
  const { z_index: zIndex, style, ...geometry } = op.fields ?? {};
  const tags = element.type === 'postit' ? { ...element.tags } : undefined;
  for (const [categoryId, valueId] of Object.entries(op.tags ?? {})) {
    if (!tags) break;
    if (valueId) tags[categoryId] = valueId;
    else delete tags[categoryId];
  }
  return {
    ...element,
    ...geometry,
    ...(zIndex !== undefined ? { zIndex } : {}),
    style: { ...element.style, ...style },
    content: { ...element.content, ...op.content },
    ...(tags ? { tags } : {}),
  } as BoardElement;
}

function elementFromPayload(payload: ElementPayload): BoardElement {
  const now = new Date().toISOString();
  const { z_index: zIndex, tags, ...rest } = payload;
  return {
    ...rest,
    zIndex,
    createdAt: now,
    updatedAt: now,
    authorId: null,
    ...(payload.type === 'postit' ? { tags } : {}),
  } as BoardElement;
}

/** Rejoue les modifications non confirmées par-dessus l'état reçu du serveur. */
export function replayOps(snapshot: BoardSnapshot, ops: Op[]): BoardSnapshot {
  let { name } = snapshot;
  const elements = { ...snapshot.elements };
  let categories = [...snapshot.categories];
  let values = [...snapshot.values];

  for (const op of ops) {
    switch (op.kind) {
      case 'element.create':
        elements[op.element.id] = elementFromPayload(op.element);
        break;
      case 'element.patch': {
        const element = elements[op.element_id];
        if (element) elements[op.element_id] = applyElementPatch(element, op);
        break;
      }
      case 'element.delete':
        delete elements[op.element_id];
        break;
      case 'category.upsert': {
        const { id, name: categoryName, sort_order: sortOrder } = op.category;
        categories = [
          ...categories.filter((item) => item.id !== id),
          { id, name: categoryName, sortOrder },
        ];
        break;
      }
      case 'category.delete':
        categories = categories.filter((item) => item.id !== op.category_id);
        values = values.filter((item) => item.categoryId !== op.category_id);
        break;
      case 'value.upsert': {
        const { id, category_id: categoryId, label, color, sort_order: sortOrder } = op.value;
        values = [
          ...values.filter((item) => item.id !== id),
          { id, categoryId, label, color, sortOrder },
        ];
        break;
      }
      case 'value.delete':
        values = values.filter((item) => item.id !== op.value_id);
        break;
      case 'board.rename':
        name = op.name;
        break;
    }
  }
  return { name, elements, categories, values };
}
