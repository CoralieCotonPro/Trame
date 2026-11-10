import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  ArrowRight,
  Copy,
  Link,
  Minus,
  SendToBack,
  Trash2,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { boardToScreen } from '../../lib/camera';
import { boundsOf } from '../../lib/geometry';
import { displayRect } from '../../lib/layout';
import { POSTIT_COLORS, POSTIT_SIZES, TEXT_COLORS, TEXT_LEVELS } from '../../lib/palette';
import {
  bringToFront,
  deleteSelection,
  duplicateSelection,
  openTagPicker,
  patchSelection,
  sendToBack,
} from '../../stores/actions';
import { requestLink } from '../../lib/linkRequest';
import { useBoardStore } from '../../stores/boardStore';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import type {
  BoardElement,
  LineElement,
  PostitElement,
  TextAlign,
  TextElement,
  TextLevel,
} from '../../types/board';
import { IconButton } from '../toolbar/IconButton';

const PANEL_GAP = 12;
const TOP_LIMIT = 72;
const SIDE_MARGIN = 80;

const Divider = () => <div className="mx-1 h-6 w-px bg-line" />;

export function ColorSwatch({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Couleur ${label}`}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={`h-7 w-7 rounded-full border ${
        selected ? 'border-ink ring-2 ring-ink/30' : 'border-ink/15'
      }`}
      style={{ background: color }}
    />
  );
}

function PostitControls({ elements }: { elements: PostitElement[] }) {
  const first = elements[0];
  return (
    <>
      <div className="flex items-center gap-1" role="group" aria-label="Couleur du post-it">
        {POSTIT_COLORS.map((color) => (
          <ColorSwatch
            key={color.id}
            label={color.label}
            color={color.fill}
            selected={elements.every((element) => element.style.color === color.id)}
            onClick={() => patchSelection({ style: { color: color.id } })}
          />
        ))}
      </div>
      <Divider />
      <button
        type="button"
        data-tag-trigger
        aria-label="Modifier les tags"
        onClick={(event) => {
          const { left, bottom } = event.currentTarget.getBoundingClientRect();
          const isOpen = useUiStore.getState().tagPicker !== null;
          if (isOpen) useUiStore.getState().set({ tagPicker: null });
          else openTagPicker(left, bottom + 8);
        }}
        className="h-8 rounded-md px-2 text-sm font-medium whitespace-nowrap hover:bg-paper"
      >
        + Tag
      </button>
      <Divider />
      <div className="flex items-center gap-0.5" role="group" aria-label="Taille du post-it">
        {POSTIT_SIZES.map((size) => (
          <button
            key={size.id}
            type="button"
            aria-label={`Taille : ${size.label}`}
            aria-pressed={first?.width === size.width && first.height === size.height}
            title={size.label}
            onClick={() => patchSelection({ width: size.width, height: size.height })}
            className="h-8 w-8 rounded-md text-sm hover:bg-paper aria-pressed:bg-accent aria-pressed:text-white"
          >
            {size.id}
          </button>
        ))}
      </div>
    </>
  );
}

const ALIGNMENTS: { value: TextAlign; label: string; icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Aligner à gauche', icon: AlignLeft },
  { value: 'center', label: 'Centrer', icon: AlignCenter },
  { value: 'right', label: 'Aligner à droite', icon: AlignRight },
];

function TextControls({ elements }: { elements: TextElement[] }) {
  const first = elements[0];
  return (
    <>
      <div className="flex items-center gap-0.5" role="group" aria-label="Niveau de texte">
        {(Object.keys(TEXT_LEVELS) as TextLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            aria-label={TEXT_LEVELS[level].label}
            aria-pressed={elements.every((element) => element.style.level === level)}
            title={TEXT_LEVELS[level].label}
            onClick={() => patchSelection({ style: { level } })}
            className="h-8 w-8 rounded-md text-sm font-semibold hover:bg-paper aria-pressed:bg-accent aria-pressed:text-white"
          >
            {TEXT_LEVELS[level].short}
          </button>
        ))}
      </div>
      <Divider />
      <div className="flex items-center gap-1" role="group" aria-label="Couleur du texte">
        {TEXT_COLORS.map((color) => (
          <ColorSwatch
            key={color.id}
            label={color.label}
            color={color.id}
            selected={elements.every((element) => element.style.color === color.id)}
            onClick={() => patchSelection({ style: { color: color.id } })}
          />
        ))}
      </div>
      <Divider />
      <div className="flex items-center" role="group" aria-label="Alignement">
        {ALIGNMENTS.map(({ value, label, icon }) => (
          <IconButton
            key={value}
            icon={icon}
            label={label}
            tooltipSide="bottom"
            active={first?.style.align === value}
            onClick={() => patchSelection({ style: { align: value } })}
          />
        ))}
      </div>
    </>
  );
}

function isPostit(element: BoardElement): element is PostitElement {
  return element.type === 'postit';
}

function isText(element: BoardElement): element is TextElement {
  return element.type === 'text';
}

function isLine(element: BoardElement): element is LineElement {
  return element.type === 'line';
}

function LineControls({ elements }: { elements: LineElement[] }) {
  const first = elements[0];
  return (
    <>
      <div className="flex items-center gap-1" role="group" aria-label="Couleur du trait">
        {TEXT_COLORS.map((color) => (
          <ColorSwatch
            key={color.id}
            label={color.label}
            color={color.id}
            selected={elements.every((element) => element.style.color === color.id)}
            onClick={() => patchSelection({ style: { color: color.id } })}
          />
        ))}
      </div>
      <Divider />
      <div className="flex items-center gap-0.5" role="group" aria-label="Épaisseur du trait">
        {(['thin', 'thick'] as const).map((thickness) => (
          <button
            key={thickness}
            type="button"
            aria-pressed={first?.style.thickness === thickness}
            onClick={() => patchSelection({ style: { thickness } })}
            className="h-8 rounded-md px-2 text-sm hover:bg-paper aria-pressed:bg-accent aria-pressed:text-white"
          >
            {thickness === 'thin' ? 'Fin' : 'Épais'}
          </button>
        ))}
      </div>
      <Divider />
      <div className="flex items-center" role="group" aria-label="Extrémité du trait">
        <IconButton
          icon={Minus}
          label="Sans flèche"
          tooltipSide="bottom"
          active={first?.style.arrow === 'none'}
          onClick={() => patchSelection({ style: { arrow: 'none' } })}
        />
        <IconButton
          icon={ArrowRight}
          label="Avec flèche"
          tooltipSide="bottom"
          active={first?.style.arrow === 'end'}
          onClick={() => patchSelection({ style: { arrow: 'end' } })}
        />
      </div>
    </>
  );
}

/** Panneau flottant au-dessus de la sélection, ou dessous s'il manque de place. */
export function PropertiesPanel() {
  const allElements = useBoardStore((state) => state.elements);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const camera = useUiStore((state) => state.camera);
  const viewport = useUiStore((state) => state.viewport);
  const busy = useUiStore(
    (state) => state.dragDelta !== null || state.resizePreview !== null || state.marquee !== null,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });

  // Un badge peut changer la hauteur d'un post-it, donc la position du panneau.
  useTagStore((state) => state.values);
  useTagStore((state) => state.categories);

  const selected = [...selectedIds].flatMap((id) => allElements[id] ?? []);
  const bounds = boundsOf(selected.map(displayRect));
  const postits = selected.filter(isPostit);
  const texts = selected.filter(isText);
  const lines = selected.filter(isLine);
  const kind =
    postits.length === selected.length
      ? 'postit'
      : texts.length === selected.length
        ? 'text'
        : lines.length === selected.length
          ? 'line'
          : 'mixed';
  const editing = useUiStore((state) => state.editingId !== null);
  const readOnly = useUiStore((state) => state.role === 'viewer');
  const visible = bounds !== null && !busy && !readOnly;

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const { offsetWidth: width, offsetHeight: height } = panelRef.current;
    setPanelSize((size) => (size.width === width && size.height === height ? size : { width, height }));
  }, [kind, visible]);

  if (!bounds || !visible) return null;

  const topLeft = boardToScreen(camera, bounds);
  const bottomRight = boardToScreen(camera, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  });
  const above = topLeft.y - panelSize.height - PANEL_GAP;
  const below = bottomRight.y + PANEL_GAP;
  const maxTop = viewport.height - panelSize.height - 72;
  const top = Math.min(maxTop, above >= TOP_LIMIT ? above : below);
  const centered = (topLeft.x + bottomRight.x) / 2 - panelSize.width / 2;
  const maxLeft = viewport.width - panelSize.width - 16;
  const left = Math.max(SIDE_MARGIN, Math.min(maxLeft, centered));

  return (
    <div
      ref={panelRef}
      role="toolbar"
      aria-label="Propriétés de la sélection"
      // Garde le focus dans l'éditeur : on peut changer de couleur pendant la saisie.
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      className="absolute z-20 flex items-center gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-panel"
      style={{ top: Math.max(TOP_LIMIT, top), left }}
    >
      {kind === 'postit' && <PostitControls elements={postits} />}
      {kind === 'text' && <TextControls elements={texts} />}
      {kind === 'line' && <LineControls elements={lines} />}
      {kind !== 'mixed' && <Divider />}
      {editing && (
        <IconButton
          icon={Link}
          label="Lien sur les mots sélectionnés"
          shortcut="Ctrl/Cmd+K"
          tooltipSide="bottom"
          onClick={() => requestLink(document.querySelector('textarea[data-field]'))}
        />
      )}
      <IconButton icon={Copy} label="Dupliquer" shortcut="Ctrl/Cmd+D" tooltipSide="bottom" onClick={duplicateSelection} />
      <IconButton icon={BringToFront} label="Premier plan" tooltipSide="bottom" onClick={bringToFront} />
      <IconButton icon={SendToBack} label="Arrière-plan" tooltipSide="bottom" onClick={sendToBack} />
      <IconButton icon={Trash2} label="Supprimer" shortcut="Suppr" tooltipSide="bottom" onClick={deleteSelection} />
    </div>
  );
}
