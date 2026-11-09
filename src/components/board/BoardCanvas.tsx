import { Layer, Stage } from 'react-konva';
import { useElementSize } from '../../hooks/useElementSize';

/** Surface Konva plein écran, encore vide à ce stade. */
export function BoardCanvas() {
  const [containerRef, size] = useElementSize<HTMLDivElement>();

  return (
    <div ref={containerRef} className="absolute inset-0" data-testid="board-canvas">
      {size.width > 0 && size.height > 0 && (
        <Stage width={size.width} height={size.height}>
          <Layer />
        </Stage>
      )}
    </div>
  );
}
