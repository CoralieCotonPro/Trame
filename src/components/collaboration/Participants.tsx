import { usePresenceStore } from '../../stores/presenceStore';

const MAX_VISIBLE = 5;

export function Participants() {
  const participants = usePresenceStore((state) => state.participants);
  if (participants.length === 0) return null;
  const visible = participants.slice(0, MAX_VISIBLE);
  const hidden = participants.length - visible.length;
  const names = participants.map((participant) => participant.name).join(', ');

  return (
    <div
      role="group"
      aria-label={`${participants.length} participant${participants.length > 1 ? 's' : ''} : ${names}`}
      title={names}
      className="flex items-center"
    >
      {visible.map((participant) => (
        <span
          key={participant.clientId}
          aria-hidden="true"
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold text-white first:ml-0"
          style={{ background: participant.color }}
        >
          {participant.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {hidden > 0 && <span className="ml-1 text-xs text-ink-soft">+{hidden}</span>}
    </div>
  );
}
