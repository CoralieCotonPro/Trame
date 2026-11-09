import { memo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import {
  layoutPostit,
  displayRect,
  POSTIT_BODY_SIZE,
  POSTIT_PADDING,
  POSTIT_PLACEHOLDER,
  POSTIT_TITLE_SIZE,
  TEXT_PLACEHOLDER,
} from '../../lib/layout';
import { FONT_FAMILY, INK, INK_MUTED, LINE_HEIGHT, postitFill, TEXT_LEVELS } from '../../lib/palette';
import type { BoardElement, PostitElement, TextElement } from '../../types/board';

interface Props<T extends BoardElement> {
  element: T;
  editing: boolean;
}

function PostitView({ element, editing }: Props<PostitElement>) {
  const { innerWidth, titleHeight, bodyY } = layoutPostit(element);
  const { title, body } = element.content;
  const { width, height } = displayRect(element);
  const isEmpty = !title && !body;

  return (
    <Group x={element.x} y={element.y}>
      <Rect
        width={width}
        height={height}
        cornerRadius={8}
        fill={postitFill(element.style.color)}
        stroke="rgba(43, 42, 39, 0.08)"
        strokeWidth={1}
        shadowColor="#2b2a27"
        shadowOpacity={0.14}
        shadowBlur={8}
        shadowOffsetY={2}
        shadowForStrokeEnabled={false}
        perfectDrawEnabled={false}
      />
      {!editing && title && (
        <Text
          x={POSTIT_PADDING}
          y={POSTIT_PADDING}
          width={innerWidth}
          height={titleHeight}
          text={title}
          fontFamily={FONT_FAMILY}
          fontSize={POSTIT_TITLE_SIZE}
          fontStyle="bold"
          lineHeight={LINE_HEIGHT}
          fill={INK}
          perfectDrawEnabled={false}
        />
      )}
      {!editing && (body || isEmpty) && (
        <Text
          x={POSTIT_PADDING}
          y={bodyY}
          width={innerWidth}
          text={body || POSTIT_PLACEHOLDER}
          fontFamily={FONT_FAMILY}
          fontSize={POSTIT_BODY_SIZE}
          lineHeight={LINE_HEIGHT}
          fill={body ? INK : INK_MUTED}
          perfectDrawEnabled={false}
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
