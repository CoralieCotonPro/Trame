import { useEffect, useMemo, useRef } from 'react';
import { Group, Layer, Rect as KonvaRect, Stage } from 'react-konva';
import { useBoardPointer } from '../../hooks/useBoardPointer';
import { useElementSize } from '../../hooks/useElementSize';
import { visibleBoardRect } from '../../lib/camera';
import { handlePosition, handlesFor, rectsIntersect, sortByZ } from '../../lib/geometry';
import { displayRect } from '../../lib/layout';
import { useBoardStore } from '../../stores/boardStore';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement, Camera } from '../../types/board';
import { ElementView } from '../elements/ElementView';

const ACCENT = '#b4532a';
const GRID_SPACING = 24;
const CULLING_MARGIN = 200;

function gridStyle(camera: Camera): React.CSSProperties {
  let spacing = GRID_SPACING * camera.zoom;
  while (spacing < 12) spacing *= 5;
  return {
    backgroundImage: 'radial-gradient(circle, #d6d2c8 1px, transparent 1.2px)',
    backgroundSize: `${spacing}px ${spacing}px`,
    backgroundPosition: `${camera.x - spacing / 2}px ${camera.y - spacing / 2}px`,
  };
}

function SelectionOverlay({ elements }: { elements: Record<string, BoardElement> }) {
  const zoom = useUiStore((state) => state.camera.zoom);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const editingId = useUiStore((state) => state.editingId);
  const dragDelta = useUiStore((state) => state.dragDelta);
  const resizePreview = useUiStore((state) => state.resizePreview);
  const marquee = useUiStore((state) => state.marquee);

  const selected = [...selectedIds].flatMap((id) => elements[id] ?? []);
  const single = selected.length === 1 && !editingId && !dragDelta ? selected[0] : undefined;
  const handleSize = 10 / zoom;

  return (
    <Layer listening={false}>
      <Group x={dragDelta?.x ?? 0} y={dragDelta?.y ?? 0}>
        {selected.map((element) => {
          const rect =
            resizePreview?.id === element.id ? resizePreview.rect : displayRect(element);
          return (
            <KonvaRect
              key={element.id}
              {...rect}
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              cornerRadius={element.type === 'postit' ? 8 : 2}
            />
          );
        })}
      </Group>
      {single &&
        handlesFor(single.type).map((handle) => {
          const rect = resizePreview?.id === single.id ? resizePreview.rect : displayRect(single);
          const position = handlePosition(rect, handle);
          return (
            <KonvaRect
              key={handle}
              x={position.x - handleSize / 2}
              y={position.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              cornerRadius={2 / zoom}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
            />
          );
        })}
      {marquee && (
        <KonvaRect
          {...marquee}
          fill="rgba(180, 83, 42, 0.08)"
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

  const sorted = useMemo(() => sortByZ(Object.values(elements)), [elements]);

  const view = visibleBoardRect(camera, viewport);
  const margin = CULLING_MARGIN / camera.zoom;
  const culling = {
    x: view.x - margin,
    y: view.y - margin,
    width: view.width + margin * 2,
    height: view.height + margin * 2,
  };
  const visible = sorted.filter((element) => rectsIntersect(culling, displayRect(element)));

  // Les éléments en mouvement ont leur propre calque : le reste n'est pas redessiné.
  const isMoving = (element: BoardElement) =>
    (isDragging && selectedIds.has(element.id)) || resizePreview?.id === element.id;
  const stationary = visible.filter((element) => !isMoving(element));
  const moving = sorted.filter(isMoving);

  const previewed = (element: BoardElement): BoardElement =>
    resizePreview?.id === element.id ? { ...element, ...resizePreview.rect } : element;

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        interactionRef.current = node;
      }}
      className="absolute inset-0 touch-none outline-none"
      style={{
        ...(gridVisible ? gridStyle(camera) : undefined),
        cursor: tool === 'hand' || spaceHeld ? 'grab' : undefined,
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
          </Layer>
          <SelectionOverlay elements={elements} />
        </Stage>
      )}
    </div>
  );
}
