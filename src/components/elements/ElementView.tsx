import type { Context } from 'konva/lib/Context';
import { memo } from 'react';
import { Group, Rect, Shape, Text } from 'react-konva';
import {
  badgesTop,
  layoutPostit,
  displayRect,
  BADGE_FONT,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BADGE_RADIUS,
  type PlacedBadge,
  POSTIT_BODY_SIZE,
  POSTIT_PADDING,
  POSTIT_PLACEHOLDER,
  TEXT_PLACEHOLDER,
} from '../../lib/layout';
import { FONT_FAMILY, INK_MUTED, LINE_HEIGHT, postitFill, postitInk, TEXT_LEVELS } from '../../lib/palette';
import { useTagStore } from '../../stores/tagStore';
import type { BoardElement, PostitElement, TextElement } from '../../types/board';

interface Props<T extends BoardElement> {
  element: T;
  editing: boolean;
}

/** Une seule forme par post-it : bien moins coûteux qu'un rectangle et un texte par badge. */
function drawBadges(context: Context, badges: PlacedBadge[]) {
  const canvas = (context as unknown as { _context: CanvasRenderingContext2D })._context;
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

function PostitView({ element, editing }: Props<PostitElement>) {
  // Reconstruit les badges quand un libellé ou une couleur change dans le catalogue.
  useTagStore((state) => state.values);
  useTagStore((state) => state.categories);
  const { innerWidth, badges } = layoutPostit(element);
  const { body } = element.content;
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
  return (
    <Text
      x={element.x}
      y={element.y}
      width={element.width}
      text={element.content.text || TEXT_PLACEHOLDER}
      fontFamily={FONT_FAMILY}
      fontSize={level.fontSize}
      fontStyle={level.fontStyle}
      lineHeight={LINE_HEIGHT}
      align={element.style.align}
      fill={element.content.text ? element.style.color : INK_MUTED}
      perfectDrawEnabled={false}
    />
  );
}

export const ElementView = memo(function ElementView({ element, editing }: Props<BoardElement>) {
  return element.type === 'postit' ? (
    <PostitView element={element} editing={editing} />
  ) : (
    <TextView element={element} editing={editing} />
  );
});
