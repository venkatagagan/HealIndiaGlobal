import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { whenI18nReady } from '@hig/shared/lib';
import { App } from './App';
import './i18n';
import { installHospitalHeader } from './auth/HospitalProvider';
import { initTheme } from './lib/prefs';
import './index.css';

initTheme();
installHospitalHeader();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// Wait (briefly) for the visitor's language so non-English users do not see an English flash.
void whenI18nReady().then(() =>
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
