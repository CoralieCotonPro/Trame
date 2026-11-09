import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { POSTIT_COLORS } from '../../lib/palette';
import {
  bringToFront,
  copySelection,
  deleteSelection,
  duplicateSelection,
  openTagPicker,
  patchSelection,
  sendToBack,
  startEditing,
} from '../../stores/actions';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import { ColorSwatch } from '../board/PropertiesPanel';

const MENU_WIDTH = 220;
const MENU_HEIGHT = 360;

function Item({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-paper focus:bg-paper ${
        danger ? 'text-[#b3261e]' : ''
      }`}
    >
      {label}
    </button>
  );
}

function ContextMenuContent({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const setUi = useUiStore((state) => state.set);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const elements = useBoardStore((state) => state.elements);
  const selected = [...selectedIds].flatMap((id) => elements[id] ?? []);
  const [only] = selected;
  const allPostits = selected.every((element) => element.type === 'postit');

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setUi({ contextMenu: null });
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [setUi]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      setUi({ contextMenu: null });
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Actions sur la sélection"
      onKeyDown={onKeyDown}
      className="fixed z-40 rounded-panel border border-line bg-surface p-1.5 shadow-panel"
      style={{
        width: MENU_WIDTH,
        left: Math.min(x, window.innerWidth - MENU_WIDTH - 8),
        top: Math.min(y, window.innerHeight - MENU_HEIGHT - 8),
      }}
    >
      {selected.length === 1 && only && (
        <Item label="Modifier" onClick={() => startEditing(only.id)} />
      )}
      <Item label="Dupliquer" onClick={duplicateSelection} />
      <Item label="Copier" onClick={copySelection} />
      {allPostits && <Item label="Modifier les tags" onClick={() => openTagPicker(x, y)} />}
      {allPostits && <Item label="Changer la couleur" onClick={() => setShowColors(!showColors)} />}
      {allPostits && showColors && (
        <div className="grid grid-cols-4 gap-2 px-3 py-2">
          {POSTIT_COLORS.map((color) => (
            <ColorSwatch
              key={color.id}
              label={color.label}
              color={color.fill}
              selected={selected.every((element) => element.style.color === color.id)}
              onClick={() => patchSelection({ style: { color: color.id } })}
            />
          ))}
        </div>
      )}
      <div className="mx-2 my-1 h-px bg-line" />
      <Item label="Premier plan" onClick={bringToFront} />
      <Item label="Arrière-plan" onClick={sendToBack} />
      <div className="mx-2 my-1 h-px bg-line" />
      <Item label="Supprimer" danger onClick={deleteSelection} />
    </div>
  );
}

export function ContextMenu() {
  const menu = useUiStore((state) => state.contextMenu);
  return menu ? <ContextMenuContent key={`${menu.x}:${menu.y}`} x={menu.x} y={menu.y} /> : null;
}
