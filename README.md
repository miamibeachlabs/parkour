# Parkour Practice

An offline-first Parkour practice queue and skill map, intended for `parkour.miamibeachlabs.com`.

Parkour Practice combines three distinct ideas without collapsing them into one opaque score:

- the skill graph says what is available now;
- elapsed time since practice reveals what is getting stale; and
- the queue explains what deserves attention today.

It is not a duration tracker or a claim to measure mastery. A movement is **Untried**, **Exploring**, **Practicing**, or **Acquired**: recording a first attempt makes it Exploring; Practicing and Acquired remain your explicit judgment. An open session holds the movements you choose to work on today, each **Light** by default. A session can also contain an ad-hoc combination of two or more movements, such as `Monkey walk → sideways roll`. A combination remains a fact about that workout rather than becoming a new curriculum node, while still recording practice for each component. Only **Finish session** turns those choices into completed practice history.

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

`src/domain/SkillGraph.ts` contains the reusable graph vocabulary: skills, primary browsing categories, movement facets, capability links, environmental use, `requires`, `progresses-to`, and `transfers-to` edges, open sessions, completed sessions, and a user profile. Completed sessions own the historical facts; finishing one establishes an Exploring state and evidence for the learner's frontier, without automatically calling it Practicing or Acquired. Existing `learning` state migrates to Practicing when the profile loads.

`src/domain/PracticeQueue.ts` derives the practice queue, category freshness, learning frontier, and locked skills. It is pure TypeScript: no Preact, storage, or Parkour knowledge. Requirements guide the frontier until the learner establishes a different baseline through completed practice. Freshness measures calendar days since a skill or category was last practiced, so short logged sessions do not accelerate decay. The weekly baseline uses intensity-sensitive attention reserves: light practice is due after three days, medium after seven, and intensive after fourteen. After a reserve, attention pressure grows logarithmically rather than flattening, so seven days overdue remains distinguishable from three weeks overdue. Importance, category neglect, learning state, and the number of unlocked skills provide small, visible ranking influences.

`content/parkour/pack.yaml` is the canonical editable catalogue. It owns category order, descriptions, human-readable importance (`foundational`, `useful`, or `optional`), origin, tutorial links, and whether a movement is **Parkour practice** or **Supporting practice**. The latter makes warm-ups and related movement visible without presenting them as central Parkour curriculum. Every listed item is an ordinary practice skill: its category is one primary browsing home, not its complete classification. `content/parkour/movement-context.yaml` maps those stable skill IDs to non-exclusive facets, shared broad capabilities developed, and environmental features used. It follows the vocabulary in the separate Movement Context notes but imports no code or data at runtime. `content/parkour/progression.yaml` is the separately editable movement graph: `requires` is the deliberately conservative default route used for direct recommendation, `progresses-to` is a soft common learning route, and `transfers-to` is useful carryover.

### Deferred scheduler direction

The current queue intentionally uses transparent, per-movement calendar freshness. A future version may instead treat recommendations as an action-space priority field: capabilities create overlapping practice needs, current goals can make individual movements staples, and recent load can temporarily discourage related actions. That would be a scheduling model—not a claim that skills or capabilities have literally decayed—and must keep `develops` and short-term `loads` as separate mappings. The shared Movement Context blackboard records this as a proposal; it is not implemented here yet.

`bun run content` compiles those files into an ignored TypeScript module for the browser. It rejects duplicate IDs, unknown skill, capability, category, or facet references, duplicate/conflicting relationships, self-relations, and cycles in `requires`. The YAML is the only authored source; the generated module is a disposable build artifact.

`src/infrastructure/LocalProfile.ts` is the browser-storage boundary. The profile lives only in the current browser and origin. Its previous local Skill Queue key migrates automatically on the next local visit; a deployment at `parkour.miamibeachlabs.com` naturally begins with its own browser-local profile. Clearing site data removes it; there is no account, sync service, or server.

The core is intentionally app-local for now. If several training products need genuinely separate applications later, the two `src/domain/` modules can move into a small shared library without changing their public model or bringing browser/UI code along.

## Offline use

The first online visit downloads the complete app. Later launches use the locally cached shell immediately and remain usable in airplane mode. When online, the app checks for a fully cached newer build at launch, when connectivity returns, and when the app becomes visible; it reloads only after that newer build controls the page. Practice data remains in browser storage through updates.
