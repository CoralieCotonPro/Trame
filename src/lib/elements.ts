import type { BoardElement, LineElement, Point, PostitElement, TextElement } from '../types/board';
import { INK, POSTIT_SIZES } from './palette';

const DEFAULT_POSTIT = POSTIT_SIZES[1];
export const TEXT_DEFAULT_WIDTH = 320;

function base(position: Point, zIndex: number) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    x: position.x,
    y: position.y,
    zIndex,
    createdAt: now,
    updatedAt: now,
    authorId: null,
  };
}

export function createPostit(
  position: Point,
  zIndex: number,
  tags: Record<string, string> = {},
): PostitElement {
  return {
    tags,
    ...base(position, zIndex),
    type: 'postit',
    width: DEFAULT_POSTIT.width,
    height: DEFAULT_POSTIT.height,
    content: { body: '' },
    style: { color: 'yellow' },
  };
}

export function createText(position: Point, zIndex: number): TextElement {
  return {
    ...base(position, zIndex),
    type: 'text',
    width: TEXT_DEFAULT_WIDTH,
    height: 24,
    content: { text: '' },
    style: { level: 'body', color: INK, align: 'left' },
  };
}

export function createLine(
  rect: { x: number; y: number; width: number; height: number },
  start: LineElement['style']['start'],
  zIndex: number,
): LineElement {
  return {
    ...base(rect, zIndex),
    type: 'line',
    width: rect.width,
    height: rect.height,
    content: {},
    style: { color: INK, thickness: 'thin', arrow: 'none', start },
  };
}

/** Copie indépendante, avec un nouvel identifiant et de nouvelles dates. */
export function cloneElement(element: BoardElement, offset: Point, zIndex: number): BoardElement {
  const now = new Date().toISOString();
  return {
    ...structuredClone(element),
    id: crypto.randomUUID(),
    x: element.x + offset.x,
    y: element.y + offset.y,
    zIndex,
    createdAt: now,
    updatedAt: now,
  };
}
