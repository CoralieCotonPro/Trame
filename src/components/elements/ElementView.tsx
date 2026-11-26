import type { Context } from 'konva/lib/Context';
import { memo } from 'react';
import { Arrow, Group, Line, Rect, Shape, Text } from 'react-konva';
import {
  badgesTop,
  diamondTextOrigin,
  DIAMOND_PLACEHOLDER,
  labelBox,
  LABEL_FONT_SIZE,
  LABEL_PADDING,
  layoutDiamond,
  elementLinks,
  layoutPostit,
  displayRect,
  lineEnds,
  BADGE_FONT,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BADGE_RADIUS,
  LINK_COLOR,
  type LinkSegment,
  type PlacedBadge,
  POSTIT_BODY_SIZE,
  POSTIT_PADDING,
  POSTIT_PLACEHOLDER,
  TEXT_PLACEHOLDER,
} from '../../lib/layout';
import { FONT_FAMILY, INK, INK_MUTED, LINE_HEIGHT, postitFill, postitInk, TEXT_LEVELS } from '../../lib/palette';
import { displayText } from '../../lib/richText';
import { useTagStore } from '../../stores/tagStore';
import type {
  BoardElement,
  DiamondElement,
  LineElement,
  Point,
  PostitElement,
  TextElement,
} from '../../types/board';

export interface LineEnds {
  start: Point;
  end: Point;
}

interface Props<T extends BoardElement> {
  element: T;
  editing: boolean;
  /** Extrémités réelles d'un trait, accroches et déplacements en cours compris. */
  ends?: LineEnds;
}

const canvasOf = (context: Context) =>
  (context as unknown as { _context: CanvasRenderingContext2D })._context;

/** Une seule forme par post-it : bien moins coûteux qu'un rectangle et un texte par badge. */
function drawBadges(context: Context, badges: PlacedBadge[]) {
  const canvas = canvasOf(context);
  canvas.font = BADGE_FONT;
  canvas.textBaseline = 'middle';
  for (const badge of badges) {
    canvas.fillStyle = badge.color;
    canvas.beginPath();
    canvas.roundRect(badge.x, badge.y, badge.width, BADGE_HEIGHT, BADGE_RADIUS);
    canvas.fill();
    // Fin contour : les teintes claires restent visibles sur un post-it clair.
    canvas.strokeStyle = 'rgba(22, 22, 22, 0.25)';
    canvas.lineWidth = 1;
    canvas.stroke();
    canvas.fillStyle = badge.textColor;
    canvas.fillText(badge.text, badge.x + BADGE_PADDING_X, badge.y + BADGE_HEIGHT / 2 + 0.5);
  }
}

/** Redessine les mots liés en bleu souligné, à la position exacte du texte de Konva. */
function drawLinks(context: Context, segments: LinkSegment[]) {
  const [first] = segments;
  if (!first) return;
  const canvas = canvasOf(context);
  canvas.font = first.font;
  canvas.textAlign = 'left';
  canvas.textBaseline = 'alphabetic';
  const metrics = canvas.measureText('M');
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
  const baseline = (ascent - descent) / 2 + first.height / 2;
  canvas.fillStyle = LINK_COLOR;
  canvas.strokeStyle = LINK_COLOR;
  canvas.lineWidth = 1;
  for (const segment of segments) {
    const y = segment.y + baseline;
    canvas.fillText(segment.text, segment.x, y);
    canvas.beginPath();
    canvas.moveTo(segment.x, y + 2);
    canvas.lineTo(segment.x + segment.width, y + 2);
    canvas.stroke();
  }
}

/** Positionné dans le groupe de l'élément : décalé de la marge intérieure pour un post-it. */
function Links({ element }: { element: BoardElement }) {
  const { segments } = elementLinks(element);
  if (segments.length === 0) return null;
  const offset =
    element.type === 'postit'
      ? { x: POSTIT_PADDING, y: POSTIT_PADDING }
      : element.type === 'diamond'
        ? (() => {
            const origin = diamondTextOrigin(element);
            return { x: origin.x - element.x, y: origin.y - element.y };
          })()
        : { x: 0, y: 0 };
  return (
    <Shape
      x={offset.x}
      y={offset.y}
      listening={false}
      sceneFunc={(context) => drawLinks(context, segments)}
    />
  );
}

