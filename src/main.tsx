import { render } from 'preact';
import { parkour } from './generated/parkour.ts';
import { App } from './ui/App.tsx';

const root = document.querySelector('#app');
if (!root) throw new Error('Missing application root');

render(<App pack={parkour} />, root);

const developingLocally = ['localhost', '127.0.0.1'].includes(location.hostname);

const checkForUpdate = (registration: ServiceWorkerRegistration) => {
  if (!navigator.onLine) return;
  void registration.update().catch(error => console.error('Could not check for an update.', error));
};

const installProductionServiceWorker = () => {
  let reloadedForNewController = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForNewController) return;
    reloadedForNewController = true;
    location.reload();
  });

  void navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
    .then(registration => {
      checkForUpdate(registration);
      window.addEventListener('online', () => checkForUpdate(registration));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate(registration);
      });
    })
    .catch(error => console.error('Offline installation failed.', error));
};

if ('serviceWorker' in navigator && developingLocally)
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .then(() => caches.keys())
      .then(names => Promise.all(names
        .filter(name => name.startsWith('parkour-') || name.startsWith('skill-queue-'))
        .map(name => caches.delete(name))))
      .catch(error => console.error('Could not clear local preview caches.', error));
  });
else if ('serviceWorker' in navigator)
  window.addEventListener('load', installProductionServiceWorker);
