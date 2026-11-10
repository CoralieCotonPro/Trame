import { useEffect, useMemo, useRef } from 'react';
import { Group, Layer, Line as KonvaLine, Rect as KonvaRect, Stage } from 'react-konva';
import { useBoardPointer } from '../../hooks/useBoardPointer';
import { useElementSize } from '../../hooks/useElementSize';
import { visibleBoardRect } from '../../lib/camera';
import { elementHandles, rectsIntersect, sortByZ } from '../../lib/geometry';
import { lineEndpoints } from '../../lib/line';
import { INK } from '../../lib/palette';
import { displayRect } from '../../lib/layout';
import { registerBoardStage } from '../../lib/boardStage';
import { isShown } from '../../lib/tags';
import { useBoardStore } from '../../stores/boardStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useTagStore } from '../../stores/tagStore';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement, Camera, LineCorner, Rect } from '../../types/board';
import { ElementView, LINE_WIDTHS } from '../elements/ElementView';

const ACCENT = '#000091';
const GRID_SPACING = 24;
const CULLING_MARGIN = 200;

function gridStyle(camera: Camera): React.CSSProperties {
  let spacing = GRID_SPACING * camera.zoom;
  while (spacing < 12) spacing *= 5;
  return {
    backgroundImage: 'radial-gradient(circle, #dddddd 1px, transparent 1.2px)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${camera.x - spacing / 2}px ${camera.y - spacing / 2}px`,
  };
}

/** Élément tel qu'affiché pendant un redimensionnement ou le déplacement d'une extrémité. */
function withPreview(
  element: BoardElement,
  preview: { id: string; rect: Rect; start?: LineCorner } | null,
): BoardElement {
  if (preview?.id !== element.id) return element;
  const moved = { ...element, ...preview.rect };
  return element.type === 'line' && preview.start
    ? ({ ...moved, style: { ...element.style, start: preview.start } } as BoardElement)
    : (moved as BoardElement);
}