function PostitView({ element, editing }: Props<PostitElement>) {
  // Reconstruit les badges quand un libellé ou une couleur change dans le catalogue.
  useTagStore((state) => state.values);
  useTagStore((state) => state.categories);
  const { innerWidth, badges } = layoutPostit(element);
  const body = displayText(element.content.body);
  const { width, height } = displayRect(element);

  return (
    <Group x={element.x} y={element.y}>
      <Rect
        width={width}
        height={height}
        cornerRadius={4}
        fill={postitFill(element.style.color)}
        stroke="rgba(22, 22, 22, 0.1)"
        strokeWidth={1}
        shadowColor="#161616"
        shadowOpacity={0.14}
        shadowBlur={8}
        shadowOffsetY={2}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
      />
      {!editing && (
        <Text
          x={POSTIT_PADDING}
          y={POSTIT_PADDING}
          width={innerWidth}
          text={body || POSTIT_PLACEHOLDER}
          fontFamily={FONT_FAMILY}
          fontSize={POSTIT_BODY_SIZE}
          lineHeight={LINE_HEIGHT}
          fill={postitInk(element.style.color)}
          opacity={body ? 1 : 0.75}
          perfectDrawEnabled={false}
        />
      )}
      {!editing && <Links element={element} />}
      {!editing && badges.length > 0 && (
        <Shape
          x={POSTIT_PADDING}
          y={badgesTop(element)}
          listening={false}
          sceneFunc={(context) => drawBadges(context, badges)}
        />
      )}
    </Group>
  );
}

function TextView({ element, editing }: Props<TextElement>) {
  if (editing) return null;
  const level = TEXT_LEVELS[element.style.level];
  const text = displayText(element.content.text);
  return (
    <Group x={element.x} y={element.y}>
      <Text
        width={element.width}
        text={text || TEXT_PLACEHOLDER}
        fontFamily={FONT_FAMILY}
        fontSize={level.fontSize}
        fontStyle={level.fontStyle}
        lineHeight={LINE_HEIGHT}
        align={element.style.align}
        fill={text ? element.style.color : INK_MUTED}
        perfectDrawEnabled={false}
      />
      <Links element={element} />
    </Group>
  );
}

export function diamondPoints(width: number, height: number): number[] {
  return [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2];
}

function DiamondView({ element, editing }: Props<DiamondElement>) {
  const { width, height } = displayRect(element);
  const { innerWidth } = layoutDiamond(element);
  const origin = diamondTextOrigin(element);
  const text = displayText(element.content.text);
  return (
    <Group x={element.x} y={element.y}>
      <Line
        points={diamondPoints(width, height)}
        closed
        fill={postitFill(element.style.color)}
        stroke="rgba(22, 22, 22, 0.25)"
        strokeWidth={1}
        lineJoin="round"
        shadowColor="#161616"
        shadowOpacity={0.14}
        shadowBlur={8}
        shadowOffsetY={2}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
      />
      {!editing && (
        <Text
          x={origin.x - element.x}
          y={origin.y - element.y}
          width={innerWidth}
          text={text || DIAMOND_PLACEHOLDER}
          align="center"
          fontFamily={FONT_FAMILY}
          fontSize={POSTIT_BODY_SIZE}
          lineHeight={LINE_HEIGHT}
          fill={postitInk(element.style.color)}
          opacity={text ? 1 : 0.6}
          perfectDrawEnabled={false}
        />
      )}
      {!editing && <Links element={element} />}
    </Group>
  );
}

export const LINE_WIDTHS = { thin: 2, thick: 5 } as const;

function LineView({ element, editing, ends }: Props<LineElement> & { ends: LineEnds }) {
  const { start, end } = ends;
  const width = LINE_WIDTHS[element.style.thickness];
  const arrow = element.style.arrow === 'end';
  const label = editing ? null : labelBox(element.content.text ?? '', ends);
  return (
    <>
      <Arrow
        points={[start.x, start.y, end.x, end.y]}
        stroke={element.style.color}
        fill={element.style.color}
        strokeWidth={width}
        pointerLength={arrow ? 10 + width * 2 : 0}
        pointerWidth={arrow ? 10 + width * 2 : 0}
        lineCap="round"
        lineJoin="round"
        perfectDrawEnabled={false}
      />
      {label && (
        <Group x={label.x} y={label.y}>
          <Rect
            width={label.width}
            height={label.height}
            cornerRadius={4}
            fill="#ffffff"
            stroke="rgba(22, 22, 22, 0.15)"
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Text
            x={LABEL_PADDING.x}
            y={LABEL_PADDING.y}
            width={label.textWidth}
            text={displayText(element.content.text ?? '')}
            align="center"
            fontFamily={FONT_FAMILY}
            fontSize={LABEL_FONT_SIZE}
            lineHeight={LINE_HEIGHT}
            fill={INK}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
    </>
  );
}

function sameEnds(a?: LineEnds, b?: LineEnds): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.start.x === b.start.x && a.start.y === b.start.y && a.end.x === b.end.x && a.end.y === b.end.y
  );
}

export const ElementView = memo(
  function ElementView({ element, editing, ends }: Props<BoardElement>) {
    if (element.type === 'line') {
      return <LineView element={element} editing={editing} ends={ends ?? lineEnds(element)} />;
    }
    if (element.type === 'diamond') return <DiamondView element={element} editing={editing} />;
    return element.type === 'postit' ? (
      <PostitView element={element} editing={editing} />
    ) : (
      <TextView element={element} editing={editing} />
    );
  },
  (previous, next) =>
    previous.element === next.element &&
    previous.editing === next.editing &&
    sameEnds(previous.ends, next.ends),
);
