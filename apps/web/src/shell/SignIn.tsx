import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

/** Sign in, or (first run only) create the first admin and team. */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await api('POST', '/auth/login', { email: get('email'), password: get('password') });
      else
        await api('POST', '/auth/setup', {
          email: get('email'),
          password: get('password'),
          name: get('name'),
          teamName: get('teamName'),
        });
      onSignedIn();
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setError(
        code === 'invalid_credentials'
          ? 'Wrong email or password.'
          : code === 'already_set_up'
            ? 'This workspace is already set up. Sign in instead.'
            : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sc-card" onSubmit={submit}>
      <h1>{mode === 'login' ? 'Sign in' : 'Set up your workspace'}</h1>
      {mode === 'setup' && (
        <>
          <label>
            Your name <input name="name" required autoComplete="name" />
          </label>
          <label>
            Team name <input name="teamName" required />
          </label>
        </>
      )}
      <label>
        Email <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Password{' '}
        <input
          name="password"
          type="password"
          required
          minLength={mode === 'setup' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {error && <p className="sc-error">{error}</p>}
      <button type="submit" disabled={busy}>
        {mode === 'login' ? 'Sign in' : 'Create workspace'}
      </button>
      <button type="button" className="sc-link" onClick={() => setMode(mode === 'login' ? 'setup' : 'login')}>
        {mode === 'login' ? 'First run? Set up the workspace' : 'Back to sign in'}
      </button>
    </form>
  );
}
