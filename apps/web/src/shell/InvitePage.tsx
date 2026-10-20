/**
 * Invite link page (T7.7): /invite/<token>. Shows the team and role, then joins:
 * signed in → join as the current user; signed out → create an account (the email is fixed when the invite
 * is bound to one), or sign in first with an existing account.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Me } from '../api';
import { SignIn } from './SignIn';

interface Preview {
  teamName: string;
  role: 'admin' | 'editor' | 'viewer';
  email: string | null;
  expiresAt: string;
}

/** The token of an invite link path, e.g. /invite/abc… */
export function parseInvitePath(pathname: string): string | null {
  return /^\/invite\/([A-Za-z0-9_-]{20,100})\/?$/.exec(pathname)?.[1] ?? null;
}

const MESSAGES: Record<string, string> = {
  invite_invalid: 'This invite link is no longer valid: it was used, revoked or has expired. Ask an admin for a new one.',
  invite_email_mismatch: 'This invite is for a different email address.',
  account_exists_sign_in_first: 'An account with this email already exists. Sign in first, then open the link again.',
  already_member: 'You are already in this team.',
  email_required: 'Enter your email.',
};

export function InvitePage(props: { token: string; me: Me | null; onSignedIn: () => void; onJoined: () => void }) {
  const { token, me } = props;
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined); // null = invalid
  const [mode, setMode] = useState<'join' | 'signin'>('join');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Preview>('GET', `/invites/${token}`).then(setPreview, () => setPreview(null));
  }, [token]);

  async function accept(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/invites/${token}/accept`, body);
      props.onJoined();
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      if (code === 'already_member') props.onJoined();
      else setError((code && MESSAGES[code]) ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    void accept({ name: get('name'), email: preview?.email ?? get('email'), password: get('password') });
  }

  if (preview === undefined) return <p className="sc-muted">Loading…</p>;
  if (preview === null)
    return (
      <section className="sc-card">
        <h1>Invite</h1>
        <p className="sc-error">{MESSAGES.invite_invalid}</p>
        <a href="/">Go to the app</a>
      </section>
    );

  const what = (
    <p>
      You are invited to <strong>{preview.teamName}</strong> as <strong>{preview.role}</strong>.
    </p>
  );

  if (!me && mode === 'signin')
    return (
      <>
        <section className="sc-card">
          <h1>Join {preview.teamName}</h1>
          {what}
          <button type="button" className="sc-link" onClick={() => setMode('join')}>
            New here? Create an account instead
          </button>
        </section>
        <SignIn onSignedIn={props.onSignedIn} />
      </>
    );

  return (
    <section className="sc-card">
      <h1>Join {preview.teamName}</h1>
      {what}
      {me ? (
        <>
          <p className="sc-muted">Signed in as {me.user.email}.</p>
          <button type="button" disabled={busy} onClick={() => void accept({})}>
            Join {preview.teamName}
          </button>
        </>
      ) : (
        <form onSubmit={create} aria-label="Create your account">
          <label>
            Your name <input name="name" required maxLength={200} autoComplete="name" />
          </label>
          <label>
            Email{' '}
            {preview.email ? (
              <input value={preview.email} readOnly aria-readonly="true" />
            ) : (
              <input name="email" type="email" required autoComplete="email" />
            )}
          </label>
          <label>
            Password <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" disabled={busy}>
            Create account and join
          </button>
          <button type="button" className="sc-link" onClick={() => setMode('signin')}>
            Already have an account? Sign in
          </button>
        </form>
      )}
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
