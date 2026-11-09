import Konva from 'konva';
import { useTagStore } from '../stores/tagStore';
import type {
  BoardElement,
  Point,
  PostitElement,
  Rect,
  TagCategory,
  TagValue,
  TextElement,
} from '../types/board';
import { containsPoint } from './geometry';
import { FONT_FAMILY, LINE_HEIGHT, TEXT_LEVELS } from './palette';
import {
  flowBadges,
  readableTextColor,
  resolveTags,
  sortCategories,
  type FlowBox,
  type ResolvedTag,
} from './tags';

export const BADGE_HEIGHT = 20;
export const BADGE_RADIUS = 5;
export const BADGE_FONT_SIZE = 12;
export const BADGE_PADDING_X = 7;
export const BADGE_FONT = `600 ${BADGE_FONT_SIZE}px ${FONT_FAMILY}`;
const BADGE_GAP = 4;
const BADGES_TOP_GAP = 10;

export const POSTIT_PADDING = 16;
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

let badgeContext: CanvasRenderingContext2D | null = null;

function badgeTextWidth(text: string): number {
  badgeContext ??= Konva.Util.createCanvasElement().getContext('2d');
  if (!badgeContext) return text.length * BADGE_FONT_SIZE * 0.6;
  badgeContext.font = BADGE_FONT;
  return badgeContext.measureText(text).width;
}

/** Raccourcit visiblement un libellé trop long ; le libellé entier reste dans l'éditeur. */
function fitBadgeLabel(label: string, maxTextWidth: number): string {
  if (badgeTextWidth(label) <= maxTextWidth) return label;
  let end = label.length;
  while (end > 1 && badgeTextWidth(`${label.slice(0, end)}…`) > maxTextWidth) end -= 1;
  return `${label.slice(0, end)}…`;
}

export interface PlacedBadge extends ResolvedTag {
  text: string;
  textColor: string;
  x: number;
  y: number;
  width: number;
}

export interface PostitLayout {
  innerWidth: number;
  contentHeight: number;
  badges: PlacedBadge[];
  badgesHeight: number;
}

function layoutBadges(element: PostitElement, innerWidth: number) {
  const { categories, values } = useTagStore.getState();
  const tags = resolveTags(element.tags, sortCategories(categories), values);
  const maxTextWidth = Math.max(1, innerWidth - BADGE_PADDING_X * 2);
  const measured = tags.map((tag) => {
    const text = fitBadgeLabel(tag.label, maxTextWidth);
    return { tag, text, width: badgeTextWidth(text) + BADGE_PADDING_X * 2 };
  });
  const { positions, totalHeight } = flowBadges(
    measured.map((item) => item.width),
    innerWidth,
    { gap: BADGE_GAP, height: BADGE_HEIGHT },
  );
  const badges = measured.map(({ tag, text, width }, index) => ({
    ...tag,
    text,
    width,
    textColor: readableTextColor(tag.color),
    ...(positions[index] as FlowBox),
  }));
  return { badges, badgesHeight: totalHeight };
}

interface CachedLayout {
  layout: PostitLayout;
  categories: TagCategory[];
  values: TagValue[];
}

const postitLayouts = new WeakMap<PostitElement, CachedLayout>();

export function layoutPostit(element: PostitElement): PostitLayout {
  const { categories, values } = useTagStore.getState();
  const cached = postitLayouts.get(element);
  if (cached && cached.categories === categories && cached.values === values) return cached.layout;

  const innerWidth = Math.max(1, element.width - POSTIT_PADDING * 2);
  const bodyText = element.content.body || POSTIT_PLACEHOLDER;
  const bodyHeight = measureHeight(bodyText, innerWidth, POSTIT_BODY_SIZE, 'normal');
  const { badges, badgesHeight } = layoutBadges(element, innerWidth);
  const layout = {
    innerWidth,
    contentHeight:
      POSTIT_PADDING + bodyHeight + (badgesHeight > 0 ? BADGES_TOP_GAP + badgesHeight : 0) + POSTIT_PADDING,
    badges,
    badgesHeight,
  };
  postitLayouts.set(element, { layout, categories, values });
  return layout;
}

/** Ordonnée des badges dans le post-it : ils restent collés au bas. */
export function badgesTop(element: PostitElement): number {
  return displayRect(element).height - POSTIT_PADDING - layoutPostit(element).badgesHeight;
}

/** Badge situé sous un point du tableau. */
export function badgeAt(element: PostitElement, point: Point): PlacedBadge | null {
  const top = element.y + badgesTop(element);
  return (
    layoutPostit(element).badges.find((badge) =>
      containsPoint(
        {
          x: element.x + POSTIT_PADDING + badge.x,
          y: top + badge.y,
          width: badge.width,
          height: BADGE_HEIGHT,
        },
        point,
      ),
    ) ?? null
  );
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
