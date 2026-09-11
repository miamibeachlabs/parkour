import { render } from 'preact';
import { App } from './ui/App.tsx';

const root = document.querySelector('#app');
if (!root) throw new Error('Missing application root');

render(<App />, root);

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./service-worker.js')
      .catch(error => console.error('Offline installation failed.', error));
  });
