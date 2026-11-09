import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { displayRect, layoutPostit, POSTIT_BODY_SIZE, POSTIT_PADDING } from '../../lib/layout';
import { FONT_FAMILY, INK, LINE_HEIGHT, postitFill, TEXT_LEVELS } from '../../lib/palette';
import { finishEditing } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement, ElementPatch, PostitElement, TextElement } from '../../types/board';

const MAX_LENGTH = 5000;

function useAutoHeight(value: string, width: number) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, width]);
  return ref;
}

function useFocusAtEnd(ref: React.RefObject<HTMLTextAreaElement | null>) {
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [ref]);
}

const fieldClass = 'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none';

/** Valide au clic ailleurs ; ne valide pas quand le focus reste dans l'éditeur. */
function useFinish(id: string, buildPatch: () => ElementPatch) {
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    finishEditing(id, buildPatch());
  };
  return {
    finish,
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) finish();
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        finish();
      }
    },
  };
}

function PostitEditor({ element }: { element: PostitElement }) {
  const [body, setBody] = useState(element.content.body);
  const bodyRef = useAutoHeight(body, element.width);
  useFocusAtEnd(bodyRef);
  const { onBlur, onKeyDown } = useFinish(element.id, () => ({ content: { body } }));
  const { badges } = layoutPostit(element);

  return (
    <div
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="flex flex-col rounded-lg"
      style={{
        width: element.width,
        minHeight: displayRect(element).height,
        padding: POSTIT_PADDING,
        background: postitFill(element.style.color),
        color: INK,
      }}
    >
      <textarea
        ref={bodyRef}
        rows={1}
        value={body}
        maxLength={MAX_LENGTH}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Votre texte"
        aria-label="Texte du post-it"
        className={fieldClass}
        style={{ fontFamily: FONT_FAMILY, fontSize: POSTIT_BODY_SIZE, lineHeight: LINE_HEIGHT }}
      />
      {badges.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-2.5">
          {badges.map((badge) => (
            <span
              key={badge.valueId}
              className="rounded-[5px] px-[7px] text-xs leading-5 font-semibold"
              style={{ background: badge.color, color: badge.textColor }}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TextEditor({ element }: { element: TextElement }) {
  const [text, setText] = useState(element.content.text);
  const ref = useAutoHeight(`${text}${element.style.level}`, element.width);
  useFocusAtEnd(ref);
  const { onBlur, onKeyDown } = useFinish(element.id, () => ({ content: { text } }));
  const level = TEXT_LEVELS[element.style.level];

  return (
    <div onBlur={onBlur} onKeyDown={onKeyDown} style={{ width: element.width }}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        placeholder="Votre texte"
        aria-label="Texte"
        className={fieldClass}
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: level.fontSize,
          fontWeight: level.fontStyle === 'normal' ? 400 : level.fontStyle === 'bold' ? 700 : 600,
          lineHeight: LINE_HEIGHT,
          color: element.style.color,
          textAlign: element.style.align,
        }}
      />
    </div>
  );
}

function renderEditor(element: BoardElement) {
  return element.type === 'postit' ? (
    <PostitEditor key={element.id} element={element} />
  ) : (
    <TextEditor key={element.id} element={element} />
  );
}

/** Champ HTML superposé exactement à l'élément, à l'échelle du zoom courant. */
export function ElementEditor() {
  const editingId = useUiStore((state) => state.editingId);
  const camera = useUiStore((state) => state.camera);
  const element = useBoardStore((state) => (editingId ? state.elements[editingId] : undefined));
  if (!element) return null;

  return (
    <div
      className="absolute top-0 left-0 z-10 origin-top-left"
      style={{
        transform: `translate(${element.x * camera.zoom + camera.x}px, ${element.y * camera.zoom + camera.y}px) scale(${camera.zoom})`,
      }}
    >
      {renderEditor(element)}
    </div>
  );
}
