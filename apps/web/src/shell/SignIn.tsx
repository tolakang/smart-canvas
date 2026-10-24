import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { BrandMark, PRODUCT_NAME } from '../ui/Brand';

/** Sign in, or (first run only) create the first admin and team. */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="sc-auth">
      <section className="sc-auth__brand" aria-hidden="true">
        <span className="sc-brand">
          <BrandMark size={32} />
          {PRODUCT_NAME}
        </span>
        <div className="sc-auth__pitch">
          <h2>One master artwork. Every size, on brand.</h2>
          <p>Design once in the Layer Comp, and every Facebook post, story, banner and print size lays itself out — Khmer and English alike.</p>
        </div>
        <div className="sc-auth__art">
          <span className="sc-auth__frame sc-auth__frame--a" />
          <span className="sc-auth__frame sc-auth__frame--b" />
          <span className="sc-auth__frame sc-auth__frame--c" />
          <span className="sc-auth__frame sc-auth__frame--d" />
        </div>
      </section>
      <form className="sc-card sc-auth__card" onSubmit={submit}>
        <span className="sc-brand sc-auth__mobile-brand" aria-hidden="true">
          <BrandMark />
          {PRODUCT_NAME}
        </span>
        <div className="sc-auth__head">
          <h1>{mode === 'login' ? 'Sign in' : 'Set up your workspace'}</h1>
          <p className="sc-muted">{mode === 'login' ? 'Welcome back. Sign in to your team’s projects.' : 'Create the first admin account and your team.'}</p>
        </div>
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
          Email <input name="email" type="email" required autoComplete="email" placeholder="you@studio.com" />
        </label>
        <label>
          Password
          <span className="sc-auth__password">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={mode === 'setup' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" className="sc-auth__show" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        {mode === 'setup' && <p className="sc-hint">At least 8 characters.</p>}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create workspace'}
        </button>
        <p className="sc-auth__switch">
          {mode === 'login' ? 'New here? ' : 'Already set up? '}
          <button type="button" className="sc-link" onClick={() => setMode(mode === 'login' ? 'setup' : 'login')}>
            {mode === 'login' ? 'First run? Set up the workspace' : 'Back to sign in'}
          </button>
        </p>
      </form>
    </main>
  );
}
