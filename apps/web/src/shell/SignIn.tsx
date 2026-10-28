import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { BRAND_MOBILE, BRAND_ON_DARK, BrandMark, PRODUCT_NAME } from '../ui/Brand';

/** A frame of the brand panel's picture: frosted glass with a coloured block in it. */
const FRAME = `absolute rounded-[12px] border border-[rgb(255_255_255/0.35)] [background:var(--auth-frame)] [backdrop-filter:blur(6px)] [box-shadow:0_18px_40px_-12px_rgb(0_0_0/0.45)] after:absolute after:inset-x-[14%] after:top-[18%] after:h-[34%] after:rounded-[8px] after:[background:var(--auth-art)] after:opacity-85 after:content-['']`;
/** The sign-in card; its fields and Sign in button are larger than the app's. */
const CARD =
  'sc-card sc-auth__card m-0 w-[min(400px,calc(100%-32px))] gap-16 self-center justify-self-center rounded-[22px] px-32 py-36 [box-shadow:var(--shadow-3)] max-lg:mx-auto max-lg:my-32 [&_input:not([type=checkbox])]:h-42 [&_input:not([type=checkbox])]:text-[14px] [&_button[type=submit]]:h-44 [&_button[type=submit]]:rounded-[12px] [&_button[type=submit]]:text-[14px]';

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
    <main className="sc-auth grid min-h-dvh grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] max-lg:grid-cols-[1fr]">
      <section className="sc-auth__brand relative flex flex-col justify-between overflow-hidden px-48 py-40 text-[white] [background:var(--auth-panel)] max-lg:hidden" aria-hidden="true">
        <span className={BRAND_ON_DARK}>
          <BrandMark size={32} />
          {PRODUCT_NAME}
        </span>
        <div className="sc-auth__pitch max-w-[520px]">
          <h2 className="mt-0 mb-14 text-[40px] leading-[1.08] font-[750] tracking-[-0.03em]">One master artwork. Every size, on brand.</h2>
          <p className="m-0 text-[16px] leading-[1.55] text-[rgb(255_255_255/0.78)]">Design one master artwork, and every Facebook post, story, banner and print size lays itself out — Khmer and English alike.</p>
        </div>
        <div className="sc-auth__art relative h-200">
          <span className={`sc-auth__frame sc-auth__frame--a ${FRAME} bottom-0 left-0 h-190 w-150`} />
          <span className={`sc-auth__frame sc-auth__frame--b ${FRAME} bottom-0 left-170 h-120 w-220`} />
          <span className={`sc-auth__frame sc-auth__frame--c ${FRAME} bottom-0 left-410 h-160 w-90`} />
          <span className={`sc-auth__frame sc-auth__frame--d ${FRAME} bottom-140 left-170 h-50 w-120`} />
        </div>
      </section>
      <form className={CARD} onSubmit={submit}>
        <span className={BRAND_MOBILE} aria-hidden="true">
          <BrandMark />
          {PRODUCT_NAME}
        </span>
        <div className="sc-auth__head">
          <h1 className="text-[26px]">{mode === 'login' ? 'Sign in' : 'Set up your workspace'}</h1>
          <p className="sc-muted mx-0 mt-4 mb-0">{mode === 'login' ? 'Welcome back. Sign in to your team’s projects.' : 'Create the first admin account and your team.'}</p>
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
          <span className="sc-auth__password relative">
            <input
              className="w-full pr-64"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={mode === 'setup' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" className="sc-auth__show absolute top-1/2 right-6 h-30 rounded-[8px] bg-surface-2 [border:0] px-10 py-0 text-[12px] font-[600] text-muted [transform:translateY(-50%)]" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
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
        <p className="sc-auth__switch m-0 text-center text-muted">
          {mode === 'login' ? 'New here? ' : 'Already set up? '}
          <button type="button" className="sc-link" onClick={() => setMode(mode === 'login' ? 'setup' : 'login')}>
            {mode === 'login' ? 'First run? Set up the workspace' : 'Back to sign in'}
          </button>
        </p>
      </form>
    </main>
  );
}
