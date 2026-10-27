import type { KeyboardEvent } from 'react';

/**
 * UX A1 (F1): a `<label>` that opens a hidden file input is not in the Tab order. Spread this on it so Tab reaches it
 * and Enter or Space opens the picker, as a click does (the label's own onClick runs too). The accent ring comes from
 * the shared `[tabindex]:focus-visible` rule.
 */
export const FILE_PICK = {
  role: 'button',
  tabIndex: 0,
  onKeyDown(e: KeyboardEvent<HTMLLabelElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.currentTarget.click();
  },
} as const;
