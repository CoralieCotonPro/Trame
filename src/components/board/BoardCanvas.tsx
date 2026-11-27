import { useEffect, useMemo, useRef } from 'react';
import {
  Arrow as KonvaArrow,
  Circle as KonvaCircle,
  Group,
  Layer,
  Line as KonvaLine,
  Rect as KonvaRect,
  Stage,
} from 'react-konva';
import { connectHandles, connectSources, useBoardPointer } from '../../hooks/useBoardPointer';
import { useElementSize } from '../../hooks/useElementSize';
import { visibleBoardRect } from '../../lib/camera';
import { elementHandles, rectsIntersect, sortByZ } from '../../lib/geometry';
import { attachedIds, resolveLineEnds, sideAnchor, type RectLookup } from '../../lib/line';
import { INK } from '../../lib/palette';
import { displayRect } from '../../lib/layout';
import { registerBoardStage } from '../../lib/boardStage';
import { shownElements } from '../../lib/tags';
import { useBoardStore } from '../../stores/boardStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useTagStore } from '../../stores/tagStore';
import { GRID_SPACING } from '../../lib/snap';
import { useUiStore } from '../../stores/uiStore';
import type { BoardElement, Camera, LineElement, Point } from '../../types/board';
import { diamondPoints, ElementView, LINE_WIDTHS, type LineEnds } from '../elements/ElementView';

const ACCENT = '#000091';
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

type Preview = ReturnType<typeof useUiStore.getState>['resizePreview'];

/** Élément tel qu'affiché pendant un redimensionnement ou le déplacement d'une extrémité. */
function withPreview(element: BoardElement, preview: Preview): BoardElement {
  if (preview?.id !== element.id) return element;
  const moved = { ...element, ...preview.rect };
  return element.type === 'line' && preview.style
    ? ({ ...moved, style: { ...element.style, ...preview.style } } as BoardElement)
    : (moved as BoardElement);
}

interface Resolver {
  /** Décalage en cours d'un élément : glissé ici ou par un autre participant. */
  offsetOf: (id: string) => Point | null;
  /** Extrémités d'un trait telles qu'affichées à cet instant. */
  endsOf: (line: LineElement) => LineEnds;
}

function makeResolver(
  elements: Record<string, BoardElement>,
  selectedIds: ReadonlySet<string>,
  dragDelta: Point | null,
  resizePreview: Preview,
  remoteDrags: Record<string, { ids: string[]; offset: Point }>,
): Resolver {
  const offsetOf = (id: string): Point | null => {
    if (dragDelta && selectedIds.has(id)) return dragDelta;
    for (const drag of Object.values(remoteDrags)) {
      if (drag.ids.includes(id)) return drag.offset;
    }
    return null;
  };
  const rectOf: RectLookup = (id) => {
    const element = elements[id];
    if (!element || element.type === 'line') return null;
    const rect = displayRect(withPreview(element, resizePreview));
    const offset = offsetOf(id);
    return offset ? { ...rect, x: rect.x + offset.x, y: rect.y + offset.y } : rect;
  };
  return {
    offsetOf,
    endsOf: (line) =>
      resolveLineEnds(
        withPreview(line, resizePreview) as LineElement,
        rectOf,
        offsetOf(line.id) ?? undefined,
      ),
  };
}

const ACCENT_SOFT = 'rgba(0, 0, 145, 0.3)';

