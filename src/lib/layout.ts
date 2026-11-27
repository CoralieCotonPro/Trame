import Konva from 'konva';
import { useBoardStore } from '../stores/boardStore';
import { useTagStore } from '../stores/tagStore';
import type {
  BoardElement,
  DiamondElement,
  LineElement,
  Point,
  PostitElement,
  Rect,
  TagCategory,
  TagValue,
  TextElement,
} from '../types/board';
import { containsPoint } from './geometry';
import {
  distanceToPath,
  lineFromPoints,
  pathMidpoint,
  resolveLineEnds,
  type LineEnds,
  type RectLookup,
} from './line';
import { FONT_FAMILY, LINE_HEIGHT, TEXT_LEVELS } from './palette';
import { displayText, parseLinks } from './richText';
import { GRID_SPACING } from './snap';
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

export const MIN_POSTIT = { width: 120, height: 72 };
export const MIN_DIAMOND = { width: 120, height: 72 };
export const DIAMOND_PLACEHOLDER = 'Question ?';
/** Part du losange occupée par le texte : le rectangle reste inscrit dans la forme. */
const DIAMOND_TEXT_WIDTH = 0.56;
const DIAMOND_TEXT_HEIGHT = 0.4;
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
  const bodyText = displayText(element.content.body) || POSTIT_PLACEHOLDER;
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
    displayText(element.content.text) || TEXT_PLACEHOLDER,
    element.width,
    level.fontSize,
    level.fontStyle,
  );
  textHeights.set(element, height);
  return height;
}

export interface DiamondLayout {
  innerWidth: number;
  textHeight: number;
  contentHeight: number;
}

const diamondLayouts = new WeakMap<DiamondElement, DiamondLayout>();

export function layoutDiamond(element: DiamondElement): DiamondLayout {
  const cached = diamondLayouts.get(element);
  if (cached) return cached;
  const innerWidth = Math.max(1, Math.floor(element.width * DIAMOND_TEXT_WIDTH));
  const text = displayText(element.content.text) || DIAMOND_PLACEHOLDER;
  const textHeight = measureHeight(text, innerWidth, POSTIT_BODY_SIZE, 'normal');
  const layout = { innerWidth, textHeight, contentHeight: textHeight / DIAMOND_TEXT_HEIGHT };
  diamondLayouts.set(element, layout);
  return layout;
}

/** Hauteur minimale pour que le contenu ne soit jamais coupé. */
export function contentHeight(element: BoardElement): number {
  if (element.type === 'postit') return layoutPostit(element).contentHeight;
  if (element.type === 'diamond') return layoutDiamond(element).contentHeight;
  return element.type === 'text' ? textHeight(element) : element.height;
}

/** Rectangle des éléments du tableau, d'après l'état enregistré. Un trait n'y sert pas d'accroche. */
export const storeLookup: RectLookup = (id) => {
  const element = useBoardStore.getState().elements[id];
  return element && element.type !== 'line' ? displayRect(element) : null;
};

/** Extrémités réelles d'un trait, accroches comprises. */
export function lineEnds(line: LineElement, lookup: RectLookup = storeLookup) {
  return resolveLineEnds(line, lookup);
}

/**
 * Rectangle réellement occupé sur le tableau. Un post-it dont le texte déborde s'allonge
 * d'un nombre entier de pas de grille, pour rester aligné sur elle. Un trait accroché
 * occupe le rectangle entre les éléments qu'il relie.
 */
export function displayRect(element: BoardElement): Rect {
  if (element.type === 'line') {
    const { path } = lineEnds(element);
    const xs = path.map((point) => point.x);
    const ys = path.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(...ys) - y };
  }
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height:
      element.type === 'postit' || element.type === 'diamond'
        ? Math.max(element.height, Math.ceil(contentHeight(element) / GRID_SPACING) * GRID_SPACING)
        : contentHeight(element),
  };
}

export const LABEL_FONT_SIZE = 14;
const LABEL_MAX_WIDTH = 220;
export const LABEL_PADDING = { x: 6, y: 3 };

let labelMeasurer: Konva.Text | null = null;

/** Cadre du texte d'un trait, centré sur son milieu. `null` si le trait n'a pas de texte. */
export function labelBox(
  text: string,
  ends: LineEnds,
): (Rect & { textWidth: number }) | null {
  const shown = displayText(text);
  if (!shown.trim()) return null;
  labelMeasurer ??= new Konva.Text({ fontFamily: FONT_FAMILY, fontSize: LABEL_FONT_SIZE });
  const widest = Math.max(...shown.split('\n').map((line) => labelMeasurer!.measureSize(line).width));
  const textWidth = Math.min(LABEL_MAX_WIDTH, Math.ceil(widest) + 2);
  const height = measureHeight(shown, textWidth, LABEL_FONT_SIZE, 'normal');
  const center = pathMidpoint(ends.path);
  const width = textWidth + LABEL_PADDING.x * 2;
  const boxHeight = height + LABEL_PADDING.y * 2;
  return { x: center.x - width / 2, y: center.y - boxHeight / 2, width, height: boxHeight, textWidth };
}

