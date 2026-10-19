# Parkour Practice

An offline-first Parkour practice queue and skill map, intended for `parkour.miamibeachlabs.com`.

Parkour Practice combines three distinct ideas without collapsing them into one opaque score:

- the skill graph says what is available now;
- completed training sessions reveal what is getting stale; and
- the queue explains what deserves attention today.

It is not a duration tracker or a claim to measure mastery. An open session holds the skills you choose to work on today, each Medium by default. Only **Finish session** turns those choices into completed practice history. You explicitly mark a skill as learning or acquired; acquired skills remain in the queue when they need maintenance.

Completed sessions are visible as grouped history, so it is always clear which skills were recorded together and at what intensity. You can remove an individual mistaken session, or use the confirmed **Erase all local progress** action to return this browser to its initial state.

## Commands

```sh
bun install
bun run content
bun run dev
bun test
bun run check
bun run build
```

The build emits static browser files in `dist/`. `wrangler.jsonc` serves them through Cloudflare Workers Static Assets with no Worker script and `run_worker_first: false`.

## Model

`src/domain/SkillGraph.ts` contains the reusable graph vocabulary: skills, categories, default-route `requires` edges, soft `helps` edges, open sessions, completed sessions, and a user profile. Completed sessions own the historical facts; finishing one establishes evidence for that skill when calculating the learner's frontier, without automatically calling it Acquired.

`src/domain/PracticeQueue.ts` derives the practice queue, category freshness, learning frontier, and locked skills. It is pure TypeScript: no Preact, storage, or Parkour knowledge. Requirements guide the frontier until the learner establishes a different baseline through completed practice. Freshness measures completed training sessions since a skill or category was last practiced, with the recorded intensity carrying a different reserve: light practice becomes stale after two missed sessions, medium after four, and intensive after six. Importance, practice debt, category neglect, learning state, and the number of unlocked skills provide small, visible ranking influences.

`content/parkour/pack.yaml` is the canonical editable catalogue. It owns the category order, descriptions, human-readable importance (`foundational`, `useful`, or `optional`), tutorial links, and the distinction between a core Parkour skill and a supporting movement. Supporting movements may record their origin and multiple functions without taking over the Parkour learning frontier. `content/parkour/progression.yaml` is the separately editable graph: each key is a target skill and each relationship uses only stable skill IDs. `requires` is deliberately conservative: it gates direct recommendation only when it represents a useful default route. `supports` makes soft, non-blocking transfer visible instead.

`bun run content` compiles those files into an ignored TypeScript module for the browser. It rejects duplicate IDs, missing category or skill references, duplicate/conflicting relationships, self-relations, and cycles in `requires`. The YAML is the only authored source; the generated module is a disposable build artifact.

`src/infrastructure/LocalProfile.ts` is the browser-storage boundary. The profile lives only in the current browser and origin. Its previous local Skill Queue key migrates automatically on the next local visit; a deployment at `parkour.miamibeachlabs.com` naturally begins with its own browser-local profile. Clearing site data removes it; there is no account, sync service, or server.

The core is intentionally app-local for now. If several training products need genuinely separate applications later, the two `src/domain/` modules can move into a small shared library without changing their public model or bringing browser/UI code along.

## Offline use

The first online visit downloads the complete app. Later launches use the locally cached shell immediately and remain usable in airplane mode. A newer build downloads completely before it replaces the existing cache. Practice data remains in browser storage through updates.
