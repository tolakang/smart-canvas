/**
 * The board's top bar and the bar over a history version (clean-up 2, U8: moved out of Board.tsx as they were). The
 * board owns the state; these only show it and call back.
 */
import type { Theme } from '../ui/theme';
import type { Screen } from '../ui/responsive';
import type { SaveState } from './autosave';
import { versionTitle, versionWhen, type Version } from './HistoryPanel';
import { Icon } from './LayerRow';
import { ADD, COUNT, COUNTS, GHOST, GROUP_ADD, GROUP_END, GROUP_START, ICON, NAME, PRIMARY, SAVE_BUTTON, SAVE_LONG, SAVE_SHORT, saveClass, saveDotClass, SEP, TOPBAR } from './topbar';
import { VERSION, VERSION_ACTIONS, VERSION_CLOSE, VERSION_RESTORE } from './frame';

/** U2: what the save status says where the bar is narrow (tablets, phones). */
const SHORT_LABEL: Record<SaveState, string> = { saved: 'Saved', pending: 'Unsaved', saving: 'Saving…', error: 'Retrying…', conflict: 'Newer version' };

const STATE_LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  error: 'Save failed, retrying…',
  conflict: 'Someone else saved a newer version.',
};

export function TopBar(props: {
  name: string;
  readOnly: boolean;
  /** D62: a history version is shown (nothing is saved meanwhile). */
  previewing: boolean;
  screen: Screen;
  /** Tablet / phone: the side panels float, so there is no side panel to hide. */
  floating: boolean;
  canStep: { undo: boolean; redo: boolean };
  onUndo: () => void;
  onRedo: () => void;
  onBack: () => void;
  onAdd: (button: HTMLElement) => void;
  sourceCount: number;
  outputCount: number;
  notice: string | null;
  saveState: SaveState;
  onReload: () => void;
  onMore: (button: HTMLElement) => void;
  onAssets: (button: HTMLElement) => void;
  historyOpen: boolean;
  onHistory: () => void;
  reviewOpen: boolean;
  onReview: () => void;
  openComments: number;
  theme: Theme;
  onTheme: () => void;
  inspectorHidden: boolean;
  onInspectorHidden: (hidden: boolean) => void;
  onExport: () => void;
}) {
  const { readOnly, screen, saveState } = props;
  return (
    <header className={TOPBAR}>
      <div className={GROUP_START}>
        <button type="button" className={ICON} onClick={props.onBack} aria-label="Back to projects" title="All projects">
          <Icon name="back" />
        </button>
        <strong className={NAME} title={props.name}>
          {props.name}
        </strong>
        {readOnly && !props.previewing && <span className="sc-badge">View only</span>}
        {!readOnly && screen !== 'phone' && (
          <>
            <span className={SEP} aria-hidden="true" />
            <button type="button" className={ICON} onClick={props.onUndo} disabled={!props.canStep.undo} aria-label="Undo" title="Undo (Ctrl/⌘+Z)">
              <Icon name="undo" />
            </button>
            <button type="button" className={ICON} onClick={props.onRedo} disabled={!props.canStep.redo} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)">
              <Icon name="redo" />
            </button>
          </>
        )}
      </div>
      {!readOnly && screen !== 'phone' && (
        <div className={GROUP_ADD} role="group" aria-label="Add">
          {/* D49: one menu for every node — the asset nodes and the Preset nodes (as right-click on the canvas). */}
          <button type="button" className={ADD} aria-label="+ Add" aria-haspopup="menu" onClick={(e) => props.onAdd(e.currentTarget)} title="Add a node (or right-click the canvas)">
            <Icon name="plus" /> Add
          </button>
        </div>
      )}
      {readOnly && screen !== 'phone' && (
        <span className={COUNTS}>
          {props.sourceCount} inputs · {props.outputCount} outputs
        </span>
      )}
      <div className={GROUP_END}>
        {props.notice && (
          <span className="sc-error" role="alert">
            {props.notice}
          </span>
        )}
        {/* D62: nothing is saved while a history version is shown. */}
        {!props.previewing && (
          <span className={saveClass(saveState)} role="status">
            <span className={saveDotClass(saveState)} aria-hidden="true" />
            <span className={SAVE_LONG}>{STATE_LABEL[saveState]}</span>
            <span className={SAVE_SHORT} aria-hidden="true">
              {SHORT_LABEL[saveState]}
            </span>
            {saveState === 'conflict' && (
              <button type="button" className={SAVE_BUTTON} onClick={props.onReload}>
                Reload latest
              </button>
            )}
          </span>
        )}
        {screen === 'phone' ? (
          <button type="button" className={ICON} aria-label="More" aria-haspopup="menu" title="More" onClick={(e) => props.onMore(e.currentTarget)}>
            <Icon name="more" />
          </button>
        ) : (
          <>
            <span className={SEP} aria-hidden="true" />
            {/* U2: the team's fonts and library under one Assets menu; History and Review with their names too (icons only
                at 1100 px and narrower, like Assets); the theme as an icon. */}
            <button type="button" className={GHOST} aria-haspopup="menu" onClick={(e) => props.onAssets(e.currentTarget)} title="Team fonts and library">
              <Icon name="library" /> Assets
            </button>
            <button type="button" className={`${GHOST} aria-pressed:bg-accent-soft`} onClick={props.onHistory} aria-label="History" aria-pressed={props.historyOpen} title="History: earlier versions of this project">
              <Icon name="history" /> History
            </button>
            <button type="button" className={`${GHOST} sc-topbar__review relative aria-pressed:bg-accent-soft`} onClick={props.onReview} aria-label="Review" aria-pressed={props.reviewOpen} title="Review: approval and comments on every Preview">
              <Icon name="check" /> Review
              {props.openComments > 0 && <span className={COUNT} aria-hidden="true">{props.openComments}</span>}
            </button>
            <button
              type="button"
              className={`${ICON} sc-theme-toggle`}
              onClick={props.onTheme}
              aria-label="Dark theme"
              aria-pressed={props.theme === 'dark'}
              title={props.theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
            >
              <Icon name={props.theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            {!props.floating && (
              <button
                type="button"
                className={ICON}
                onClick={() => props.onInspectorHidden(!props.inspectorHidden)}
                aria-label="Side panel"
                aria-pressed={!props.inspectorHidden}
                title={props.inspectorHidden ? 'Show the side panel' : 'Hide the side panel'}
              >
                <Icon name="panel" />
              </button>
            )}
          </>
        )}
        {!readOnly && (
          <button
            type="button"
            className={PRIMARY}
            aria-label="Export"
            onClick={props.onExport}
            disabled={props.outputCount === 0}
            title={props.outputCount === 0 ? 'Add sizes first: pick them in the Export Group' : 'Export Previews'}
          >
            <Icon name="export" /> Export
          </button>
        )}
      </div>
    </header>
  );
}

/** D62: the bar over a history version shown read-only: when it was saved, and Restore (for editors) or Close. */
export function VersionBar(props: { version: Version; error: string | null; canEdit: boolean; onRestore: () => void; onClose: () => void }) {
  const { version } = props;
  return (
    <div className={VERSION} role="status">
      <span>
        <strong>Version from {versionWhen(version)}</strong>
        {` · ${versionTitle(version)}`}
        {version.by ? ` · ${version.by}` : ''}
      </span>
      {props.error && <span className="sc-error">{props.error}</span>}
      <span className={VERSION_ACTIONS}>
        {props.canEdit && (
          <button type="button" className={VERSION_RESTORE} onClick={props.onRestore}>
            Restore
          </button>
        )}
        <button type="button" className={VERSION_CLOSE} onClick={props.onClose}>
          Close
        </button>
      </span>
    </div>
  );
}
