/**
 * Team (T7.7): members and invite links. Everyone sees the members; admins change roles, remove members,
 * create invite links (any role, optionally bound to one email) and revoke pending ones. The API keeps at
 * least one admin and shows an invite's token only once, when it is created.
 */
import type { TeamRole } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

interface Member {
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
}
interface Invite {
  id: string;
  role: TeamRole;
  email: string | null;
  expiresAt: string;
}

const ROLES: TeamRole[] = ['admin', 'editor', 'viewer'];
const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

/** The web app's invite page for a token (the API's invite link format). */
export const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

export function TeamDialog(props: { teamId: string; teamName: string; userId: string; isAdmin: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const base = `/teams/${props.teamId}`;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<TeamRole>('editor');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let live = true;
    api<Member[]>('GET', `${base}/members`).then(
      (m) => live && setMembers(m),
      () => live && setError('Could not load the team.'),
    );
    if (props.isAdmin) void api<Invite[]>('GET', `${base}/invites`).then((i) => live && setInvites(i));
    return () => {
      live = false;
    };
  }, [base, props.isAdmin, reload]);

  const failed = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'last_admin' ? 'The team needs at least one admin.' : fallback);

  async function changeRole(m: Member, next: TeamRole) {
    setError(null);
    try {
      await api('PATCH', `${base}/members/${m.userId}`, { role: next });
    } catch (err) {
      failed(err, 'Could not change the role.');
    }
    setReload((n) => n + 1);
  }

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.name || m.email} from ${props.teamName}?`)) return;
    setError(null);
    try {
      await api('DELETE', `${base}/members/${m.userId}`);
    } catch (err) {
      failed(err, 'Could not remove the member.');
    }
    setReload((n) => n + 1);
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    try {
      const created = await api<Invite & { token: string }>('POST', `${base}/invites`, { role, ...(email.trim() ? { email: email.trim() } : {}) });
      setLink(inviteLink(created.token));
      setEmail('');
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? 'Check the email address.' : 'Could not create the invite.');
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // the link stays selectable in the field
    }
  }

  async function revoke(i: Invite) {
    setError(null);
    try {
      await api('DELETE', `${base}/invites/${i.id}`);
    } catch {
      setError('Could not revoke the invite.');
    }
    setReload((n) => n + 1);
  }

  return (
    <dialog ref={ref} className="sc-dialog" onClose={props.onClose} aria-labelledby="team-title">
      <div className="sc-card sc-presets sc-team">
        <h1 id="team-title">{props.teamName} · Team</h1>
        <section aria-label="Members">
          <h2>Members</h2>
          {members === null ? (
            <p className="sc-muted">Loading…</p>
          ) : (
            <ul className="sc-list sc-rows">
              {members.map((m) => (
                <li key={m.userId} data-member={m.email}>
                  <span className="sc-rows__main">
                    <span className="sc-rows__name">
                      {m.name || m.email}
                      {m.userId === props.userId && <span className="sc-muted"> (you)</span>}
                    </span>
                    {m.name && <span className="sc-rows__meta">{m.email}</span>}
                  </span>
                  {props.isAdmin ? (
                    <span className="sc-rows__actions">
                      <select aria-label={`Role of ${m.email}`} value={m.role} onChange={(e) => void changeRole(m, e.target.value as TeamRole)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="sc-btn sc-btn--ghost sc-btn--danger" onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>
                        Remove
                      </button>
                    </span>
                  ) : (
                    <span className="sc-badge">{ROLE_LABEL[m.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {props.isAdmin && (
          <>
            <form className="sc-form" onSubmit={invite} aria-label="Invite">
              <h2>Invite someone</h2>
              <div className="sc-fields">
                <label>
                  Role
                  <select value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sc-fields__wide">
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} placeholder="Optional" aria-describedby="invite-email-hint" />
                </label>
              </div>
              <p id="invite-email-hint" className="sc-hint">
                Leave it empty for a link anyone can use once, or add an email so only that person can join.
              </p>
              <div className="sc-form__actions">
                <button type="submit" className="sc-btn sc-btn--primary">
                  Create invite link
                </button>
              </div>
            </form>
            {link && (
              <div className="sc-invite-link" role="group" aria-label="New invite link">
                <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="sc-btn sc-btn--primary" onClick={() => void copy()}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            )}
            {link && <p className="sc-hint">Send this link to the person. It works once, expires in 7 days and won’t be shown again.</p>}
            {invites.length > 0 && (
              <section aria-label="Pending invites">
                <h2>Pending invites</h2>
                <ul className="sc-list sc-rows">
                  {invites.map((i) => (
                    <li key={i.id}>
                      <span className="sc-rows__main">
                        <span className="sc-rows__name">{i.email ?? 'Anyone with the link'}</span>
                        <span className="sc-rows__meta">
                          {ROLE_LABEL[i.role]} · expires {new Date(i.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </span>
                      <button type="button" className="sc-btn sc-btn--ghost sc-btn--danger" onClick={() => void revoke(i)} aria-label={`Revoke ${ROLE_LABEL[i.role]} invite for ${i.email ?? 'anyone'}`}>
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
        <div className="sc-dialog__foot">
          <button type="button" className="sc-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
