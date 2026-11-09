import { Hand, MousePointer2, StickyNote, Type } from 'lucide-react';
import { addPostit, addText } from '../../stores/actions';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from './IconButton';

export function Toolbar() {
  const tool = useUiStore((state) => state.tool);
  const setUi = useUiStore((state) => state.set);

  return (
    <nav
      aria-label="Outils"
      className="absolute top-1/2 left-4 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-panel border border-line bg-surface p-1.5 shadow-panel"
    >
      <IconButton
        icon={MousePointer2}
        label="Sélection"
        shortcut="V"
        active={tool === 'select'}
        onClick={() => setUi({ tool: 'select' })}
      />
      <IconButton
        icon={Hand}
        label="Main : déplacer le tableau"
        shortcut="H"
        active={tool === 'hand'}
        onClick={() => setUi({ tool: 'hand' })}
      />
      <div className="mx-2 my-1 h-px bg-line" />
      <IconButton icon={Type} label="Ajouter un texte" shortcut="T" onClick={addText} />
      <IconButton icon={StickyNote} label="Ajouter un post-it" shortcut="N" onClick={() => addPostit()} />
    </nav>
  );
}