function SelectionOverlay({
  elements,
  resolver,
}: {
  elements: Record<string, BoardElement>;
  resolver: Resolver;
}) {
  const zoom = useUiStore((state) => state.camera.zoom);
  const selectedIds = useUiStore((state) => state.selectedIds);
  const editingId = useUiStore((state) => state.editingId);
  const dragDelta = useUiStore((state) => state.dragDelta);
  const resizePreview = useUiStore((state) => state.resizePreview);
  const marquee = useUiStore((state) => state.marquee);
  const lineDraft = useUiStore((state) => state.lineDraft);
  const connectTarget = useUiStore((state) => state.connectTarget);
  // Les poignées de flèche suivent le survol, l'outil et les droits.
  useUiStore((state) => state.hoverId);
  useUiStore((state) => state.tool);
  useUiStore((state) => state.role);

  const selected = [...selectedIds].flatMap((id) => elements[id] ?? []);
  const single = selected.length === 1 && !editingId && !dragDelta ? selected[0] : undefined;
  const handleSize = 10 / zoom;
  const idle = !editingId && !dragDelta && !resizePreview && !lineDraft && !marquee;
  const target = connectTarget ? elements[connectTarget.id] : undefined;

  return (
    <Layer listening={false}>
      {selected.map((raw) => {
        if (raw.type !== 'line') return null;
        const { path } = resolver.endsOf(raw);
        return (
          <KonvaLine
            key={raw.id}
            points={path.flatMap((point) => [point.x, point.y])}
            stroke={ACCENT_SOFT}
            strokeWidth={LINE_WIDTHS[raw.style.thickness] + 8 / zoom}
            lineCap="round"
            lineJoin="round"
          />
        );
      })}
      <Group x={dragDelta?.x ?? 0} y={dragDelta?.y ?? 0}>
        {selected.map((raw) => {
          const element = withPreview(raw, resizePreview);
          if (element.type === 'line') return null;
          const rect = displayRect(element);
          if (element.type === 'diamond') {
            return (
              <KonvaLine
                key={element.id}
                x={rect.x}
                y={rect.y}
                points={diamondPoints(rect.width, rect.height)}
                closed
                stroke={ACCENT}
                strokeWidth={1.5}
                strokeScaleEnabled={false}
              />
            );
          }
          return (
            <KonvaRect
              key={element.id}
              {...rect}
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              cornerRadius={element.type === 'postit' ? 4 : 2}
            />
          );
        })}
      </Group>
      {idle &&
        connectSources().flatMap((element) =>
          connectHandles(element, zoom).map(({ side, point }) => (
            <KonvaCircle
              key={`${element.id}:${side}`}
              x={point.x}
              y={point.y}
              radius={6 / zoom}
              fill="#ffffff"
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeScaleEnabled={false}
            />
          )),
        )}
      {target && connectTarget && (
        <>
          <KonvaRect
            {...displayRect(target)}
            stroke={ACCENT}
            strokeWidth={2}
            dash={[6, 4]}
            strokeScaleEnabled={false}
            cornerRadius={4}
          />
          <KonvaCircle
            {...sideAnchor(displayRect(target), connectTarget.side)}
            radius={5 / zoom}
            fill={ACCENT}
          />
        </>
      )}
      {single &&
        (() => {
          const element = withPreview(single, resizePreview);
          const ends = element.type === 'line' ? resolver.endsOf(single as LineElement) : undefined;
          return elementHandles(element, displayRect(element), ends).map(({ handle, point }) => (
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
        <KonvaArrow
          points={(lineDraft.path ?? [lineDraft.from, lineDraft.to]).flatMap((p) => [p.x, p.y])}
          stroke={INK}
          fill={INK}
          strokeWidth={LINE_WIDTHS.thin}
          pointerLength={lineDraft.arrow ? 14 : 0}
          pointerWidth={lineDraft.arrow ? 14 : 0}
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
    () => sortByZ(shownElements(Object.values(elements), filters, selectedIds)),
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
  const movesNow = (id: string) => {
    const element = elements[id];
    return movedByOthers.has(id) || (element !== undefined && isMoving(element));
  };
  // Un trait accroché suit en direct l'élément déplacé : il passe sur le calque mobile.
  const lineMoves = (line: LineElement) => movesNow(line.id) || attachedIds(line).some(movesNow);
  const resolver = makeResolver(elements, selectedIds, dragDelta, resizePreview, remoteDrags);
  const stationary = visible.filter((element) =>
    element.type === 'line' ? !lineMoves(element) : !isMoving(element) && !movedByOthers.has(element.id),
  );
  const moving = sorted.filter((element) => element.type !== 'line' && isMoving(element));
  const movingLines = sorted.filter(
    (element): element is LineElement => element.type === 'line' && lineMoves(element),
  );

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
                ends={element.type === 'line' ? resolver.endsOf(element) : undefined}
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
                  .filter(
                    (element) =>
                      element.type !== 'line' && drag.ids.includes(element.id) && !isMoving(element),
                  )
                  .map((element) => (
                    <ElementView key={element.id} element={element} editing={false} />
                  ))}
              </Group>
            ))}
            {movingLines.map((line) => (
              <ElementView
                key={line.id}
                element={previewed(line)}
                editing={false}
                ends={resolver.endsOf(line)}
              />
            ))}
          </Layer>
          {!exporting && <SelectionOverlay elements={elements} resolver={resolver} />}
        </Stage>
      )}
    </div>
  );
}
