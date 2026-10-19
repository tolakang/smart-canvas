import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App';

describe('web shell', () => {
  it('renders the loading state before the session is known', () => {
    expect(renderToString(<App />)).toContain('Loading');
  });
});
