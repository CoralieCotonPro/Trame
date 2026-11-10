import { useMemo } from 'react';
import { sortByZ } from '../../lib/geometry';
import { displayRect, elementLinks } from '../../lib/layout';
import { displayText, parseLinks } from '../../lib/richText';
import { TEXT_LEVELS } from '../../lib/palette';
import { isShown, resolveTags, sortCategories, type ResolvedTag } from '../../lib/tags';
import { revealElement } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement } from '../../types/board';

function describe(element: BoardElement, tags: ResolvedTag[]): string {
  if (element.type === 'line') {
    return element.style.arrow === 'end' ? 'Flèche' : 'Trait';
  }
  if (element.type === 'postit') {
    const text = displayText(element.content.body) || 'vide';
    const suffix = tags.map((tag) => `${tag.categoryName} : ${tag.label}`).join(', ');
    return `Post-it : ${text}${suffix ? ` (${suffix})` : ''}`;
  }
  return `${TEXT_LEVELS[element.style.level].label} : ${displayText(element.content.text) || 'vide'}`;
}

/** Position des liens sur le tableau, utile aux tests navigateur. */
function linkBoxes(element: BoardElement): string | undefined {
  const { origin, segments } = elementLinks(element);
  if (segments.length === 0) return undefined;
  return JSON.stringify(
    segments.map((s) => ({ x: origin.x + s.x, y: origin.y + s.y, w: s.width, h: s.height, href: s.href })),
  );
}

/**
 * Le canvas est invisible pour le clavier et les lecteurs d'écran : cette liste
 * rend chaque élément atteignable. Elle n'apparaît pas à l'écran.
 */
export function ElementsA11yList() {
  const elements = useBoardStore((state) => state.elements);
  const filters = useUiStore((state) => state.filters);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const categories = useTagStore((state) => state.categories);
  const values = useTagStore((state) => state.values);
  const orderedCategories = useMemo(() => sortCategories(categories), [categories]);
  const sorted = useMemo(
    () =>
      sortByZ(Object.values(elements).filter((element) => isShown(element, filters, selectedIds))),
    [elements, filters, selectedIds],
  );

  return (
    <ul className="sr-only" aria-label="Éléments du tableau">
      {sorted.map((element) => {
        const rect = displayRect(element);
        const tags =
          element.type === 'postit' ? resolveTags(element.tags, orderedCategories, values) : [];
        return (
          <li key={element.id}>
            <button
              type="button"
              data-element-id={element.id}
              data-type={element.type}
              data-x={rect.x}
              data-y={rect.y}
              data-width={rect.width}
              data-height={rect.height}
              data-z={element.zIndex}
              data-color={element.style.color}
              data-level={element.type === 'text' ? element.style.level : undefined}
              data-line={
                element.type === 'line'
                  ? `${element.style.thickness}|${element.style.arrow}|${element.style.start}`
                  : undefined
              }
              data-links={linkBoxes(element)}
              data-tags={tags.map((tag) => tag.label).join('|')}
              data-tag-colors={tags.map((tag) => tag.color).join('|')}
              onFocus={() => {
                useUiStore.getState().select([element.id]);
                revealElement(element);
              }}
            >
              {describe(element, tags)}
            </button>
            {element.type !== 'line' &&
              parseLinks(
                element.type === 'postit' ? element.content.body : element.content.text,
              ).links.map((link, index) => (
                <a key={index} href={link.href} target="_blank" rel="noopener noreferrer">
                  Lien : {link.href}
                </a>
              ))}
          </li>
        );
      })}
    </ul>
  );
}