/** Trait dont le rectangle englobant est remis à jour d'après ses accroches. */
export function withLiveGeometry(line: LineElement): LineElement {
  const ends = lineEnds(line);
  const { start, ...rect } = lineFromPoints(ends.start, ends.end);
  return { ...line, ...rect, style: { ...line.style, start } };
}

/** Un trait se saisit près de sa ligne ou sur son texte. */
export function lineTouches(line: LineElement, point: Point, tolerance: number): boolean {
  const ends = lineEnds(line);
  if (distanceToPath(point, ends.path) <= Math.max(tolerance, 1)) return true;
  const box = labelBox(line.content.text ?? '', ends);
  return box !== null && containsPoint(box, point);
}

export const LINK_COLOR = '#000091';

/** Morceau de lien sur une ligne, en coordonnées relatives au début du texte. */
export interface LinkSegment {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  href: string;
  font: string;
}

let linker: Konva.Text | null = null;

/**
 * Position des mots liés une fois le texte coupé en lignes. On reprend le découpage
 * de Konva pour tomber exactement sur les mots dessinés.
 */
function linkSegments(
  raw: string,
  width: number,
  fontSize: number,
  fontStyle: string,
  align: string,
): LinkSegment[] {
  const { display, links } = parseLinks(raw);
  if (links.length === 0) return [];
  linker ??= new Konva.Text({ fontFamily: FONT_FAMILY, lineHeight: LINE_HEIGHT, wrap: 'word' });
  linker.setAttrs({ text: display, width, fontSize, fontStyle, align });
  const lines = (linker as unknown as { textArr: { text: string; width: number }[] }).textArr;
  const font = (linker as unknown as { _getContextFont: () => string })._getContextFont();
  const lineHeight = fontSize * LINE_HEIGHT;
  const measure = (text: string) => (linker as Konva.Text).measureSize(text).width;

  const segments: LinkSegment[] = [];
  let cursor = 0;
  lines.forEach((line, index) => {
    if (!line.text) return;
    const start = display.indexOf(line.text, cursor);
    if (start < 0) return;
    const end = start + line.text.length;
    cursor = end;
    const lineX =
      align === 'center' ? (width - line.width) / 2 : align === 'right' ? width - line.width : 0;
    for (const link of links) {
      const from = Math.max(link.start, start);
      const to = Math.min(link.end, end);
      if (from >= to) continue;
      const text = display.slice(from, to);
      segments.push({
        x: lineX + measure(display.slice(start, from)),
        y: index * lineHeight,
        width: measure(text),
        height: lineHeight,
        text,
        href: link.href,
        font,
      });
    }
  });
  return segments;
}

const linkCache = new WeakMap<BoardElement, LinkSegment[]>();

/** Liens d'un post-it ou d'un texte, et point d'origine de son texte. */
export function elementLinks(element: BoardElement): { origin: Point; segments: LinkSegment[] } {
  if (element.type === 'line') return { origin: element, segments: [] };
  let segments = linkCache.get(element);
  if (!segments) {
    if (element.type === 'diamond') {
      segments = linkSegments(
        element.content.text,
        layoutDiamond(element).innerWidth,
        POSTIT_BODY_SIZE,
        'normal',
        'center',
      );
    } else if (element.type === 'postit') {
      segments = linkSegments(
        element.content.body,
        layoutPostit(element).innerWidth,
        POSTIT_BODY_SIZE,
        'normal',
        'left',
      );
    } else {
      const level = TEXT_LEVELS[element.style.level];
      segments = linkSegments(
        element.content.text,
        element.width,
        level.fontSize,
        level.fontStyle,
        element.style.align,
      );
    }
    linkCache.set(element, segments);
  }
  const origin =
    element.type === 'postit'
      ? { x: element.x + POSTIT_PADDING, y: element.y + POSTIT_PADDING }
      : element.type === 'diamond'
        ? diamondTextOrigin(element)
        : { x: element.x, y: element.y };
  return { origin, segments };
}

/** Coin du texte d'un losange : centré dans la forme. */
export function diamondTextOrigin(element: DiamondElement): Point {
  const { innerWidth, textHeight: height } = layoutDiamond(element);
  return {
    x: element.x + (element.width - innerWidth) / 2,
    y: element.y + (displayRect(element).height - height) / 2,
  };
}

export function linkAt(element: BoardElement, point: Point): LinkSegment | null {
  const { origin, segments } = elementLinks(element);
  return (
    segments.find((segment) =>
      containsPoint(
        { x: origin.x + segment.x, y: origin.y + segment.y, width: segment.width, height: segment.height },
        point,
      ),
    ) ?? null
  );
}
