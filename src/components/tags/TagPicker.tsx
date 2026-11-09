import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { sortCategories, valuesOf } from '../../lib/tags';
import { selectedElements, setTagOnSelection } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import type { PostitElement } from '../../types/board';
import { TagChip } from './TagChip';

const WIDTH = 300;

function TagPickerContent({
  x,
  y,
  focusCategoryId,
}: {
  x: number;
  y: number;
  focusCategoryId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const categories = useTagStore((state) => state.categories);
  const values = useTagStore((state) => state.values);
  const setUi = useUiStore((state) => state.set);
  useBoardStore((state) => state.elements);
  const postits = selectedElements().filter(
    (element): element is PostitElement => element.type === 'postit',
  );
  const ordered = useMemo(() => sortCategories(categories), [categories]);

  useEffect(() => {
    const scope = focusCategoryId
      ? ref.current?.querySelector(`[data-category="${focusCategoryId}"]`)
      : ref.current;
    scope?.querySelector<HTMLElement>('button')?.focus({ preventScroll: false });

    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest('[data-tag-trigger]')) {
        setUi({ tagPicker: null });
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [focusCategoryId, setUi]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setUi({ tagPicker: null });
  };

  if (postits.length === 0) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Tags du post-it"
      data-shortcuts-off
      onKeyDown={onKeyDown}
      className="fixed z-40 max-h-[70vh] space-y-3 overflow-y-auto rounded-panel border border-line bg-surface p-3 shadow-panel"
      style={{
        width: WIDTH,
        left: Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - 380)),
      }}
    >
      {ordered.map((category) => (
        <section key={category.id} data-category={category.id}>
          <h3 className="mb-1.5 text-xs font-semibold text-ink-soft">{category.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            {valuesOf(values, category.id).map((value) => {
              const selected = postits.every((postit) => postit.tags[category.id] === value.id);
              return (
                <TagChip
                  key={value.id}
                  label={value.label}
                  color={value.color}
                  selected={selected}
                  ariaLabel={`${category.name} : ${value.label}`}
                  onClick={() => setTagOnSelection(category.id, selected ? null : value.id)}
                />
              );
            })}
          </div>
        </section>
      ))}
      <button
        type="button"
        onClick={() => setUi({ tagPicker: null, tagManagerOpen: true })}
        className="text-sm font-medium text-accent underline-offset-2 hover:underline"
      >
        Gérer les tags
      </button>
    </div>
  );
}

export function TagPicker() {
  const picker = useUiStore((state) => state.tagPicker);
  return picker ? (
    <TagPickerContent
      key={`${picker.x}:${picker.y}:${picker.focusCategoryId}`}
      x={picker.x}
      y={picker.y}
      focusCategoryId={picker.focusCategoryId}
    />
  ) : null;
}
