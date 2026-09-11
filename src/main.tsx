import { render } from 'preact';
import { App } from './ui/App.tsx';

const root = document.querySelector('#app');
if (!root) throw new Error('Missing application root');

render(<App />, root);

const developingLocally = ['localhost', '127.0.0.1'].includes(location.hostname);

if ('serviceWorker' in navigator && developingLocally)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .then(() => caches.keys())
      .then(names => Promise.all(names
        .filter(name => name.startsWith('miami-beach-pwa-template-'))
        .map(name => caches.delete(name))))
      .catch(error => console.error('Could not clear local preview caches.', error));
  });
else if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./service-worker.js')
      .catch(error => console.error('Offline installation failed.', error));
  });
