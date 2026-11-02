/**
 * Team (T7.7): members and invite links. Everyone sees the members; admins change roles, remove members,
 * create invite links (any role, optionally bound to one email) and revoke pending ones. The API keeps at
 * least one admin and shows an invite's token only once, when it is created.
 */
import type { TeamRole } from '@smart-canvas/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { DIALOG, DIALOG_CARD, DIALOG_LIST, DIALOG_LONG_CARD, DIALOG_ROW, DIALOG_SELECT, DIALOG_STICKY_FOOT, ERROR_TEXT, FIELD_WIDE, FIELDS, FORM, FORM_ACTIONS, HINT, MUTED_TEXT, PRESET_FIELD, ROW_ACTIONS, ROW_MAIN, ROW_META, ROW_NAME } from '../ui/tw';
import { BADGE, btn } from '../ui/button';

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
    <dialog ref={ref} className={DIALOG} onClose={props.onClose} aria-labelledby="team-title">
      <div className={`${DIALOG_CARD} sc-presets sc-team ${DIALOG_LONG_CARD}`}>
        <h1 id="team-title">{props.teamName} · Team</h1>
        <section aria-label="Members">
          <h2>Members</h2>
          {members === null ? (
            <p className={MUTED_TEXT}>Loading…</p>
          ) : (
            <ul className={DIALOG_LIST}>
              {members.map((m) => (
                <li key={m.userId} className={DIALOG_ROW} data-member={m.email}>
                  <span className={ROW_MAIN}>
                    <span className={ROW_NAME}>
                      {m.name || m.email}
                      {m.userId === props.userId && <span className={MUTED_TEXT}> (you)</span>}
                    </span>
                    {m.name && <span className={ROW_META}>{m.email}</span>}
                  </span>
                  {props.isAdmin ? (
                    <span className={ROW_ACTIONS}>
                      <select className={DIALOG_SELECT} aria-label={`Role of ${m.email}`} value={m.role} onChange={(e) => void changeRole(m, e.target.value as TeamRole)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className={btn('ghost-danger', 'card-row')} onClick={() => void remove(m)} aria-label={`Remove ${m.email}`}>
                        Remove
                      </button>
                    </span>
                  ) : (
                    <span className={BADGE}>{ROLE_LABEL[m.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {props.isAdmin && (
          <>
            <form className={FORM} onSubmit={invite} aria-label="Invite">
              <h2>Invite someone</h2>
              <div className={FIELDS}>
                <label className={PRESET_FIELD}>
                  Role
                  <select className={DIALOG_SELECT} value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${FIELD_WIDE} ${PRESET_FIELD}`}>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} placeholder="Optional" aria-describedby="invite-email-hint" />
                </label>
              </div>
              <p id="invite-email-hint" className={HINT}>
                Leave it empty for a link anyone can use once, or add an email so only that person can join.
              </p>
              <div className={FORM_ACTIONS}>
                <button type="submit" className={btn('primary', 'card')}>
                  Create invite link
                </button>
              </div>
            </form>
            {link && (
              <div className="sc-invite-link flex gap-(--sp-2)" role="group" aria-label="New invite link">
                <input className="flex-1" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className={btn('primary', 'card')} onClick={() => void copy()}>
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            )}
            {link && <p className={HINT}>Send this link to the person. It works once, expires in 7 days and won’t be shown again.</p>}
            {invites.length > 0 && (
              <section aria-label="Pending invites">
                <h2>Pending invites</h2>
                <ul className={DIALOG_LIST}>
                  {invites.map((i) => (
                    <li key={i.id} className={DIALOG_ROW}>
                      <span className={ROW_MAIN}>
                        <span className={ROW_NAME}>{i.email ?? 'Anyone with the link'}</span>
                        <span className={ROW_META}>
                          {ROLE_LABEL[i.role]} · expires {new Date(i.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </span>
                      <button type="button" className={btn('ghost-danger', 'card-row')} onClick={() => void revoke(i)} aria-label={`Revoke ${ROLE_LABEL[i.role]} invite for ${i.email ?? 'anyone'}`}>
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
          <p className={ERROR_TEXT} role="alert">
            {error}
          </p>
        )}
        <div className={DIALOG_STICKY_FOOT}>
          <button type="button" className={btn('default', 'card')} onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
