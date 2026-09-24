import './style.css';
import { mount } from './ui/app';

mount(document.getElementById('app')!);

// App instalável e offline (só na versão publicada; no dev atrapalharia o recarregamento).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
