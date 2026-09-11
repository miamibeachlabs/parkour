# Miami Beach PWA

The canonical starting point for small standalone Miami Beach Labs browser applications. It uses Bun, TypeScript, and Preact and deploys as static files through Cloudflare Workers Static Assets.

## Start a new application

Copy this directory, then replace the template identity in:

1. `package.json`
2. `index.html`
3. `manifest.webmanifest`
4. `wrangler.jsonc`
5. `service-worker.js` and the matching local cache prefix in `src/main.tsx`
6. `src/ui/App.tsx`
7. the three icon files

The cache prefix in `service-worker.js` and `src/main.tsx` must match and be unique to the application. Cache Storage is shared by applications on the same origin.

Keep the surrounding architecture intact unless the application has a concrete reason to differ. Put reusable data structures and pure domain models under `src/data` and `src/domain`; keep Preact, browser storage, service workers, and Cloudflare at the edges.

## Commands

```sh
bun install
bun run dev
bun run check
bun run build
```

The Cloudflare build command is `bun run build`. The deploy command is `bunx wrangler deploy`. Production deployment should follow the repository's chosen branch policy.

Local development does not retain a service worker or application caches. This keeps refreshes honest while iterating and prevents an installed production-style cache from hiding a newly built interface. The service worker also uses network-first behavior on local hosts while an older registration is being retired.

## Offline contract

The first online visit downloads the complete application. Later launches read the installed application from cache immediately and work in airplane mode. Registration checks for a changed service worker when connectivity exists. A build fingerprint changes the worker whenever an application file changes, and a new version activates only after its complete shell has downloaded and existing application windows have closed.

Application data belongs in browser storage and must remain usable without a network connection. Schema changes must migrate existing data without erasing it.

## Theme

`styles.css` defines the shared Miami Beach palette as named properties: ink, muted, sand, surface, line, seafoam, turquoise, ocean, coral, and sun. Extend those semantic tokens instead of scattering unrelated colors through application code.
