# Skill Queue

An offline-first personal practice queue. Parkour is its first skill pack.

Skill Queue combines three distinct ideas without collapsing them into one opaque score:

- the skill graph says what is available now;
- completed training sessions reveal what is getting stale; and
- the queue explains what deserves attention today.

It is not a duration tracker or a claim to measure mastery. An open session holds the skills you choose to work on today, each Medium by default. Only **Finish session** turns those choices into completed practice history. You explicitly mark a skill as learning or acquired; acquired skills remain in the queue when they need maintenance.

## Commands

```sh
bun install
bun run dev
bun test
bun run check
bun run build
```

The build emits static browser files in `dist/`. `wrangler.jsonc` serves them through Cloudflare Workers Static Assets with no Worker script and `run_worker_first: false`.

## Model

`src/domain/SkillGraph.ts` contains the reusable graph vocabulary: skills, categories, hard `requires` edges, soft `helps` edges, open sessions, completed sessions, and a user profile. Completed sessions own the historical facts; the queue derives individual practice events from their entries when calculating freshness.

`src/domain/PracticeQueue.ts` derives the practice queue, category freshness, learning frontier, and locked skills. It is pure TypeScript: no Preact, storage, or Parkour knowledge. Hard requirements only decide availability. Importance, individual practice debt, category neglect, learning state, and the number of unlocked skills provide small, visible ranking influences.

`src/content/parkour.ts` is the editable Parkour pack. It owns the category order, descriptions, importance, tutorial links, and graph relationships. The video-derived progression is deliberately conservative: an edge is hard only when it should gate direct recommendation; helpful preparation remains visible without blocking practice.

`src/infrastructure/LocalProfile.ts` is the browser-storage boundary. The profile lives only in the current browser and origin. Clearing site data removes it; there is no account, sync service, or server.

The core is intentionally app-local for now. If several domain packs need genuinely separate applications later, the two `src/domain/` modules can move into a small shared library without changing their public model or bringing browser/UI code along.

## Offline use

The first online visit downloads the complete app. Later launches use the locally cached shell immediately and remain usable in airplane mode. A newer build downloads completely before it replaces the existing cache. Practice data remains in browser storage through updates.
