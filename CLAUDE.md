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
| Rendering | No server rendering of game data. Server components render the shell only; all state arrives on the game stream | eng §2.1, §3.1 |
| Hosting | Amplify Hosting for the web tier; CDK for table, indexes, the stream Lambda, scheduler, IAM | eng §8 |
| Region | eu-central-1 | eng §2 |
| Store | DynamoDB, one item per player, price cached in its own item | eng §2 |
| Resolution | Pure `resolveGuess()` against the price at the deadline (last Coinbase trade at or before `createdAt + 60 s`, settled only once a later trade is on the tape), two triggers (the stream's state read every second, scheduled sweep), stale-price guard at 15 s | eng §3, §3.1, §3.2 |
| Streaming | One Server-Sent Events stream per tab, from a Lambda Function URL in `RESPONSE_STREAM` mode (Amplify buffers responses and cuts them at 30 s), opened with a 60 s signed ticket from `GET /api/stream-token`. Everything the screen shows arrives on it; `POST /api/guess` is the one call the player makes. About nine players at once (Lambda concurrency 10), accepted as a known limitation | eng §3.1, §11 |
| Identity | Anonymous `httpOnly` cookie first; Google sign-in via Auth.js as an upgrade, merging the anonymous record once | eng §6.1, §6.2, §6.5 |
| Public identity | Server-generated `AdjectiveAnimal` name. No country, no flags | eng §6.3, product §6.6 |
| Leaderboard | Global only, top 3 plus your own row, signed-in players only, served from a sparse GSI | eng §6.4, product §6.7 |
| UI | Astryx (`@astryxdesign/core`, React 19 + StyleX) with a Dracula token set | eng §7.1 |
| Charts | Hand-built SVG, no charting library | eng §7.1 |
| Coinbase | Called only from the server: ticker (1 s shared cache), trades (settlement), candles (10 s shared cache). The browser never calls Coinbase | eng §5 |

## Still open

- **Remix / React Router 7 instead of Next** was considered and parked. Next is the working decision; do not reopen without being asked.
- **The flip condition:** if Google sign-in leaves scope, the leaderboard goes with it and the framework choice is worth revisiting (a Vite SPA plus one Lambda). See eng §2.1.

## Day one, before any feature code

In this order, because each one can invalidate work done after it:

1. **StyleX compiling**, with a real Astryx component on screen and atomic CSS emitted. Start from Astryx's own Next.js StyleX example rather than a blank project. Next needs `@stylexjs/babel-plugin` and `@stylexjs/postcss-plugin` with the `next/babel` preset.
2. **An infrastructure hello-world deployed** - Amplify Hosting serving the app, and the Amplify compute role reaching a DynamoDB table. Not at the end; AWS is the least familiar part of this stack.
3. ~~Coinbase endpoints checked for CORS~~ - **done**, and since moot: the browser no longer calls Coinbase (eng §5).

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

- **Every test gates the deploy.** `amplify.yml` runs `npm test` (type-check of app, e2e and infra; app tests; the store against DynamoDB Local; infra) and `npm run test:a11y` (axe, against the build it is about to ship) inside the Amplify build; a failure fails the build and nothing deploys. Both need Java, and no test calls anything outside the build: the a11y run uses a fake Coinbase (`E2E_COINBASE_URL`, test-only, like `E2E_PRICE_FEED_DOWN`) and the fonts are in the repository (`src/app/fonts`, `next/font/local`). What a cold build downloads is pinned: Corretto by version and sha256 in `amplify.yml`, DynamoDB Local by sha256 in `scripts/dynamodb-local.mjs` (AWS publishes only "latest", so a new AWS release fails the download until the hash is updated). Keep them passing locally before pushing.
- **Formatting: tabs and single quotes**, enforced by Prettier (`.prettierrc`). Run `npm run format` before committing; `npm run format:check` must pass.
- **Braces on every `if`, `else` and loop body**, on their own lines - never `if (x) return y;`. Enforced by ESLint's `curly: all`.
- **Every non-empty object literal broken over lines**, never `{ ask: false }` on one line: the braces and each property get their own lines, arguments and test expectations included. Enforced by `@stylistic/object-curly-newline` (`minProperties: 1`); Prettier keeps an expanded object expanded, so the two agree.
- ESLint (`eslint.config.mjs`) holds only these two layout rules; `npm run lint` must pass, and `npm run lint -- --fix` then `npm run format` applies them.
- **TypeScript throughout.** Types are defined once and imported by both halves; request bodies are validated at the boundary with Zod and the inferred types are what the client uses.
- **Pure functions where the logic lives.** `resolveGuess`, the name generator and the request scheduler are pure and fully unit-tested without infrastructure. Anything that can be pure should be.
- **Route handlers on the Node runtime**, not the edge - they need the AWS SDK and the hosting role's credentials.
- **Every write that must happen once is a DynamoDB conditional write.** Guess creation is conditioned on `attribute_not_exists(pendingGuess)`; resolution is conditioned on the pending guess id. Never a read-then-write.
- **Counters move in the same write as the score.** Never recomputed from `history`, which is trimmed to 10 entries.
- **Accessibility is not a later pass**, and it is tested: `npm run test:a11y` runs axe-core (WCAG and best-practice rules) over the screen's states in a real browser, colour contrast included, across desktop, 390 px and 320 px, plus structure tests for what axe cannot see: the banner and `h1`, a heading per panel, what the one live region says in each state, keyboard order and focus, and the chart tooltip's contrast (axe skips it, being `aria-hidden`); and the screen with Coinbase down (`e2e/outage.spec.ts`, through the test-only `E2E_PRICE_FEED_DOWN` switch in `src/lib/deps.ts`). axe cannot judge text on a gradient, so the hero buttons' ink is not covered. Results announced through one `aria-live="polite"` region, no meaning carried by colour alone, confetti skipped under `prefers-reduced-motion`.
- **Copy comes from product spec §7.** It is written as full sentences because it is also what a screen reader announces. Do not paraphrase it.

## What is already here

- `src/lib/resolve-guess.ts` - the resolution rule, exactly as specified, with its tests
- `src/lib/names.ts` - the generated-name function, with its tests
- `docs/` - both specs, the screen designs, the user-flow diagram

These modules are the parts the specs single out as testable without any infrastructure. They are deliberately framework-free: scaffolding must **merge around them**, not overwrite them.

The backend cycle (build order item 1, server half) is built on top of them:

- `src/lib/game.ts` - `getState` (lazy resolution), `placeGuess`, `sweep`, and the one resolution path they share
- `src/lib/scoring.ts` - what a resolution does to score, counters, streaks and history; pure
- `src/lib/price.ts` - the Coinbase Exchange ticker fetch (the same market as the chart), the shared price cache, the 15 s stale guard
- `src/lib/settlement.ts` - the price that settles a guess: the market at its deadline, read from Coinbase's trade history (`settleAgainstTape` pure, `fetchTape` paging trades with a candle fallback), so the timing of a request cannot choose an outcome
- `src/lib/store.ts`, `dynamo-store.ts` - the storage interface and its DynamoDB implementation, every once-only write conditional
- `src/lib/testing/memory-store.ts` - the same conditional semantics in memory, so races are testable
- `src/lib/coinbase.ts` - where the Coinbase Exchange BTC-USD endpoints are (`coinbaseUrl`); `E2E_COINBASE_URL` points them at a fake in the a11y tests
- `src/lib/identity.ts` - the anonymous identity cookie (`btc_player`): the bare uuid in an `httpOnly` cookie, the `anon:` prefix added on the server
- `src/lib/spoken.ts` - what a screen reader hears where the screen shows a symbol ("plus 1", "minus 1", "42 points")
- `src/lib/contracts.ts` - request schemas (Zod, strict) and response types, shared with the client
- `src/app/api/{player,stream-token,snapshot,guess,cron/resolve}/route.ts` - thin adapters over `game.ts` (`snapshot` is one stream tick, polled when the stream cannot be opened)
- `src/app/actions.ts` - sign-in and sign-out as server actions, plain forms that work before hydration

The game stream (eng §3.1): `src/stream/game-stream.ts` (`runGameStream`, host-independent) is run by `src/stream/lambda.ts` (the CDK stack's `GameStream` Function URL, bundled from `src/`) in production and by `src/app/api/stream/route.ts` locally (`LOCAL_STREAM=1`, set by `dev:local` and the e2e servers). `src/lib/stream-token.ts` signs the ticket with the secret in SSM `/btc-guess/stream-secret`, also set as `STREAM_SECRET` on Amplify with `STREAM_URL`.

The sweep is scheduled from `infra/`: EventBridge Scheduler invokes `infra/lambda/sweep-trigger`, which POSTs to `/api/cron/resolve` with the secret from SSM (`/btc-guess/cron-secret`). The Amplify app's env vars are set and copied into `.env.production` by `amplify.yml`.

The screen (build order item 1, client half, first-visit state):

- `src/themes/dracula.theme.ts` - the Dracula token set, the only theme file in the repository. `dracula.{css,js,d.ts,variants.d.ts}` beside it are **generated and git-ignored**: `npm run theme` (`astryx theme build`) writes them before every `dev`, `dev:local` and `build`. Node >= 22.13 is needed for that, so the project pins Node 24 in `.nvmrc`, and `amplify.yml` runs `nvm install` from it
- `src/components/ui/` - the design language as atoms (`Panel`, `Pill`, `DirectionButton`, `Numeric`, ...), built on Astryx primitives and tokens; `tokens.stylex.ts` holds what the theme has no slot for
- `src/components/game/` - the screen. `GameScreen` composes it; the rest is foldered, each folder with an `index.ts` of named exports that other folders import through:
  - `widgets/` - the screen's self-contained blocks: `TopBar`, `PriceCard`, `GuessButtons`, `GuessStrip`, `LeaderboardPanel`, `HistoryPanel`
  - `charts/` - `HourChart`, `MinuteChart` and the `chart-parts` they share (inside `PriceCard`)
  - `feedback/` - `Announcer` (the one `aria-live` region) and `Confetti`
  - `hooks/` - `useStream` (the game stream: ticket, `EventSource`, reconnect with a fresh ticket, closed while hidden), `useGame` (the stream's state, placing guesses), `useLiveMinute` (points from the streamed price), `useFocusRescue` (focus to the guess strip when a re-render removes the focused control)
  - `utils/` - formatting
  - Every component keeps its StyleX in a sibling `Name.styles.ts`
- `src/lib/candles.ts` - the last-hour chart as pure functions (parse Coinbase's candles, the hour's change, SVG geometry); `HourChart` draws it; the server fetches it into a shared cache (`src/lib/hour-candles.ts`, 10 s) and the stream pushes it

- `src/lib/guess-phase.ts` - which state the guess strip is in (first visit, idle, locked, time up, stale, result) and the result sentence, as pure functions; the buttons, the strip and the `aria-live` announcer all render from it
- `useGame` places guesses (`POST /api/guess`) and shows an accepted guess at once, until the stream's next state knows it

- `src/lib/live-minute.ts` - the live minute (eng §5.1) as pure functions: one sample per price, ahead/behind, the minute chart's geometry; `useLiveMinute` takes its points from the game price the stream sends each second
- During a guess the hour view carries the locked-in line and the shaded minute, and the price card has a "Last hour / This guess" toggle that follows the guess

- `src/lib/stats.ts` - the success rate and the streak wording ("2 wins in a row", "streak ended at 2"), from the counters; the streak a loss broke is stored as `previousStreak` in the same settle write, never derived from the trimmed history

- `src/lib/confetti.ts` + `Confetti` - confetti on a win only, laid out by a pure function over an injected random source; aria-hidden, and never generated under `prefers-reduced-motion`

- `src/lib/axis.ts` - the charts' price axis: gridlines at round prices, labelled in a shared right-hand gutter (`Y_AXIS_GUTTER` in `charts/chart-parts.tsx`), or inside the plot below a 480px chart width (`gutterOf`, beside it), hidden from assistive technology since the summary and inspector already give the prices
- `src/lib/chart-inspect.ts` + `Inspector` - reading the charts tick by tick: hover shows a crosshair and tooltip, and a transparent slider over the plot gives the keyboard and screen readers the same readings (`utils/readout.ts` writes them)

- `src/lib/leaderboard.ts` - the board: podium from the sparse `byScore` index (cached 10 s), the caller's rank by a COUNT query (equal scores share a rank), the total from a counter item; sent on the stream; no ids or real names in any response. Only players with the `board` attribute are on it, and nothing writes that attribute until sign-in - so the board is empty until then

- `src/auth.ts` - Google sign-in via Auth.js (scope `openid`, JWT session carrying only `google:<sub>`); its `signIn` callback runs `signIn` in `src/lib/game.ts`, the one-time anonymous merge: one transaction that writes the account onto the board, deletes the anonymous item if unchanged, and increments `BOARD#GLOBAL`. Signed-in players have no TTL. Route handlers read identity through `playerIdFrom` (session first, then the anonymous cookie); without `AUTH_SECRET` sign-in is off. `src/lib/sign-in.ts` holds what the screen says afterwards

## Regenerating the diagrams

`docs/flows/*.mmd` is the source; the `.png` beside it is derived and committed so the specs can embed it. **They are edited together, never separately** - a `.mmd` changed without re-rendering leaves the picture in the product spec contradicting the text, which is how a reviewer finds an inconsistency before you do.

```
npx -y @mermaid-js/mermaid-cli \
  -i docs/flows/00-user-flow.mmd \
  -o docs/flows/00-user-flow.png \
  -c docs/flows/mermaid-theme.json -s 2 -b transparent
```

`mermaid-theme.json` is committed so the styling is reproducible rather than living in someone's shell history. The renderer needs a headless Chromium; if it cannot find one, set `PUPPETEER_EXECUTABLE_PATH` rather than changing the theme or the scale.

The product spec embeds `flows/00-user-flow.png`, so a regenerated diagram means rebuilding the spec PDF too, if one is being kept.

## Deliverables the brief asks for

- A public git repository
- A deployed, reachable link
- A README covering the design, how to run it, and how to deploy it
- Tests are encouraged - and here they are part of the argument, since fairness is the thing being demonstrated

## Definition of done

Engineering spec §10. The short version: no client-supplied price or timestamp can affect an outcome and this is visible in the network tab; guess creation and resolution are each idempotent under concurrent calls; a guess abandoned by a closed browser still resolves; a market history that cannot be read blocks resolution and says so, and a stale price blocks new guesses; sign-in rejects malformed, expired and wrongly-audienced tokens and forged callbacks (`src/auth.test.ts`); the leaderboard and the sweep are both served from indexes rather than scans.
