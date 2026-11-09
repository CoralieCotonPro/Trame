import type { User } from '@supabase/supabase-js';
import { BoardPage } from './components/pages/BoardPage';
import { HomePage } from './components/pages/HomePage';
import { JoinPage } from './components/pages/JoinPage';
import { LoginPage } from './components/pages/LoginPage';
import { useRoute } from './hooks/useRoute';
import { useSession } from './hooks/useSession';
import { storedDisplayName } from './lib/identity';
import { isConfigured } from './lib/supabase';

function Centered({ text }: { text: string }) {
  return <main className="flex h-full items-center justify-center p-4 text-center">{text}</main>;
}

function displayName(user: User): string {
  return storedDisplayName() || user.email?.split('@')[0] || 'Invité';
}

export function App() {
  const session = useSession();
  const route = useRoute();

  if (!isConfigured) {
    return <Centered text="Application non configurée : renseignez les variables Supabase (voir README)." />;
  }
  if (session === undefined) return <Centered text="Chargement…" />;
  if (route.name === 'join') return <JoinPage hasSession={session !== null} />;
  if (session === null) return <LoginPage />;
  if (route.name === 'not-found') return <Centered text="Cette page n'existe pas." />;
  if (route.name === 'board') {
    return (
      <BoardPage
        key={route.id}
        boardId={route.id}
        user={{ id: session.user.id, name: displayName(session.user) }}
      />
    );
  }
  return <HomePage userId={session.user.id} isGuest={session.user.is_anonymous === true} />;
}
