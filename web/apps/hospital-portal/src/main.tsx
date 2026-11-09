import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installHospitalHeader } from './auth/HospitalProvider';
import { initTheme } from './lib/prefs';
import './index.css';

initTheme();
installHospitalHeader();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
