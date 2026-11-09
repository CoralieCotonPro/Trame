import type { BoardElement, TagCategory, TagValue } from '../types/board';
import { POSTIT_COLORS, TEXT_LEVELS } from './palette';
import { isHexColor, TAG_LABEL_MAX } from './tags';

/** Format d'échange d'un tableau, décrit dans docs/FORMAT.md. */
export const FILE_FORMAT = 'trame-tableau';
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MAX_ELEMENTS = 2000;
const MAX_TEXT = 5000;
const MAX_COORDINATE = 10_000_000;

export interface BoardFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  exportedAt: string;
  board: { name: string };
  categories: TagCategory[];
  values: TagValue[];
  elements: FileElement[];
}

type WithoutMeta<T> = T extends unknown ? Omit<T, 'createdAt' | 'updatedAt' | 'authorId'> : never;
export type FileElement = WithoutMeta<BoardElement>;

export function buildBoardFile(
  name: string,
  elements: BoardElement[],
  categories: TagCategory[],
  values: TagValue[],
): BoardFile {
  const known = new Set(values.map((value) => value.id));
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    board: { name },
    categories,
    values,
    elements: elements.map((element): FileElement => {
      const { id, x, y, width, height, zIndex } = element;
      const base = { id, x, y, width, height, zIndex };
      if (element.type === 'text') {
        return { ...base, type: 'text', content: element.content, style: element.style };
      }
      const tags = Object.fromEntries(Object.entries(element.tags).filter(([, v]) => known.has(v)));
      return { ...base, type: 'postit', content: element.content, style: element.style, tags };
    }),
  };
}

class InvalidFile extends Error {}

function fail(message: string): never {
  throw new InvalidFile(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(`${what} est invalide.`);
}

function asArray(value: unknown, what: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${what} est invalide.`);
  if (value.length > max) fail(`${what} dépasse la limite de ${max}.`);
  return value;
}

function asText(value: unknown, what: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`${what} est invalide.`);
  }
  return value;
}

function asNumber(value: unknown, what: string, min = -MAX_COORDINATE, max = MAX_COORDINATE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${what} est invalide.`);
  }
  return value;
}

function parseCatalog(root: Record<string, unknown>) {
  const names = new Set<string>();
  const categories = asArray(root.categories, 'La liste des catégories', 50).map((raw): TagCategory => {
    const item = asRecord(raw, 'Une catégorie');
    const name = asText(item.name, 'Le nom d’une catégorie', 1, TAG_LABEL_MAX);
    if (names.has(name.toLowerCase())) fail(`La catégorie « ${name} » est en double.`);
    names.add(name.toLowerCase());
    return {
      id: asText(item.id, 'L’identifiant d’une catégorie', 1, 64),
      name,
      sortOrder: asNumber(item.sortOrder, 'L’ordre d’une catégorie', -1e6, 1e6),
    };
  });

  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length) fail('Deux catégories ont le même identifiant.');

  const labels = new Set<string>();
  const values = asArray(root.values, 'La liste des valeurs de tags', 500).map((raw): TagValue => {
    const item = asRecord(raw, 'Une valeur de tag');
    const categoryId = asText(item.categoryId, 'La catégorie d’une valeur', 1, 64);
    if (!categoryIds.has(categoryId)) fail('Une valeur de tag vise une catégorie inconnue.');
    const label = asText(item.label, 'Le libellé d’une valeur', 1, TAG_LABEL_MAX);
    const key = `${categoryId}:${label.toLowerCase()}`;
    if (labels.has(key)) fail(`La valeur « ${label} » est en double.`);
    labels.add(key);
    const color = asText(item.color, 'La couleur d’une valeur', 7, 7);
    if (!isHexColor(color)) fail(`La couleur « ${color} » est invalide.`);
    return {
      id: asText(item.id, 'L’identifiant d’une valeur', 1, 64),
      categoryId,
      label,
      color,
      sortOrder: asNumber(item.sortOrder, 'L’ordre d’une valeur', -1e6, 1e6),
    };
  });
  if (new Set(values.map((value) => value.id)).size !== values.length) {
    fail('Deux valeurs de tags ont le même identifiant.');
  }
  return { categories, values };
}

const POSTIT_IDS = new Set<string>(POSTIT_COLORS.map((color) => color.id));
const ALIGNS = new Set<string>(['left', 'center', 'right']);

