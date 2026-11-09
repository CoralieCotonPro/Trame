import { useEffect } from 'react';
import {
  addPostit,
  addText,
  copySelection,
  deleteSelection,
  duplicateSelection,
  moveSelection,
  paste,
  redo,
  resetZoom,
  selectAll,
  startEditing,
  undo,
  zoomBy,
} from '../stores/actions';
import { useUiStore } from '../stores/uiStore';

const ui = () => useUiStore.getState();

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Dans une fenêtre de tags, Suppr ou Échap ne doivent pas agir sur le tableau. */
function isInsidePopup(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-shortcuts-off]') !== null;
}

function handleCommand(key: string, shift: boolean): boolean {
  const actions: Record<string, () => void> = {
    z: shift ? redo : undo,
    y: redo,
    c: copySelection,
    v: paste,
    d: duplicateSelection,
    a: selectAll,
    '=': () => zoomBy(1.2),
    '+': () => zoomBy(1.2),
    '-': () => zoomBy(1 / 1.2),
    '0': resetZoom,
  };
  const action = actions[key];
  action?.();
  return Boolean(action);
}

function handleSimpleKey(key: string, shift: boolean): boolean {
  const step = shift ? 50 : 10;
  const nudges: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
  };
  const nudge = nudges[key];
  if (nudge) {
    if (ui().selectedIds.size === 0) return false;
    moveSelection(nudge);
    return true;
  }

  switch (key.toLowerCase()) {
    case 'v':
      ui().set({ tool: 'select' });
      return true;
    case 'h':
      ui().set({ tool: 'hand' });
      return true;
    case 'n':
      addPostit();
      return true;
    case 't':
      addText();
      return true;
    case 'delete':
    case 'backspace':
      deleteSelection();
      return true;
    case 'escape':
      ui().select([]);
      ui().set({ contextMenu: null });
      return true;
    case 'enter': {
      const { selectedIds } = ui();
      const [id] = selectedIds;
      if (selectedIds.size !== 1 || !id) return false;
      startEditing(id);
      return true;
    }
    default:
      return false;
  }
}

/** Raccourcis globaux, inactifs pendant la saisie de texte. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || ui().editingId || isInsidePopup(event.target)) return;

      if (event.code === 'Space') {
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        if (!event.repeat) ui().set({ spaceHeld: true });
        return;
      }

      // Entrée sur un bouton doit activer ce bouton, pas éditer la sélection.
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;

      const handled =
        event.ctrlKey || event.metaKey
          ? handleCommand(event.key.toLowerCase(), event.shiftKey)
          : !event.altKey && handleSimpleKey(event.key, event.shiftKey);
      if (handled) event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') ui().set({ spaceHeld: false });
    };
    const onBlur = () => ui().set({ spaceHeld: false });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}
