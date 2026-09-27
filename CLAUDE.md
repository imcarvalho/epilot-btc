# BTC Guess - project context

This file is the entry point for an agent working in this repository. Read it fully before doing anything else.

## What this is

A take-home exercise for a **Senior/Staff Product Engineer (Frontend)** role at **epilot**. A player guesses whether the BTC/USD price will be higher or lower one minute from now. Correct guess +1, wrong −1, one guess at a time.

It is being judged as a product-engineering exercise, not a coding puzzle. Clear decisions, honest trade-offs and a working deployed link matter more than feature count.

## The two specs are the source of truth

Both live in `docs/` and were written and reviewed before any code:

- **`docs/product-spec.md`** - what is being built and why. Rules, scope, user flow, the six screens with screenshots, the reasoning behind each state, copy, acceptance criteria, build order.
- **`docs/engineering-spec.md`** - how it is built. Architecture, data model, API, resolution, concurrency, price data, identity, leaderboard, frontend notes, operations, test plan, definition of done, risks.

**Do not redesign what these settle.** If something seems wrong, say so and ask - do not quietly diverge. If a change is agreed, update the spec in the same change as the code, so the two never drift.

Section numbers are referred to throughout this file; they are stable.

## The principle everything hangs off

**The server is the only source of truth about game state.** The browser sends two things: who it is (an identity cookie) and what it guesses (`up` or `down`). Nothing else it says counts - not prices, not timestamps. Those fields do not exist in the API contracts in the first place.

This is the answer to the brief's one explicit requirement, that guesses be "resolved fairly". Every design choice defers to it. See engineering spec §1.

## Decisions already made

These are settled. The reasoning is in the specs; this is the index.

| Area | Decision | Where |
|---|---|---|
| Framework | Next.js App Router, for deployment risk and Auth.js - **not** for rendering | eng §2.1 |
| Rendering | No server rendering of game data. Server components render the shell only; all state arrives by `fetch` to route handlers | eng §2.1 |
| Hosting | Amplify Hosting for the web tier; CDK for table, indexes, scheduler, IAM | eng §8 |
| Region | eu-central-1 | eng §2 |
| Store | DynamoDB, one item per player, price cached in its own item | eng §2 |
| Resolution | Pure `resolveGuess()`, three triggers (lazy read, client cadence, scheduled sweep), stale-price guard at 15 s | eng §3, §3.1, §3.2 |
| Sockets | None from our backend. One browser-side socket to Coinbase for the live minute, cosmetic only | eng §3.1, §5.1 |
| Identity | Anonymous `httpOnly` cookie first; Google sign-in via Auth.js as an upgrade, merging the anonymous record once | eng §6.1, §6.2, §6.5 |
| Public identity | Server-generated `AdjectiveAnimal` name. No country, no flags | eng §6.3, product §6.6 |
| Leaderboard | Global only, top 3 plus your own row, signed-in players only, served from a sparse GSI | eng §6.4, product §6.7 |
| UI | Astryx (`@astryxdesign/core`, React 19 + StyleX) with a Dracula token set | eng §7.1 |
| Charts | Hand-built SVG, no charting library | eng §7.1 |
| Chart data | Fetched client-side straight from Coinbase - CORS checked and open on both hosts | eng §5 |

## Still open

- **Remix / React Router 7 instead of Next** was considered and parked. Next is the working decision; do not reopen without being asked.
- **The flip condition:** if Google sign-in leaves scope, the leaderboard goes with it and the framework choice is worth revisiting (a Vite SPA plus one Lambda). See eng §2.1.

## Day one, before any feature code

In this order, because each one can invalidate work done after it:

1. **StyleX compiling**, with a real Astryx component on screen and atomic CSS emitted. Start from Astryx's own Next.js StyleX example rather than a blank project. Next needs `@stylexjs/babel-plugin` and `@stylexjs/postcss-plugin` with the `next/babel` preset.
2. **An infrastructure hello-world deployed** - Amplify Hosting serving the app, and the Amplify compute role reaching a DynamoDB table. Not at the end; AWS is the least familiar part of this stack.
3. ~~Coinbase endpoints checked for CORS~~ - **done**: open on both hosts, so chart data is fetched client-side and there is no proxy route to build (eng §5).