function parseElement(raw: unknown, values: TagValue[]): FileElement {
  const item = asRecord(raw, 'Un élément');
  const base = {
    id: asText(item.id, 'L’identifiant d’un élément', 1, 64),
    x: asNumber(item.x, 'La position d’un élément'),
    y: asNumber(item.y, 'La position d’un élément'),
    width: asNumber(item.width, 'La largeur d’un élément', 1, 10_000),
    height: asNumber(item.height, 'La hauteur d’un élément', 0, 100_000),
    zIndex: asNumber(item.zIndex, 'L’ordre d’un élément', -1e12, 1e12),
  };
  const content = asRecord(item.content, 'Le contenu d’un élément');
  const style = asRecord(item.style, 'Le style d’un élément');

  if (item.type === 'postit') {
    const color = asText(style.color, 'La couleur d’un post-it', 1, 20);
    if (!POSTIT_IDS.has(color)) fail(`La couleur de post-it « ${color} » est inconnue.`);
    const tags = Object.entries(asRecord(item.tags ?? {}, 'Les tags d’un post-it')).map(
      ([categoryId, valueId]): [string, string] => {
        if (!values.some((v) => v.id === valueId && v.categoryId === categoryId)) {
          fail('Un post-it utilise un tag inconnu.');
        }
        return [categoryId, valueId as string];
      },
    );
    return {
      ...base,
      type: 'postit',
      content: { body: asText(content.body, 'Le texte d’un post-it', 0, MAX_TEXT) },
      style: { color },
      tags: Object.fromEntries(tags),
    };
  }

  if (item.type === 'text') {
    const level = asText(style.level, 'Le niveau d’un texte', 1, 10);
    if (!(level in TEXT_LEVELS)) fail(`Le niveau « ${level} » est inconnu.`);
    const align = asText(style.align, 'L’alignement d’un texte', 1, 10);
    if (!ALIGNS.has(align)) fail(`L’alignement « ${align} » est inconnu.`);
    const color = asText(style.color, 'La couleur d’un texte', 7, 7);
    if (!isHexColor(color)) fail(`La couleur « ${color} » est invalide.`);
    return {
      ...base,
      type: 'text',
      content: { text: asText(content.text, 'Un texte', 0, MAX_TEXT) },
      style: { level, align, color },
    } as FileElement;
  }

  return fail('Un élément est d’un type inconnu.');
}

export type ParseResult = { ok: true; file: BoardFile } | { ok: false; error: string };

/** Le fichier vient de l'extérieur : rien n'est accepté sans vérification. */
export function parseBoardFile(text: string): ParseResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail('Ce fichier n’est pas un fichier JSON valide.');
    }
    const root = asRecord(parsed, 'Le fichier');
    if (root.format !== FILE_FORMAT) fail('Ce fichier n’est pas un export de tableau Trame.');
    if (typeof root.version !== 'number' || root.version > FILE_VERSION) {
      fail(`La version ${String(root.version)} de ce fichier n’est pas prise en charge.`);
    }
    if (root.version !== FILE_VERSION) fail(`La version ${root.version} de ce fichier est inconnue.`);

    const board = asRecord(root.board, 'Le tableau');
    const { categories, values } = parseCatalog(root);
    const elements = asArray(root.elements, 'La liste des éléments', MAX_ELEMENTS).map((raw) =>
      parseElement(raw, values),
    );
    if (new Set(elements.map((element) => element.id)).size !== elements.length) {
      fail('Deux éléments ont le même identifiant.');
    }

    return {
      ok: true,
      file: {
        format: FILE_FORMAT,
        version: FILE_VERSION,
        exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : '',
        board: { name: asText(board.name, 'Le nom du tableau', 0, 120) },
        categories,
        values,
        elements,
      },
    };
  } catch (error) {
    if (error instanceof InvalidFile) return { ok: false, error: error.message };
    throw error;
  }
}

/** Les identifiants sont uniques sur toute la base : un import en crée de nouveaux. */
export function withFreshIds(file: BoardFile): BoardFile {
  const fresh = new Map<string, string>();
  const idFor = (id: string) => {
    const existing = fresh.get(id);
    if (existing) return existing;
    const created = crypto.randomUUID();
    fresh.set(id, created);
    return created;
  };
  return {
    ...file,
    categories: file.categories.map((category) => ({ ...category, id: idFor(category.id) })),
    values: file.values.map((value) => ({
      ...value,
      id: idFor(value.id),
      categoryId: idFor(value.categoryId),
    })),
    elements: file.elements.map((element) =>
      element.type === 'postit'
        ? {
            ...element,
            id: idFor(element.id),
            tags: Object.fromEntries(
              Object.entries(element.tags).map(([category, value]) => [idFor(category), idFor(value)]),
            ),
          }
        : { ...element, id: idFor(element.id) },
    ),
  };
}
