/**
 * D63: comments on one Preview, in the output editor's side panel (in place of Design while the Comment tool is on).
 * A click or tap on the Preview starts a pinned comment there; "Comment on the whole Preview" starts one without a
 * pin. Threads have replies; the author edits their text; the author or an editor resolves; the author or an admin
 * deletes. Pins are numbered as threads were started; the selected thread's pin is highlighted.
 */
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useBoard } from '../board/context';
import { mayOnComment, threadsOf, type ReviewComment, type Thread } from '../board/review';
import { COMMENTS, COMMENTS_HEAD, SECTION } from './panels';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The pins over the Preview: each open (or, with `resolved`, every) pinned thread, numbered; and the one being written. */
export function CommentPins(props: {
  threads: Thread[];
  scene: { width: number; height: number };
  scale: number;
  active: string | null;
  pending: { x: number; y: number } | null;
  onPick: (id: string) => void;
}) {
  const { scene, scale } = props;
  const at = (x: number, y: number) => ({ left: x * scene.width * scale, top: y * scene.height * scale });
  return (
    <>
      {props.threads
        .filter((t) => t.comment.pinX !== null && t.comment.pinY !== null)
        .map((t) => (
          <button
            key={t.comment.id}
            type="button"
            className={`sc-pin${t.comment.id === props.active ? ' sc-pin--on' : ''}${t.comment.resolvedAt ? ' sc-pin--resolved' : ''}`}
            style={at(t.comment.pinX ?? 0, t.comment.pinY ?? 0)}
            aria-label={`Comment ${t.n}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onPick(t.comment.id);
            }}
          >
            {t.n}
          </button>
        ))}
      {props.pending && (
        <span className="sc-pin sc-pin--new" style={at(props.pending.x, props.pending.y)} aria-hidden="true">
          +
        </span>
      )}
    </>
  );
}

export function CommentsPanel(props: {
  outputId: string;
  showResolved: boolean;
  onShowResolved: (on: boolean) => void;
  /** Where a new pinned comment goes (set by a click on the Preview); null = none being written. */
  pending: { x: number; y: number } | null;
  onPending: (p: { x: number; y: number } | null) => void;
  active: string | null;
  onActive: (id: string | null) => void;
}) {
  const { projectUrl, review, reloadReview, userId, role } = useBoard();
  const threads = threadsOf(review, props.outputId, props.showResolved);
  const [error, setError] = useState<string | null>(null);
  const url = `${projectUrl}/review/comments`;

  async function send(method: string, path: string, body?: object) {
    setError(null);
    try {
      await api(method, path, body);
      reloadReview();
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'This project has reached its comment limit.' : 'That did not work. Try again.');
      return false;
    }
  }
  const post = (text: string, extra: object) => send('POST', url, { outputId: props.outputId, text, ...extra });

  return (
    <aside className={COMMENTS} aria-label="Comments">
      <section className={SECTION}>
        <div className={COMMENTS_HEAD}>
          Comments
          <label className="sc-comments__toggle">
            <input type="checkbox" checked={props.showResolved} onChange={(e) => props.onShowResolved(e.target.checked)} /> Show resolved
          </label>
        </div>
        {props.pending ? (
          <Compose
            label="New comment"
            placeholder="Add a comment at this spot"
            submit="Post"
            onCancel={() => props.onPending(null)}
            onSubmit={async (text) => {
              if (await post(text, { pin: props.pending })) props.onPending(null);
            }}
          />
        ) : (
          <p className="sc-muted sc-comments__hint">Click or tap the Preview to pin a comment there.</p>
        )}
        {error && (
          <p className="sc-error" role="alert">
            {error}
          </p>
        )}
      </section>
      {threads.length === 0 && <p className={`sc-muted sc-comments__hint ${SECTION}`}>No comments yet.</p>}
      <ol className="sc-comments__list">
        {threads.map((t) => (
          <li key={t.comment.id} className={`sc-comments__thread${t.comment.id === props.active ? ' sc-comments__thread--on' : ''}${t.comment.resolvedAt ? ' sc-comments__thread--resolved' : ''}`}>
            <CommentView
              c={t.comment}
              n={t.comment.pinX !== null ? t.n : undefined}
              may={mayOnComment(t.comment, { userId, role })}
              onSelect={() => props.onActive(t.comment.id === props.active ? null : t.comment.id)}
              send={send}
              url={url}
            />
            {t.replies.map((r) => (
              <div key={r.id} className="sc-comments__reply">
                <CommentView c={r} may={mayOnComment(r, { userId, role })} send={send} url={url} />
              </div>
            ))}
            {!t.comment.resolvedAt && <Reply onSubmit={(text) => post(text, { parentId: t.comment.id })} />}
          </li>
        ))}
      </ol>
      <section className={SECTION}>
        <Compose label="Comment on the whole Preview" placeholder="A comment on the whole Preview" submit="Comment" onSubmit={(text) => post(text, {}).then(() => undefined)} />
      </section>
    </aside>
  );
}

function CommentView(props: {
  c: ReviewComment;
  n?: number;
  may: { edit: boolean; resolve: boolean; remove: boolean };
  onSelect?: () => void;
  send: (method: string, path: string, body?: object) => Promise<boolean>;
  url: string;
}) {
  const { c, may } = props;
  const [editing, setEditing] = useState(false);
  const path = `${props.url}/${c.id}`;
  return (
    <div className="sc-comment">
      <div className="sc-comment__meta">
        {props.n !== undefined && <span className="sc-pin sc-pin--inline">{props.n}</span>}
        <strong>{c.author ?? 'Someone'}</strong>
        <span className="sc-muted">{when(c.createdAt)}</span>
      </div>
      {editing ? (
        <Compose
          label="Edit comment"
          initial={c.text}
          submit="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (text) => {
            if (await props.send('PATCH', path, { text })) setEditing(false);
          }}
        />
      ) : props.onSelect ? (
        <button type="button" className="sc-comment__text" onClick={props.onSelect}>
          {c.text}
        </button>
      ) : (
        <p className="sc-comment__text">{c.text}</p>
      )}
      {c.resolvedAt && <p className="sc-muted sc-comment__resolved">Resolved{c.resolvedBy ? ` by ${c.resolvedBy}` : ''}</p>}
      {!editing && (may.edit || may.resolve || may.remove) && (
        <div className="sc-comment__actions">
          {may.resolve && (
            <button type="button" onClick={() => void props.send('PATCH', path, { resolved: !c.resolvedAt })}>
              {c.resolvedAt ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {may.edit && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {may.remove && (
            <button type="button" onClick={() => window.confirm(c.parentId ? 'Delete this reply?' : 'Delete this comment and its replies?') && void props.send('DELETE', path)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Reply({ onSubmit }: { onSubmit: (text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="sc-comments__reply-btn" onClick={() => setOpen(true)}>
        Reply
      </button>
    );
  return (
    <Compose
      label="Reply"
      placeholder="Reply"
      submit="Reply"
      onCancel={() => setOpen(false)}
      onSubmit={async (text) => {
        if (await onSubmit(text)) setOpen(false);
      }}
    />
  );
}

/** A text box with a submit button (Ctrl/⌘ + Enter submits); cleared after a submit. */
function Compose(props: { label: string; placeholder?: string; initial?: string; submit: string; onSubmit: (text: string) => Promise<void>; onCancel?: () => void }) {
  const [text, setText] = useState(props.initial ?? '');
  const [busy, setBusy] = useState(false);
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    await props.onSubmit(t);
    setBusy(false);
    setText('');
  }
  return (
    <form className="sc-comments__compose" aria-label={props.label} onSubmit={(e) => void submit(e)}>
      <textarea
        aria-label={props.label}
        placeholder={props.placeholder}
        maxLength={2000}
        rows={2}
        value={text}
        autoFocus={Boolean(props.onCancel)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // the editor's keys (Delete, arrows, V / H) are not for this box
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === 'Escape') props.onCancel?.();
        }}
      />
      <span className="sc-comments__compose-actions">
        {props.onCancel && (
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="sc-comments__primary" disabled={!text.trim() || busy}>
          {props.submit}
        </button>
      </span>
    </form>
  );
}
