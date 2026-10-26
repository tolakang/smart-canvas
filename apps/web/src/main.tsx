import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource-variable/inter';
import './fonts/bundled.css';
import './styles.css';
import './board/assets.css';
import './board/pipeline.css';
import './board/chrome.css';
import { applyTheme } from './ui/theme';

applyTheme(); // D34: before the first paint, so a dark-theme user never sees a light flash

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
