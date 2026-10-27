// First: the cascade layer order for every stylesheet, React Flow's (loaded through App) included.
import './tailwind.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/inter';
import './fonts/bundled.css';
// Our stylesheets, all in the `app` cascade layer (tailwind.css), so their order here still decides ties. Area
// stylesheets go newest first, right after styles.css: the rules each one took from styles.css keep their place ahead
// of the older areas' rules.
import './styles.css';
import './board/review.css';
import './editor/editor.css';
import './board/node.css';
import './board/chrome.css';
import './board/assets.css';
import { applyTheme } from './ui/theme';

applyTheme(); // D34: before the first paint, so a dark-theme user never sees a light flash

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
