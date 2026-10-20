import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './fonts/bundled.css';
import './styles.css';
import { applyTheme } from './ui/theme';

applyTheme(); // D34: before the first paint, so a dark-theme user never sees a light flash

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
