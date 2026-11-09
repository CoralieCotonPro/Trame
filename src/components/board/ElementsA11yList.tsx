import { useMemo } from 'react';
import { sortByZ } from '../../lib/geometry';
import { displayRect } from '../../lib/layout';
import { TEXT_LEVELS } from '../../lib/palette';
import { revealElement } from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement } from '../../types/board';

function describe(element: BoardElement): string {
  if (element.type === 'postit') {
    const { title, body } = element.content;
    return `Post-it : ${[title, body].filter(Boolean).join(' — ') || 'vide'}`;
  }
  return `${TEXT_LEVELS[element.style.level].label} : ${element.content.text || 'vide'}`;
}

/**
 * Le canvas est invisible pour le clavier et les lecteurs d'écran : cette liste
 * rend chaque élément atteignable. Elle n'apparaît pas à l'écran.
 */
export function ElementsA11yList() {
  const elements = useBoardStore((state) => state.elements);
  const sorted = useMemo(() => sortByZ(Object.values(elements)), [elements]);

  return (
    <ul className="sr-only" aria-label="Éléments du tableau">
      {sorted.map((element) => {
        const rect = displayRect(element);
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
              onFocus={() => {
                useUiStore.getState().select([element.id]);
                revealElement(element);
              }}
            >
              {describe(element)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
