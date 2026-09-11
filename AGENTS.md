# Miami Beach PWA template

This is the canonical infrastructure template for small standalone browser applications.

Use Bun, TypeScript, and Preact. Do not introduce Node.js, npm, npx, Vite, Tailwind, Shadcn, Vinext, or OpenAI Sites plumbing. Deploy static output through Cloudflare Workers Static Assets with `run_worker_first: false`.

Preserve the offline contract in `README.md`. Give every derived application its own identity, icons, Cloudflare project name, and service-worker cache prefix.

Design from the domain outward. Keep reusable data structures and domain models pure, concise, and independent of Preact, browser storage, service workers, and Cloudflare. Keep effects at the edges. Optimize for the human reader.
