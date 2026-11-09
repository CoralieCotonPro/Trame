import { BoardCanvas } from './components/board/BoardCanvas';
import { ProjectStatus } from './components/ProjectStatus';

export function App() {
  return (
    <main className="relative h-full w-full">
      <BoardCanvas />
      <ProjectStatus />
    </main>
  );
}
