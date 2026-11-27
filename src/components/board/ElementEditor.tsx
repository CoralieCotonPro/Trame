import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import {
  displayRect,
  LABEL_FONT_SIZE,
  layoutDiamond,
  layoutPostit,
  lineEnds,
  POSTIT_BODY_SIZE,
  POSTIT_PADDING,
} from '../../lib/layout';
import { pathMidpoint } from '../../lib/line';
import { FONT_FAMILY, INK, LINE_HEIGHT, postitFill, postitInk, TEXT_LEVELS } from '../../lib/palette';
import { requestLink } from '../../lib/linkRequest';
import { finishEditing } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import type {
  BoardElement,
  DiamondElement,
  ElementPatch,
  LineElement,
  PostitElement,
  TextElement,
} from '../../types/board';

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        requestLink(event.target instanceof HTMLTextAreaElement ? event.target : null);
        return;
      }
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
        color: postitInk(element.style.color),
      }}
    >
      <textarea
        ref={bodyRef}
        data-editor-for={element.id}
        data-field="body"
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
              style={{
                background: badge.color,
                color: badge.textColor,
                boxShadow: 'inset 0 0 0 1px rgba(22, 22, 22, 0.25)',
              }}
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
        data-editor-for={element.id}
        data-field="text"
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

function DiamondEditor({ element }: { element: DiamondElement }) {
  const [text, setText] = useState(element.content.text);
  const { innerWidth } = layoutDiamond(element);
  const ref = useAutoHeight(text, innerWidth);
  useFocusAtEnd(ref);
  const { onBlur, onKeyDown } = useFinish(element.id, () => ({ content: { text } }));
  const { width, height } = displayRect(element);

  return (
    <div
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="flex items-center justify-center"
      style={{ width, minHeight: height, position: 'relative' }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: postitFill(element.style.color),
          clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
        }}
      />
      <textarea
        ref={ref}
        data-editor-for={element.id}
        data-field="text"
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        placeholder="Votre question"
        aria-label="Texte du losange"
        className={`${fieldClass} relative`}
        style={{
          width: innerWidth,
          fontFamily: FONT_FAMILY,
          fontSize: POSTIT_BODY_SIZE,
          lineHeight: LINE_HEIGHT,
          textAlign: 'center',
          color: postitInk(element.style.color),
        }}
      />
    </div>
  );
}

/** Texte d'une flèche : centré sur son milieu. */
function LabelEditor({ element }: { element: LineElement }) {
  const [text, setText] = useState(element.content.text ?? '');
  const ref = useAutoHeight(text, 180);
  useFocusAtEnd(ref);
  const { onBlur, onKeyDown } = useFinish(element.id, () => ({ content: { text: text.trim() } }));

  return (
    <div
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="-translate-x-1/2 -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 shadow-panel"
      style={{ width: 192 }}
    >
      <textarea
        ref={ref}
        data-editor-for={element.id}
        data-field="text"
        rows={1}
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="Texte de la flèche"
        aria-label="Texte de la flèche"
        className={fieldClass}
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: LABEL_FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          textAlign: 'center',
          color: INK,
        }}
      />
    </div>
  );
}

function renderEditor(element: BoardElement) {
  if (element.type === 'line') return <LabelEditor key={element.id} element={element} />;
  if (element.type === 'diamond') return <DiamondEditor key={element.id} element={element} />;
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
  const origin =
    element.type === 'line'
      ? (() => {
          return pathMidpoint(lineEnds(element).path);
        })()
      : element;

  return (
    <div
      className="absolute top-0 left-0 z-10 origin-top-left"
      style={{
        transform: `translate(${origin.x * camera.zoom + camera.x}px, ${origin.y * camera.zoom + camera.y}px) scale(${camera.zoom})`,
      }}
    >
      {renderEditor(element)}
    </div>
  );
}
