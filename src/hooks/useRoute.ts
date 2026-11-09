import { useEffect, useState } from 'react';

const UUID = /^\/b\/([0-9a-f-]{36})\/?$/i;

export type Route = { name: 'home' } | { name: 'board'; id: string } | { name: 'not-found' };

function parse(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  const id = UUID.exec(pathname)?.[1];
  return id ? { name: 'board', id } : { name: 'not-found' };
}

const listeners = new Set<() => void>();

export function navigate(path: string) {
  window.history.pushState(null, '', path);
  listeners.forEach((listener) => listener());
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.pathname));

  useEffect(() => {
    const update = () => setRoute(parse(window.location.pathname));
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);

  return route;
}
