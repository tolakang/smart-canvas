import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App';

describe('web scaffold', () => {
  it('renders the app shell', () => {
    expect(renderToString(<App />)).toContain('Smart Canvas');
  });
});
