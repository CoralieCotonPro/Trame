import { BoardCanvas } from './components/board/BoardCanvas';
import { ElementEditor } from './components/board/ElementEditor';
import { ElementsA11yList } from './components/board/ElementsA11yList';
import { PropertiesPanel } from './components/board/PropertiesPanel';
import { ContextMenu } from './components/dialogs/ContextMenu';
import { Toolbar } from './components/toolbar/Toolbar';
import { TopBar } from './components/toolbar/TopBar';
import { ZoomBar } from './components/toolbar/ZoomBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function App() {
  useKeyboardShortcuts();

  return (
    <main className="relative h-full w-full overflow-hidden">
      <BoardCanvas />
      <ElementEditor />
      <TopBar />
      <Toolbar />
      <ZoomBar />
      <PropertiesPanel />
      <ContextMenu />
      <ElementsA11yList />
    </main>
  );
}