function SelectionOverlay({ elements }: { elements: Record<string, BoardElement> }) {
  const zoom = useUiStore((state) => state.camera.zoom);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const editingId = useUiStore((state) => state.editingId);
  const dragDelta = useUiStore((state) => state.dragDelta);
  const resizePreview = useUiStore((state) => state.resizePreview);
  const marquee = useUiStore((state) => state.marquee);
  const lineDraft = useUiStore((state) => state.lineDraft);

  const selected = [...selectedIds].flatMap((id) => elements[id] ?? []);
  const single = selected.length === 1 && !editingId && !dragDelta ? selected[0] : undefined;
  const handleSize = 10 / zoom;

  return (
    <Layer listening={false}>
      <Group x={dragDelta?.x ?? 0} y={dragDelta?.y ?? 0}>
        {selected.map((raw) => {
          const element = withPreview(raw, resizePreview);
          if (element.type === 'line') {
            const { start, end } = lineEndpoints(element, element.style.start);
            return (
              <KonvaLine
                key={element.id}
                points={[start.x, start.y, end.x, end.y]}
                stroke="rgba(0, 0, 145, 0.3)"
                strokeWidth={LINE_WIDTHS[element.style.thickness] + 8 / zoom}
                lineCap="round"
              />
            );
          }
          return (
            <KonvaRect
              key={element.id}
              {...displayRect(element)}
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              cornerRadius={element.type === 'postit' ? 4 : 2}
            />
          );
        })}
      </Group>
      {single &&
        (() => {
          const element = withPreview(single, resizePreview);
          return elementHandles(element, displayRect(element)).map(({ handle, point }) => (
            <KonvaRect
              key={handle}
              x={point.x - handleSize / 2}
              y={point.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              cornerRadius={element.type === 'line' ? handleSize / 2 : 2 / zoom}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
            />
          ));
        })()}
      {lineDraft && (
        <KonvaLine
          points={[lineDraft.from.x, lineDraft.from.y, lineDraft.to.x, lineDraft.to.y]}
          stroke={INK}
          strokeWidth={LINE_WIDTHS.thin}
          lineCap="round"
        />
      )}
      {marquee && (
        <KonvaRect
          {...marquee}
          fill="rgba(0, 0, 145, 0.08)"
          stroke={ACCENT}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
      )}
    </Layer>
  );
}

export function BoardCanvas() {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const elements = useBoardStore((state) => state.elements);
  const camera = useUiStore((state) => state.camera);
  const viewport = useUiStore((state) => state.viewport);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const editingId = useUiStore((state) => state.editingId);
  const gridVisible = useUiStore((state) => state.gridVisible);
  const isDragging = useUiStore((state) => state.dragDelta !== null);
  const dragDelta = useUiStore((state) => state.dragDelta);
  const resizePreview = useUiStore((state) => state.resizePreview);
  const tool = useUiStore((state) => state.tool);
  const spaceHeld = useUiStore((state) => state.spaceHeld);
  const interactionRef = useRef<HTMLDivElement | null>(null);

  useBoardPointer(interactionRef);

  useEffect(() => {
    useUiStore.getState().set({ viewport: size });
  }, [size]);

  const filters = useUiStore((state) => state.filters);
  const remoteDrags = usePresenceStore((state) => state.drags);
  const exporting = useUiStore((state) => state.exporting);
  // Un changement de catalogue peut modifier la hauteur des post-it.
  useTagStore((state) => state.values);
  useTagStore((state) => state.categories);

  const sorted = useMemo(
    () =>
      sortByZ(Object.values(elements).filter((element) => isShown(element, filters, selectedIds))),
    [elements, filters, selectedIds],
  );

  const view = visibleBoardRect(camera, viewport);
  const margin = CULLING_MARGIN / camera.zoom;
  const culling = {
    x: view.x - margin,
    y: view.y - margin,
    width: view.width + margin * 2,
    height: view.height + margin * 2,
  };
  const visible = exporting
    ? sorted
    : sorted.filter((element) => rectsIntersect(culling, displayRect(element)));

  // Les éléments en mouvement ont leur propre calque : le reste n'est pas redessiné.
  const isMoving = (element: BoardElement) =>
    (isDragging && selectedIds.has(element.id)) || resizePreview?.id === element.id;
  const movedByOthers = new Set(Object.values(remoteDrags).flatMap((drag) => drag.ids));
  const stationary = visible.filter(
    (element) => !isMoving(element) && !movedByOthers.has(element.id),
  );
  const moving = sorted.filter(isMoving);

  const previewed = (element: BoardElement): BoardElement => withPreview(element, resizePreview);

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        interactionRef.current = node;
      }}
      className="absolute inset-0 touch-none outline-none"
      style={{
        ...(gridVisible ? gridStyle(camera) : undefined),
        cursor: tool === 'hand' || spaceHeld ? 'grab' : tool === 'line' ? 'crosshair' : undefined,
      }}
      tabIndex={0}
      role="application"
      aria-label="Tableau blanc"
      data-testid="board-canvas"
      data-zoom={camera.zoom}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
    >
      {size.width > 0 && size.height > 0 && (
        <Stage
          ref={registerBoardStage}
          width={size.width}
          height={size.height}
          x={camera.x}
          y={camera.y}
          scaleX={camera.zoom}
          scaleY={camera.zoom}
          listening={false}
        >
          <Layer listening={false}>
            {stationary.map((element) => (
              <ElementView
                key={element.id}
                element={element}
                editing={element.id === editingId}
              />
            ))}
          </Layer>
          <Layer listening={false}>
            <Group x={dragDelta?.x ?? 0} y={dragDelta?.y ?? 0}>
              {moving.map((element) => (
                <ElementView key={element.id} element={previewed(element)} editing={false} />
              ))}
            </Group>
            {Object.entries(remoteDrags).map(([id, drag]) => (
              <Group key={id} x={drag.offset.x} y={drag.offset.y}>
                {sorted
                  .filter((element) => drag.ids.includes(element.id) && !isMoving(element))
                  .map((element) => (
                    <ElementView key={element.id} element={element} editing={false} />
                  ))}
              </Group>
            ))}
          </Layer>
          {!exporting && <SelectionOverlay elements={elements} />}
        </Stage>
      )}
    </div>
  );
}
