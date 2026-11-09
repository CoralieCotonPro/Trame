import { MousePointer2 } from 'lucide-react';
import { boardToScreen } from '../../lib/camera';
import { clientId } from '../../lib/identity';
import { displayRect } from '../../lib/layout';
import { useBoardStore } from '../../stores/boardStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useUiStore } from '../../stores/uiStore';

function Label({ color, children }: { color: string; children: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

/** Curseurs et éditions des autres participants, dessinés au-dessus du tableau. */
export function RemoteOverlay() {
  const participants = usePresenceStore((state) => state.participants);
  const cursors = usePresenceStore((state) => state.cursors);
  const camera = useUiStore((state) => state.camera);
  const elements = useBoardStore((state) => state.elements);
  const others = participants.filter((participant) => participant.clientId !== clientId);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
      {others.map((participant) => {
        const element = participant.editing ? elements[participant.editing] : undefined;
        if (!element) return null;
        const rect = displayRect(element);
        const topLeft = boardToScreen(camera, rect);
        return (
          <div
            key={participant.clientId}
            className="absolute rounded-lg border-2"
            style={{
              borderColor: participant.color,
              left: topLeft.x,
              top: topLeft.y,
              width: rect.width * camera.zoom,
              height: rect.height * camera.zoom,
            }}
          >
            <div className="absolute bottom-full left-0 mb-1">
              <Label color={participant.color}>{`${participant.name} modifie…`}</Label>
            </div>
          </div>
        );
      })}
      {others.map((participant) => {
        const cursor = cursors[participant.clientId];
        if (!cursor) return null;
        const point = boardToScreen(camera, cursor);
        return (
          <div
            key={participant.clientId}
            data-testid="remote-cursor"
            className="absolute top-0 left-0 flex items-start transition-transform duration-300 ease-out"
            style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
          >
            <MousePointer2 size={18} fill={participant.color} color="#ffffff" />
            <Label color={participant.color}>{participant.name}</Label>
          </div>
        );
      })}
    </div>
  );
}
