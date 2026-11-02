/**
 * UX C1 (D71): the guided start's progress strip, under the top bar until the project's first export (or until it
 * is hidden): Artwork · Sizes · Review · Export, each done ✓, the next one outlined. Each step is a button that
 * takes you there. Editors only; never while a history version is shown.
 */
import { Icon } from './LayerRow';
import { nextStep, type GuideStep, type GuideStepId } from './progress';
import { iconBtn } from '../ui/button';

const BAR = 'sc-start flex items-center gap-(--sp-2) px-12 pt-6 pb-0 text-sm max-md:px-6';
const LIST = 'm-0 flex min-w-0 flex-1 list-none gap-4 overflow-x-auto p-0';
const STEP =
  'inline-flex h-28 cursor-pointer items-center gap-6 rounded-[8px] border border-solid border-transparent bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] px-10 text-xs font-[650] whitespace-nowrap text-muted [box-shadow:var(--shadow-1)] hover:text-fg data-[state=done]:text-ok data-[state=next]:border-accent data-[state=next]:text-accent';

const HINT: Record<GuideStepId, string> = {
  assets: 'Add your logos, pictures and text in the asset nodes',
  sizes: 'Pick the sizes you need in Main Comps',
  review: 'Approve each Preview in the Review panel',
  export: 'Export every size',
};

export function GuideBar(props: { steps: readonly GuideStep[]; onStep: (id: GuideStepId) => void; onHide: () => void }) {
  const next = nextStep(props.steps);
  return (
    <nav className={BAR} aria-label="Getting started">
      <ol className={LIST}>
        {props.steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={STEP}
              data-state={s.done ? 'done' : s.id === next ? 'next' : 'todo'}
              aria-current={s.id === next ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${s.label}${s.done ? ' (done)' : ''}`}
              title={HINT[s.id]}
              onClick={() => props.onStep(s.id)}
            >
              {s.done ? <Icon name="check" size={12} /> : <span aria-hidden="true">{i + 1}</span>}
              {s.label}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className={iconBtn()} aria-label="Hide the getting-started steps" title="Hide these steps" onClick={props.onHide}>
        <Icon name="close" size={14} />
      </button>
    </nav>
  );
}
