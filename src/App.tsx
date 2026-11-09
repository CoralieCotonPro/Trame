import { BoardPage } from './components/pages/BoardPage';
import { HomePage } from './components/pages/HomePage';
import { LoginPage } from './components/pages/LoginPage';
import { useRoute } from './hooks/useRoute';
import { useSession } from './hooks/useSession';
import { isConfigured } from './lib/supabase';

function Centered({ text }: { text: string }) {
  return <main className="flex h-full items-center justify-center p-4 text-center">{text}</main>;
}

export function App() {
  const session = useSession();
  const route = useRoute();

  if (!isConfigured) {
    return <Centered text="Application non configurée : renseignez les variables Supabase (voir README)." />;
  }
  if (session === undefined) return <Centered text="Chargement…" />;
  if (session === null) return <LoginPage />;
  if (route.name === 'not-found') return <Centered text="Cette page n'existe pas." />;
  if (route.name === 'board') {
    return <BoardPage key={route.id} boardId={route.id} userId={session.user.id} />;
  }
  return <HomePage />;
}