## Build order

From product spec §9. Anything below the line drops without reworking what is above it:

1. A fair, working guess-and-resolve loop with a persisted score
2. The waiting states and the result moments
3. The last-hour chart
4. The scoreboard, and the generated name
5. Google sign-in
6. The leaderboard
7. The live minute view
8. Confetti

Note that 5 and 6 are one item in two parts: eligibility for the board is being signed in, so dropping sign-in empties the board.

## Conventions

- **Formatting: tabs and single quotes**, enforced by Prettier (`.prettierrc`). Run `npm run format` before committing; `npm run format:check` must pass.
- **TypeScript throughout.** Types are defined once and imported by both halves; request bodies are validated at the boundary with Zod and the inferred types are what the client uses.
- **Pure functions where the logic lives.** `resolveGuess`, the name generator and the request scheduler are pure and fully unit-tested without infrastructure. Anything that can be pure should be.
- **Route handlers on the Node runtime**, not the edge - they need the AWS SDK and the hosting role's credentials.
- **Every write that must happen once is a DynamoDB conditional write.** Guess creation is conditioned on `attribute_not_exists(pendingGuess)`; resolution is conditioned on the pending guess id. Never a read-then-write.
- **Counters move in the same write as the score.** Never recomputed from `history`, which is trimmed to 10 entries.
- **Accessibility is not a later pass.** Results announced through one `aria-live="polite"` region, no meaning carried by colour alone, confetti skipped under `prefers-reduced-motion`.
- **Copy comes from product spec §7.** It is written as full sentences because it is also what a screen reader announces. Do not paraphrase it.

## What is already here

- `src/lib/resolve-guess.ts` - the resolution rule, exactly as specified, with its tests
- `src/lib/names.ts` - the generated-name function, with its tests
- `src/lib/ask-scheduler.ts` - the request cadence from eng §3.1 as a pure decision function, with its tests
- `docs/` - both specs, the screen designs, the user-flow diagram

These three modules are the parts the specs single out as testable without any infrastructure. They are deliberately framework-free: scaffolding must **merge around them**, not overwrite them.

The backend cycle (build order item 1, server half) is built on top of them:

- `src/lib/game.ts` - `getState` (lazy resolution), `placeGuess`, `sweep`, and the one resolution path they share
- `src/lib/scoring.ts` - what a resolution does to score, counters, streaks and history; pure
- `src/lib/price.ts` - the Coinbase Exchange ticker fetch (the same market as the chart), the shared price cache, the 15 s stale guard
- `src/lib/store.ts`, `dynamo-store.ts` - the storage interface and its DynamoDB implementation, every once-only write conditional
- `src/lib/testing/memory-store.ts` - the same conditional semantics in memory, so races are testable
- `src/lib/contracts.ts` - request schemas (Zod, strict) and response types, shared with the client
- `src/app/api/{player,state,guess,cron/resolve}/route.ts` - thin adapters over `game.ts`

The sweep is scheduled from `infra/`: EventBridge Scheduler invokes `infra/lambda/sweep-trigger`, which POSTs to `/api/cron/resolve` with the secret from SSM (`/btc-guess/cron-secret`). The Amplify app's env vars are set and copied into `.env.production` by `amplify.yml`.

The screen (build order item 1, client half, first-visit state):

