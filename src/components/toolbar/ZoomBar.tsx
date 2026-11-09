import { Maximize, Minus, Plus } from 'lucide-react';
import { MAX_ZOOM, MIN_ZOOM } from '../../lib/camera';
import { fitToContent, resetZoom, zoomBy } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from './IconButton';

export function ZoomBar() {
  const zoom = useUiStore((state) => state.camera.zoom);

  return (
    <div
      role="group"
      aria-label="Zoom"
      className="absolute right-4 bottom-4 z-20 flex items-center gap-0.5 rounded-panel border border-line bg-surface p-1.5 shadow-panel"
    >
      <IconButton
        icon={Minus}
        label="Dézoomer"
        tooltipSide="top"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => zoomBy(1 / 1.2)}
      />
      <button
        type="button"
        onClick={(event) => {
          resetZoom();
          // Après un clic souris, la barre d'espace doit rester dédiée au déplacement du tableau.
          if (event.detail > 0) event.currentTarget.blur();
        }}
        aria-label={`Zoom actuel ${Math.round(zoom * 100)} %, revenir à 100 %`}
        title="Revenir à 100 %"
        className="h-10 w-14 rounded-lg text-sm tabular-nums hover:bg-paper"
      >
        {Math.round(zoom * 100)} %
      </button>
      <IconButton
        icon={Plus}
        label="Zoomer"
        tooltipSide="top"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => zoomBy(1.2)}
      />
      <IconButton
        icon={Maximize}
        label="Ajuster à tous les éléments"
        tooltipSide="top"
        onClick={fitToContent}
      />
    </div>
  );
}
