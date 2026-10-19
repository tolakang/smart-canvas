import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Me } from './api';
import { Board } from './board/Board';
import { parseRenderPath, RenderPage } from './render/RenderPage';
import { Projects } from './shell/Projects';
import { SignIn } from './shell/SignIn';

/** Routes: #/ (projects of the first team) and #/t/<teamId>/p/<projectId> (board). */
function parseHash(hash: string): { teamId: string; projectId: string } | null {
  const m = /^#\/t\/([^/]+)\/p\/([^/]+)$/.exec(hash);
  return m?.[1] && m[2] ? { teamId: m[1], projectId: m[2] } : null;
}

function useHash() {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const render = typeof window === 'undefined' ? null : parseRenderPath(window.location.pathname, window.location.search);
  return render ? <RenderPage route={render} /> : <Shell />;
}

function Shell() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = loading, null = signed out
  const hash = useHash();

  const loadMe = useCallback(() => {
    api<Me>('GET', '/auth/me').then(setMe, (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else throw e;
    });
  }, []);
  useEffect(loadMe, [loadMe]);

  if (me === undefined) return <p className="sc-muted">Loading…</p>;
  if (me === null) return <SignIn onSignedIn={loadMe} />;

  const route = parseHash(hash);
  const team = me.teams.find((t) => t.id === route?.teamId) ?? me.teams[0];
  if (!team) return <p className="sc-muted">You are not in a team yet. Ask an admin for an invite link.</p>;

  if (route && route.teamId === team.id) {
    return (
      <Board
        teamId={team.id}
        projectId={route.projectId}
        readOnly={team.role === 'viewer'}
        onBack={() => (window.location.hash = '#/')}
      />
    );
  }
  return <Projects team={team} onOpen={(id) => (window.location.hash = `#/t/${team.id}/p/${id}`)} />;
}
