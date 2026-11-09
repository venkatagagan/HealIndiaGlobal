import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@hig/shared/lib';
import { App } from './App';
import './index.css';

initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