- `src/themes/dracula.theme.ts` - the Dracula token set; `dracula.{css,js,d.ts}` beside it are **generated** by `npx astryx theme build src/themes/dracula.theme.ts -o src/themes/dracula.css` (needs Node >= 22.13) - rebuild after editing it or upgrading Astryx
- `src/components/ui/` - the design language as atoms (`Panel`, `Pill`, `DirectionButton`, `Numeric`, ...), built on Astryx primitives and tokens; `tokens.stylex.ts` holds what the theme has no slot for
- `src/components/game/` - the screen. `GameScreen` composes it; the rest is foldered, each folder with an `index.ts` of named exports that other folders import through:
  - `widgets/` - the screen's self-contained blocks: `TopBar`, `PriceCard`, `GuessButtons`, `GuessStrip`, `LeaderboardPanel`, `HistoryPanel`
  - `charts/` - `HourChart`, `MinuteChart` and the `chart-parts` they share (inside `PriceCard`)
  - `feedback/` - `Announcer` (the one `aria-live` region) and `Confetti`
  - `hooks/` - `useGame` (state from `GET /api/state` only, placing guesses, the cadence), `useCandles`, `useLiveMinute`
  - `utils/` - formatting
  - Every component keeps its StyleX in a sibling `Name.styles.ts`
- `src/lib/candles.ts` - the last-hour chart as pure functions (parse Coinbase's candles, the hour's change, SVG geometry); `HourChart` draws it and `useCandles` fetches it from Coinbase in the browser, once a minute while the tab is visible

- `src/lib/guess-phase.ts` - which state the guess strip is in (first visit, idle, locked, time up, stale, result) and the result sentence, as pure functions; the buttons, the strip and the `aria-live` announcer all render from it
- `useGame` places guesses (`POST /api/guess`) and runs the §3.1 cadence through `shouldAsk`; with no browser ticker yet it polls only once the minute is up and nothing has moved

- `src/lib/live-minute.ts` - the live minute (eng §5.1) as pure functions: parsing ticker messages, one sample per second, ahead/behind, the minute chart's geometry; `useLiveMinute` owns the browser's Coinbase WebSocket, open only while a guess is pending, and feeds the cadence so the client asks when the ticker shows a move
- During a guess the hour view carries the locked-in line and the shaded minute, and the price card has a "Last hour / This guess" toggle that follows the guess

- `src/lib/stats.ts` - the success rate and the streak wording ("2 wins in a row", "streak ended at 2"), from the counters; the streak a loss broke is stored as `previousStreak` in the same settle write, never derived from the trimmed history

- `src/lib/confetti.ts` + `Confetti` - confetti on a win only, laid out by a pure function over an injected random source; aria-hidden, and never generated under `prefers-reduced-motion`

- `src/lib/chart-inspect.ts` + `Inspector` - reading the charts tick by tick: hover shows a crosshair and tooltip, and a transparent slider over the plot gives the keyboard and screen readers the same readings (`utils/readout.ts` writes them)

- `src/lib/leaderboard.ts` - the board: podium from the sparse `byScore` index (cached 10 s), the caller's rank by a COUNT query (equal scores share a rank), the total from a counter item; `GET /api/leaderboard`; no ids or real names in any response. Only players with the `board` attribute are on it, and nothing writes that attribute until sign-in - so the board is empty until then

Not built yet: sign-in (which must add a player to the board: write `board`, increment the `BOARD#GLOBAL` counter).

## Scaffolding note

There is no `package.json` yet, deliberately - the versions should be current at the time of the build, and day one starts from the Astryx Next example. When scaffolding:

- Preserve `CLAUDE.md`, `README.md`, `docs/` and `src/lib/` intact.
- If the scaffolder refuses to run in a non-empty directory, scaffold into a temporary directory and merge, rather than deleting anything here.

## Deliverables the brief asks for

- A public git repository
- A deployed, reachable link
- A README covering the design, how to run it, and how to deploy it
- Tests are encouraged - and here they are part of the argument, since fairness is the thing being demonstrated

## Definition of done

Engineering spec §10. The short version: no client-supplied price or timestamp can affect an outcome and this is visible in the network tab; guess creation and resolution are each idempotent under concurrent calls; a guess abandoned by a closed browser still resolves; a stale feed blocks resolution and says so; sign-in rejects malformed, expired and wrongly-audienced tokens; the leaderboard and the sweep are both served from indexes rather than scans.
