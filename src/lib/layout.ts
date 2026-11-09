import Konva from 'konva';
import type { BoardElement, PostitElement, Rect, TextElement } from '../types/board';
import { FONT_FAMILY, LINE_HEIGHT, TEXT_LEVELS } from './palette';

export const POSTIT_PADDING = 16;
export const POSTIT_TITLE_GAP = 6;
export const POSTIT_TITLE_SIZE = 16;
export const POSTIT_BODY_SIZE = 15;
export const POSTIT_PLACEHOLDER = 'Double-cliquez pour écrire';
export const TEXT_PLACEHOLDER = 'Texte vide';

export const MIN_POSTIT = { width: 120, height: 80 };
export const MIN_TEXT_WIDTH = 60;

let measurer: Konva.Text | null = null;

/** Hauteur réelle du texte, calculée par Konva pour coller exactement à l'affichage. */
function measureHeight(text: string, width: number, fontSize: number, fontStyle: string): number {
  measurer ??= new Konva.Text({ fontFamily: FONT_FAMILY, lineHeight: LINE_HEIGHT, wrap: 'word' });
  measurer.setAttrs({ text: text || ' ', width, fontSize, fontStyle });
  return measurer.height();
}

export interface PostitLayout {
  innerWidth: number;
  titleHeight: number;
  bodyY: number;
  contentHeight: number;
}

const postitLayouts = new WeakMap<PostitElement, PostitLayout>();

export function layoutPostit(element: PostitElement): PostitLayout {
  const cached = postitLayouts.get(element);
  if (cached) return cached;

  const innerWidth = Math.max(1, element.width - POSTIT_PADDING * 2);
  const { title, body } = element.content;
  const titleHeight = title ? measureHeight(title, innerWidth, POSTIT_TITLE_SIZE, 'bold') : 0;
  const bodyY = POSTIT_PADDING + (title ? titleHeight + POSTIT_TITLE_GAP : 0);
  const bodyText = body || (title ? '' : POSTIT_PLACEHOLDER);
  const bodyHeight = measureHeight(bodyText, innerWidth, POSTIT_BODY_SIZE, 'normal');
  const layout = {
    innerWidth,
    titleHeight,
    bodyY,
    contentHeight: bodyY + bodyHeight + POSTIT_PADDING,
  };
  postitLayouts.set(element, layout);
  return layout;
}

const textHeights = new WeakMap<TextElement, number>();

export function textHeight(element: TextElement): number {
  const cached = textHeights.get(element);
  if (cached !== undefined) return cached;
  const level = TEXT_LEVELS[element.style.level];
  const height = measureHeight(
    element.content.text || TEXT_PLACEHOLDER,
    element.width,
    level.fontSize,
    level.fontStyle,
  );
  textHeights.set(element, height);
  return height;
}

/** Hauteur minimale pour que le contenu ne soit jamais coupé. */
export function contentHeight(element: BoardElement): number {
  return element.type === 'postit' ? layoutPostit(element).contentHeight : textHeight(element);
}

/** Rectangle réellement occupé sur le tableau. */
export function displayRect(element: BoardElement): Rect {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height:
      element.type === 'postit' ? Math.max(element.height, contentHeight(element)) : textHeight(element),
  };
}
