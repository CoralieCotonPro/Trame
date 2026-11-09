import { boundsOf } from '../lib/geometry';
import { displayRect } from '../lib/layout';
import { buildBoardFile, withFreshIds, type BoardFile } from '../lib/boardFile';
import { getBoardStage } from '../lib/boardStage';
import { visibleElements } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useSyncStore } from '../stores/syncStore';
import { useTagStore } from '../stores/tagStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardElement } from '../types/board';

const PNG_PADDING = 40;
const PNG_SCALE = 2;
const PNG_MAX_SIDE = 8000;
const PNG_BACKGROUND = '#f6f6f6';

function safeFileName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'tableau';
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson() {
  const { name, elements } = useBoardStore.getState();
  const { categories, values } = useTagStore.getState();
  const file = buildBoardFile(name, Object.values(elements), categories, values);
  download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${safeFileName(name)}.json`);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Exporte ce qui est affiché : un filtre actif s'applique aussi à l'image. */
export async function exportPng() {
  const notify = useSyncStore.getState().set;
  const ui = useUiStore.getState();
  const bounds = boundsOf(visibleElements().map(displayRect));
  const stage = getBoardStage();
  if (!bounds || !stage) {
    notify({ notice: 'Le tableau est vide : il n’y a rien à exporter.' });
    return;
  }

  // Dessine aussi les éléments hors écran, sans les marques de sélection.
  ui.set({ exporting: true });
  try {
    await nextFrame();
    await nextFrame();

    const area = {
      x: bounds.x - PNG_PADDING,
      y: bounds.y - PNG_PADDING,
      width: bounds.width + PNG_PADDING * 2,
      height: bounds.height + PNG_PADDING * 2,
    };
    const scale = Math.min(PNG_SCALE, PNG_MAX_SIDE / Math.max(area.width, area.height));
    const { camera } = useUiStore.getState();
    const layers = stage.toCanvas({
      x: area.x * camera.zoom + camera.x,
      y: area.y * camera.zoom + camera.y,
      width: area.width * camera.zoom,
      height: area.height * camera.zoom,
      pixelRatio: scale / camera.zoom,
    });

    const output = document.createElement('canvas');
    output.width = layers.width;
    output.height = layers.height;
    const context = output.getContext('2d');
    if (!context) throw new Error('Canvas indisponible');
    context.fillStyle = PNG_BACKGROUND;
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(layers, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Image non générée');
    download(blob, `${safeFileName(useBoardStore.getState().name)}.png`);
  } catch {
    notify({ notice: 'L’export de l’image a échoué.' });
  } finally {
    useUiStore.getState().set({ exporting: false });
  }
}

/**
 * Remplace le contenu du tableau. Les suppressions sont émises avant les créations,
 * car un nom de catégorie doit rester unique et le nombre d'éléments limité.
 */
export function replaceBoardContent(source: BoardFile) {
  const file = withFreshIds(source);
  const now = new Date().toISOString();

  useTagStore.setState({ categories: [], values: [] });
  useBoardStore.setState({ elements: {} });

  useTagStore.setState({ categories: file.categories, values: file.values });
  useBoardStore.setState({
    name: file.board.name,
    elements: Object.fromEntries(
      file.elements.map((element) => [
        element.id,
        { ...element, createdAt: now, updatedAt: now, authorId: null } as BoardElement,
      ]),
    ),
    // Annuler après un import mélangerait deux contenus sans rapport.
    past: [],
    future: [],
  });
  useUiStore.getState().set({ selectedIds: new Set(), editingId: null, filters: {} });
}
