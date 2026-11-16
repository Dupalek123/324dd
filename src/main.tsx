import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { zastosujMotyw } from './db/sesja';
import './index.css';

zastosujMotyw();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', zastosujMotyw);
registerSW({ immediate: true });
// prosimy przeglądarkę, żeby nie czyściła lokalnej bazy przy braku miejsca
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
