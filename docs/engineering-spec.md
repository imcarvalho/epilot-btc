# Engineering spec - BTC up/down guessing game

**Author:** Inês Carvalho · **Date:** 27 Sep 2026

**Companion document:** `product-spec.md`, which covers what is being built and why.

---

## 1. The principle everything hangs off

**The server is the only source of truth about game state.** The browser sends two things: **who it is** (an identifier, so the score persists) and **what it guesses** (`up` or `down`). Nothing else it says counts. Which price was in effect, at what time, whether 60 seconds have passed, whether the price moved, and how many points exist are all decided server-side.

The distinction matters: the identifier is a claim about identity, not about the game. Even a forged one only lets someone play as another player - it cannot change prices, times or scores. Client-supplied prices and timestamps are ignored, and they do not exist in the API contracts in the first place.

That is the whole answer to the brief's one explicit requirement: guesses "resolved fairly".

---

## 2. Architecture

**One Next.js application, front and back.** The App Router serves the UI; route handlers under `app/api/*` are the backend. There is no separate API service, and client and server share one set of TypeScript types - a guess shape defined once is the shape the UI renders and the handler validates.

```
Browser (React 19, Astryx design system)
  |  GET /api/stream-token, then the game stream (Server-Sent Events):
  |    state every second (score, stats, price, pending guess, serverNow), the hour of candles, the board
  |  POST /api/guess { direction }  (the direction, and nothing else: the one call the player makes)
  v
Amplify Hosting: Next.js (App Router, Node runtime)
  |-- app/               UI shell (server) + the game itself (client components)
  |-- app/api/*/route.ts player, stream-token, guess, auth, cron
  |-- lib/               resolveGuess, settlement, price adapter, DynamoDB access, name generator
Lambda Function URL (RESPONSE_STREAM): the game stream, bundled from the same lib/
        |-- DynamoDB: Players (PK playerId) + PRICE#BTCUSD and CANDLES#BTCUSD cache items
        |-- Coinbase API (called only from the server: ticker, trades, candles)
EventBridge Scheduler (1 min) -> Lambda -> POST /api/cron/resolve (shared-secret header)
                                           -> resolves guesses left by closed browsers
Hosting: AWS Amplify Hosting (Next SSR) and one streaming Lambda. Data, stream and schedule: AWS CDK. Region: eu-central-1.
```

### 2.1 Why Next.js

Everything decided so far - a screen fed by one server stream (3.1), a live minute drawn from it (5.1), a chart that is explicitly provisional - describes a **client-side game with a small stateful API**. On architecture alone the answer would be a static bundle on S3 and CloudFront with one Lambda behind it, and nothing in the game would be worse for it.

Next.js is chosen anyway, for two reasons that have nothing to do with rendering.

**The deliverable that can actually fail is the deployment.** The brief asks for a working public link. It is the one part that cannot be recovered afterwards, and it sits in the least familiar territory. Amplify Hosting runs Next natively: connect the repository, push, get a URL. The static-bundle alternative means S3, CloudFront, an origin access control, SPA rewrites for client-side routes and a cache invalidation on every deploy - each a small thing, each with an edge, all of them in the way of the link that has to exist.

**Auth.js takes the riskiest feature off the critical path.** Google sign-in is the one piece of section 6 that can absorb a whole day: the OAuth dance, token verification, session cookies. With the Next adapter it is configuration. Anywhere else it is `@auth/core` wired by hand, or verifying the ID token directly - doable, and section 9 already specifies those tests, but not where the budget should go.

Two lesser reasons, real but not decisive: one type system across UI and API, so the guess shape is defined once; and route handlers that test as plain functions, with no API Gateway event shapes to mock.

**The discipline that makes this defensible:** none of Next's server rendering is used for game data. Every piece of state arrives on the game stream (3.1), and the one thing the player sends is a `POST` to a route handler. Server components render the shell - layout, header, static copy - and stop there. Next is doing three jobs here, and none of them is rendering strategy: it serves a shell, hosts a handful of route handlers, and runs Auth.js. That sentence belongs in the README, because it turns "this is overkill" from an accusation into a decision with its scope drawn.

**What it costs, said plainly**

- **An SSR runtime that is barely used**, deployed, warmed and watched for pages that are not personalised until the data arrives.
- **Cold starts** show up in the first interaction after a quiet period: the ticket route and the stream Lambda each start cold once. Worth a README note rather than a workaround.
- **Two deployment artefacts, not one.** Amplify owns the web tier; CDK owns the data tier, the stream and the scheduler. They meet at two points: the Amplify SSR compute role needs an IAM policy for the table, and the two tiers share the stream's signing secret.
- **Amplify cannot stream.** Its compute buffers a whole response and cuts it at 30 s (measured, 3.1), so the one long-lived response, the game stream, runs as its own Lambda.
- **Vercel is deliberately not chosen**, simplest though it would be, because the brief's stack is AWS.

**What would flip this:** if Google sign-in leaves scope, the last reason for Next goes with it and the answer becomes a Vite SPA with one Lambda behind it. Worth remembering if time gets short - it is a reduction in scope, not a rewrite, because no game state depends on server rendering.

**Verify on day one, before writing real code**

- **StyleX compiling**, with a real Astryx component on screen and the atomic CSS emitted - starting from Astryx's own Next.js StyleX example rather than from a blank project. Next needs two plugins, `@stylexjs/babel-plugin` and `@stylexjs/postcss-plugin` with the `next/babel` preset, which is more setup than Vite's single unplugin, but it is documented and supported on the App Router with both Webpack and Turbopack. Half an hour here saves a Sunday.
- **The Amplify compute role reaching DynamoDB.** A connection point to resolve first, not to discover halfway.
- ~~Coinbase CORS from the browser~~ - **settled, and since moot**: the browser no longer calls Coinbase at all (section 5).

### Data model

```
Players
  PK playerId            "anon:<uuid>" or "google:<sub>"
     publicName          "AudaciousRaccoon", generated at creation
     board               "GLOBAL" when eligible for the leaderboard, else absent
     score               number      (may be negative)
     pendingGuess        { id, direction, priceAtGuess, createdAt } | absent
     pendingAt           createdAt of the pending guess, else absent
     pendingBucket       "PENDING" while a guess is pending, else absent (3.2)
     wins, losses        numbers, incremented at resolution
     currentStreak       signed number (+3 = three wins, -2 = two losses)
     previousStreak      currentStreak just before the latest result, so a
                         loss can read "streak ended at 2" (product spec 6.4)
     bestStreak          number
     history             last 10 resolved guesses
                         { id, direction, priceAtGuess, priceAtResolve,
                           createdAt, resolvedAt, delta }
     createdAt, updatedAt
     ttl                 anonymous players only: 30 days, refreshed on every
                         write (8). Signed-in players are counted on the
                         board, so they never expire
```

One item per player; gameplay access is always by `playerId`. Three more items share the table, each under a fixed key: the price cache (`PRICE#BTCUSD`, 5), the count of players on the board (`BOARD#GLOBAL`, 6.4) and the cached podium (`BOARD#PODIUM`, 6.4). None of them expires: their freshness is judged by `updatedAt`, since DynamoDB's TTL deletes lazily, hours late, and deleting the price would only lose the last-known value the game falls back on. Two sparse indexes hang off the table: one for the leaderboard (6.4) and one for the sweep (3.2).

```mermaid
flowchart LR
    subgraph table["Players table · partition key playerId · on-demand · TTL on ttl"]
        direction TB
        subgraph players["One item per player"]
            direction LR
            anon["<b>anon:&lt;uuid&gt;</b><br/>anonymous player<br/>ttl 30 days, refreshed on write"]
            google["<b>google:&lt;sub&gt;</b><br/>signed-in player<br/>board = GLOBAL · no ttl"]
        end
        subgraph shared["Fixed keys, never expire"]
            direction LR
            price["<b>PRICE#BTCUSD</b><br/>price, updatedAt<br/>the game price, cached 5 s"]
            total["<b>BOARD#GLOBAL</b><br/>total<br/>players on the board"]
            podium["<b>BOARD#PODIUM</b><br/>entries, updatedAt<br/>top three, cached 10 s"]
        end
    end

    subgraph byScore["byScore · sparse on board"]
        scoreKeys["PK board · SK score<br/>projects publicName, wins, losses"]
    end

    subgraph byPending["byPending · sparse on pendingBucket"]
        pendingKeys["PK pendingBucket · SK pendingAt<br/>projects everything"]
    end

    anon -. "first sign-in: promoted,<br/>then deleted, in one transaction" .-> google
    google -. "same transaction: ADD 1" .-> total
    google -- "always" --> scoreKeys
    anon -- "guess pending" --> pendingKeys
    google -- "guess pending" --> pendingKeys

    scoreKeys --> leaderboard(["leaderboard event on the stream<br/>top 3: Limit 3, descending<br/>your rank: COUNT of score &gt; yours"])
    pendingKeys --> sweep(["POST /api/cron/resolve<br/>pendingAt ≤ price time - 60 s"])
```

Every arrow into an index is an attribute written or removed by the same conditional write that changes the game: starting a guess sets `pendingBucket` and `pendingAt`, settling it removes them, and the sign-in transaction is the only write that sets `board`. Neither index is ever scanned.

### API

Route handlers, all under `app/api`:

| Method | Route | Input | Output |
|---|---|---|---|
| POST | `/api/player` | - | sets the anonymous identity cookie (first visit) |
| GET/POST | `/api/auth/[...nextauth]` | - | Auth.js: Google sign-in, session, sign-out |
| GET | `/api/stream-token` | session or anonymous cookie | `{ url, token, signIn }`: where the game stream is and a 60 s ticket to open it; 401 with no player, 503 if the stream is not configured |
| GET | `<stream url>?token=` | the ticket | the game stream (3.1): `state` every second, `candles`, `leaderboard`, `gone`. Served by the Lambda; locally by `/api/stream` |
| POST | `/api/guess` | `{ direction }`, strictly: any other field is a 400 | `{ pendingGuess, serverNow }`; 409 if one already exists; 503 if the price is stale |
| POST | `/api/cron/resolve` | shared-secret header | sweeps pending guesses; called by EventBridge Scheduler, not by browsers |

The stream's state read resolves the pending guess when the conditions are met, before sending it. It is the normal resolution path and costs nothing extra.

`POST /api/guess` refuses a guess outright while the price is stale: locking in at an old number would be as unfair as resolving against one. The body schema is strict, so a request that carries a price or a timestamp is rejected rather than having the field silently ignored - the fairness rule shows up in the contract as well as in the handler.

Every handler runs on the Node runtime, not the edge: they use the AWS SDK and need the hosting role's credentials. Request bodies are validated at the boundary with Zod, and the inferred types are what the client imports - the contract cannot drift between the two halves, because there is only one definition of it.

---

## 3. Resolution

### The pure function

```ts
export function resolveGuess(
  guess: { direction: "up" | "down"; priceAtGuess: number; createdAt: number },
  priceNow: number,
  now: number,
): { resolved: false } | { resolved: true; delta: 1 | -1 } {
  if (now - guess.createdAt < 60_000) return { resolved: false };
  if (priceNow === guess.priceAtGuess) return { resolved: false };
  const wentUp = priceNow > guess.priceAtGuess;
  const correct = guess.direction === "up" ? wentUp : !wentUp;
  return { resolved: true, delta: correct ? 1 : -1 };
}
```

No network, no clock, no database. Trivial to test, and the first place a reviewer will look.

### The price at the deadline

**A guess settles against the market as it stood when its minute ran out, not against the price when someone asks.** Settling against "the latest price" would let the timing of a request choose the outcome: once the minute is up, a player who holds off asking could watch the market and ask at a moment that suits them, and the sweep only bounds that wait to a minute. So the price is fixed by the clock, not by whoever triggers:

- The **last trade at or before `createdAt + 60 s`** on Coinbase Exchange's BTC-USD book is the price at the deadline, and settles the guess if it differs from the locked price.
- If it equals the locked price, the guess stays in play (R4), and the **first later trade at a different price** settles it.

The trades are read after the deadline from Coinbase's public trade history (`/products/BTC-USD/trades`, newest first, paged back with `after`), the same book as the ticker, the chart and the live minute (section 5). `settleAgainstTape` in `src/lib/settlement.ts` is the rule over that tape, pure; `resolveGuess` is still the comparison it applies. Every trigger - the player's read, another tab, the sweep - reads the same history and so reaches the same outcome, however late it arrives, and a player can check the settling trade against Coinbase themselves.

The other end of the minute follows the same rule. The locked price is the ticker's last trade read fresh when the guess is placed, and `createdAt` is when that trade stood (section 5, "The locked price") - so the locked price is the last trade at or before `createdAt`, and the deadline is a minute after it on the same tape.

Normal play needs one page of trades: the stream reads state within a second of t+60 s, and a page covers a few minutes. A late sweep pages further back; past five pages, one-minute candles stand in (each minute read as its open and its close), which only happens when recovering from an outage. The deadline is on the server's clock and the trades on Coinbase's; both are NTP-synchronised, and the skew is far below the gaps between price changes that matter.

### Two triggers, one guard

- **Lazy, on the stream's state read:** the normal path while the player is watching, once a second. Free, since the read was happening anyway.
- **Scheduled sweep, every minute:** resolves guesses for players who closed the browser. It covers the brief's optional requirement and is what separates "works in the demo" from "works". How it finds them is 3.2.

Both take the same conditional write, so a guess resolves exactly once even when they collide. How the lazy path reaches the browser is 3.1.

### A stale price resolves nothing

If the trade history cannot be read, no resolution happens and the guess stays pending; the next read, a second later, tries again. On screen this is the delayed-feed state: the cached ticker price older than the freshness threshold (15 s) is what the API reports as delayed, and the screen stops offering guesses; a guess is refused on its own terms whenever the fresh read it locks in at fails (section 5). Resolving against a guessed-at price would be unfair, and it is an obvious thing for a reviewer to probe.

### 3.1 How the browser learns the outcome: one server stream

The server pushes. Each open tab holds one **Server-Sent Events** stream, and everything the screen shows arrives on it; the browser sends nothing on it. The one call the player makes is `POST /api/guess`. The browser never talks to Coinbase: every price, trade and candle is read server-side (section 5).

| Event | When | What |
|---|---|---|
| `state` | Every second | The player's state as `getState` reads it: score, stats, the game price and its age, the pending guess, the last result, `serverNow`. Reading it settles a guess that is due, so a result reaches the screen within a second of its deadline |
| `candles` | On connect, then whenever the shared hour is refreshed (every 10 s) | The last hour of one-minute candles; `null` once if there is none (Coinbase down, nothing cached) |
| `leaderboard` | On connect, then whenever a result lands or the player signs in | The board as 6.4 describes it |
| `gone` | Once, then the stream ends | The player no longer exists (expired or deleted): the browser creates one and reconnects |

**Where it runs.** Amplify Hosting cannot serve it: measured on a deployed branch, its compute buffers a whole response and cuts it at 30 s with a 500, so not one event arrives. The stream is a **Lambda Function URL in `RESPONSE_STREAM` mode**, defined in the CDK stack and bundled from the app's own `src/lib/`, so the stream and the routes share one implementation of the game. Measured: first byte in 0.2 s, one event a second, worst gap 1.1 s, and a clean end at its 14-minute lifetime (the Function URL's limit is 15). `runGameStream` (`src/stream/game-stream.ts`) is host-independent; a Next route at `/api/stream` runs it for local development and the e2e tests, switched on only by `LOCAL_STREAM=1`.

**Identity across domains.** The stream's domain gets none of this site's cookies, and `EventSource` cannot set a header. So the page first asks `GET /api/stream-token`, which reads identity as every route does and returns a ticket: the player id and an expiry 60 s out, signed with HMAC-SHA256 under a secret the two tiers share (SSM `/btc-guess/stream-secret`, read by the Lambda at cold start). The ticket travels in the stream's URL, which is why it is short-lived. The same route reports, once, what a sign-in just did (6.2), since the stream cannot read the cookie that says so.

**Reconnecting.** Every end of an `EventSource` looks like an error, the planned end included, and its own retry would reuse an expired ticket. So the client closes it and reconnects with a fresh ticket, backing off from a second to half a minute while it keeps failing; after three failures with nothing on screen it says the game is unreachable and offers "Try again".

Four properties worth stating:

- **The server decides, and nobody's timing decides anything.** The browser only listens. A guess settles against the trade at its deadline (section 3), whenever the read that settles it happens.
- **Hidden tabs hold no stream.** The client closes the stream on `document.visibilityState === "hidden"` and reopens it, with a fresh ticket, when the tab is shown. This also frees one of the few streams the account can run at once (section 11).
- **Coinbase load does not grow with players.** Every stream reads the shared caches: the price at most once a second and the hour every ten seconds, whoever triggers the refresh.
- **The sweep is still required.** The stream serves the player who is watching; the scheduled sweep serves the one who closed the tab and comes back tomorrow. They are not alternatives.

**What it costs.** One Lambda held open per visible tab, for up to 14 minutes at a time, and one DynamoDB read a second per tab. Fine for a demo; the concurrency limit it runs into is in section 11.

### 3.2 How the sweep finds work

The sweep needs the one access pattern the main table cannot serve: not "this player", but "every player with a guess outstanding". A scan would answer it and is ruled out for the same reason it is ruled out for the leaderboard (6.4) - it reads the whole table every minute, and gets slower as the game grows.

**A third sparse index, `byPending`:** partition key `pendingBucket`, a `board`-style constant (`"PENDING"`), sort key `pendingAt`. Both attributes are written in the same conditional write that creates a guess and removed in the one that resolves it, so an item is in this index for exactly as long as it has something outstanding - typically seconds.

The sparseness is the whole mechanism, and it is the same trick as the leaderboard's: the index holds the working set rather than the table. A sweep is one query for items with `pendingAt` at least 60 seconds ago, one read of the trade history back to the oldest of their deadlines, then the ordinary conditional resolution write for each - at most 100 per run, with the next run taking the rest. In the steady state it returns nothing and costs one read, and calls Coinbase not at all.

It also bounds the failure mode. If the scheduler stops, work accumulates visibly in a place that can be queried and counted, rather than sitting invisible across the table.

**How the schedule reaches the route.** EventBridge Scheduler cannot call an HTTPS endpoint, so it invokes a small Lambda that makes the one `POST` with the secret header, and decides nothing itself. The alternative, an EventBridge rule targeting an API destination, needs no code but is billed per call; Scheduler and Lambda both stay inside the free tier at one call a minute. The secret lives in SSM Parameter Store as a SecureString (section 8), read by the function at cold start, so it never appears in a template or in the function's configuration. No retries: a missed run is covered by the next one, and the sweep is idempotent regardless.

---

## 4. Concurrency and idempotency

- **Creating a guess:** `UpdateItem` with `ConditionExpression: attribute_not_exists(pendingGuess)`. A double click, a second tab or a network retry fails with `ConditionalCheckFailedException`, which the API returns as 409. This, not the disabled button, is what enforces rule R3.
- **Resolving:** `UpdateItem` conditioned on the pending guess still having the same `id`, in one write that moves `score`, `wins`/`losses`, `currentStreak`, `bestStreak` and prepends to `history`. The loser of a race changes nothing.
- **Counters are never recomputed from history.** They move in the same write as the score, so they cannot drift when the history list is trimmed to its last 10 entries. A full audit trail would be its own table keyed by `playerId` and resolution time - a README note, not work for today.

---

## 5. Price data

| Use | Source | Why |
|---|---|---|
| **Locked price** (placing a guess) | Server, read fresh from the ticker for that request | Fairness; a cached price could be one the player has already seen the market leave |
| **Game price** (on screen, and the live minute) | Server, shared cache, pushed on the stream | From the client it would be forgeable; the cache keeps it to one Coinbase call a second |
| **Settlement price** (resolution) | Server, trade history at the deadline (3) | Fixed by the clock, so the timing of a request cannot choose it |
| **Chart** (the last hour) | Server, shared cache, pushed on the stream | Cosmetic; one Coinbase call per ten seconds for everyone, and no dependency on Coinbase's CORS policy |

Public Coinbase Exchange endpoints, unauthenticated, needing neither an account nor a key:

- Ticker (the game price, server-side): `https://api.exchange.coinbase.com/products/BTC-USD/ticker`
- Trades (the settlement price, server-side): `https://api.exchange.coinbase.com/products/BTC-USD/trades`
- One-minute candles (the chart, server-side): `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60`

**All of it server-side.** The browser calls none of these. The chart and the live minute used to read Coinbase straight from the browser (its CORS is open, checked on day one); they now arrive on the game stream (3.1), so every Coinbase call is the server's, cached and shared, and a change in a third party's CORS policy can no longer break the screen.

**One market for everything.** The game price is the Exchange ticker's last trade, the same book the chart's candles and the settling trades come from. It was first specified as Coinbase's retail spot price (`api.coinbase.com/v2/prices/BTC-USD/spot`), which runs $20-30 away from the Exchange price: the live minute then opened "ahead by $29" before the market had moved at all. Settling on the same market the player watches keeps the provisional line honest; the game is exactly as fair either way, since one source decides every outcome.

**Caching:** the latest price lives in its own DynamoDB item with a timestamp, served for a second, so one Coinbase call a second serves every player's screen and live minute. The last hour of candles lives the same way in `CANDLES#BTCUSD`, served for ten seconds; a failed refresh serves the hour it had. Per-request calls would hit rate limits with two players and an open tab.

**Failed reads are shared too.** Concurrent callers of the game price share one in-flight read, and after a failed read the server does not call Coinbase again for one second (`PRICE_FAILURE_MS`), serving the last known price meanwhile, so an outage does not multiply into one retry loop per request. The cooldown is per process: with several instances each may still make one attempt a second. The guess's own fresh read (below) is exempt, since sharing it could hand back a price older than the request.

**The locked price is never the cached one.** The cached price can be up to a second old, and up to 15 s while Coinbase is failing, and it is the number on the player's screen. Locking a guess at it would let a player who can see the market has already moved (on Coinbase's own site) guess with that knowledge: better than a coin flip. So `placeGuess` reads the ticker for that request (`fetchFreshPrice`), and if the read fails the guess is refused (`price-unavailable`), with no fallback to the cache. The fresh price is still written to the cache, so everyone's screen gets it. Before reading, one read of the player item turns away a player who cannot guess (none, or a guess already pending) without calling Coinbase, so the extra calls are bounded by about one per player per minute; the conditional write still decides R3.

`createdAt` is when the locked price stood, not when the read came back. The ticker's last trade is the price from its trade time until the response, so it held at the trade time if that falls inside the request, and at the start of the request if the trade came before it (a quiet market); a trade time after the response (clock skew) is held to the response (`observedAt`). The locked price is therefore the last trade at or before `createdAt`, the same rule settlement applies at `createdAt + 60 s` (section 3). Reading the lock from the trade history instead would give the same price with a second endpoint and paging; the ticker already names its trade and its time, so it is the simpler of two equivalent reads.

**Failure:** retry with exponential backoff, then serve the last known price with its timestamp (for the screen; a guess is refused instead, above). The game degrades, it does not break. On screen: the last price stays up, marked delayed; once it is past the 15 s guard the guess buttons go quiet and the strip says why, so a guess is refused before it is tried (`priceBlocksGuess`); a game that has never had a price says so rather than showing a loading placeholder forever. The chart fails on its own, with its own note (the stream sends `candles: null`), and recovers when the shared hour next refreshes.

### 5.1 The live minute

While a guess is in play the chart can switch from the hour of candles to the minute itself, drawn live (product spec, 6.1). It is drawn from the game price the stream sends every second (3.1) - no socket of the browser's own, and no Coinbase call from the browser.

- **One point per second.** Each state carries the game price and when it stood; a new observation is a new point, giving sixty points across the minute. A jagged one-second line reads better here than a smooth one.
- **Drawing:** SVG, rebuilt from the points each second. With sixty points that is trivial, and it keeps the approach consistent with the candle view.
- **It cannot affect the outcome, by construction.** The browser only draws these prices: resolution reads the trade history at the deadline, server-side. The UI labels the live delta *provisional*, because the settled price can differ by a few cents.
- **When the stream drops:** the line greys and a note says the live view is paused, until the stream is back.
- **`prefers-reduced-motion`:** no drawing animation and no transitions; the line and the number update in place.
- **Testing:** the sampling and path-building are pure functions over a list of `{t, price}` - a fake feed drives them, and no test needs a stream.

---

## 6. Identity, names and the leaderboard

### 6.1 Anonymous players

On first contact the server issues an opaque `anon:<uuid>` and sets it as an `httpOnly` cookie - JavaScript cannot read it and the browser sends it automatically. `localStorage` would also work, but the cookie keeps section 1 literally true: the client never handles the identifier, so there is nothing for it to tamper with and nothing for the API contract to carry.

Limitations, to be stated in the README: clearing browser data creates a new player; another browser or device is another player; and anyone who learns an id can play as that player. There is also no defence against minting a thousand fresh ids - without authentication there cannot be one.

### 6.2 Google sign-in

| | Anonymous | Signed in |
|---|---|---|
| `playerId` | `anon:<uuid>` issued by the server | `google:<sub>`, Google's stable user id |
| Lives in | An `httpOnly` cookie | A session cookie issued by our backend |
| Survives | That browser only | Any device the player signs in on |

`sub` is the only identifier worth keying on: email addresses change hands, `sub` does not.

This section sets out **what has to be true** for sign-in to be safe. Section 6.5 covers who does it, and the answer there is a library rather than our own code - but the properties below are the ones to check, whoever implements them.

**Google's assertion has to be verified, and that is the entire security boundary.** Whatever the flow, what arrives from Google is an ID token, and an unverified ID token is JSON anyone can forge. It has to be checked against Google's published keys (JWKS, cached): signature, `iss` (`accounts.google.com` or `https://accounts.google.com`), `aud` - our client id, which is what stops a token minted for some other application being replayed at ours - and `exp`. The flow must also bind the response to the request that started it, so a token cannot be replayed from elsewhere; how that binding is spelled - `nonce`, or `state` with PKCE - depends on the flow. The signature check is what protects a token that a browser hands us. In the authorization-code flow the browser hands us no token: our server exchanges a one-time code at Google's token endpoint over TLS, and OpenID Connect Core (3.1.3.7) lets the client rely on that channel instead of the signature. There the boundary is `state`, PKCE, `iss`, `aud` and `exp`.

**Our session is ours, not Google's.** Google's token is verified once and then discarded; from that moment the player carries a cookie our backend issued - `httpOnly`, `Secure`, `SameSite=Lax` - which is the only credential the game reads. Every later request carries it exactly as the anonymous flow carries its id, and the rest of the game cannot tell the two apart. The secret that protects it is never committed, and it lasts a fixed 30 days from sign-in (see 6.5): after that the player signs in again and gets the same record back.

**Nothing else about the Google account enters the game.** Identity reduces to `google:<sub>` at the boundary; the display name and avatar are stored only if the signed-in UI shows them back to the player, and never leave in a leaderboard response.

**Merge on first sign-in.**

- Google player does not exist yet: the anonymous record is promoted - score, counters, history and any pending guess move across, and the anonymous item is deleted.
- Google player already exists: the signed-in record wins, and the UI says so rather than silently discarding the local one. Summing the two would let anyone farm points in incognito windows and merge them in.

The merge is one transactional write conditioned on the source still existing, so a double click cannot merge twice.

**Data protection.** Store `sub`, plus display name and avatar only if the UI shows them. Email is not needed, so the scope is `openid` alone (plus `profile` when the name is shown). Deletion is one `DeleteItem`.

### 6.3 Generated names

Generated server-side when the player item is created, from two curated word lists (adjectives and animals) joined in PascalCase - `AudaciousRaccoon`. Curated, so no combination is unfortunate; with roughly 200 × 200 entries there is plenty of room, and collisions are allowed rather than retried, since `playerId` is the real key and a duplicate name costs nothing. Generation is pure and therefore trivially testable; the name is stored, never recomputed, so it is stable for the player's lifetime.

The Google display name, when there is one, is stored only if the signed-in UI shows it to the player themselves. It never goes into a leaderboard response.

**Country was considered and dropped.** A flag beside each name would have come from the `CloudFront-Viewer-Country` header, which requires controlling the distribution's origin request policy - and with Amplify Hosting the distribution is managed, so that control is not ours to exercise. The alternative, a geo lookup per request, is a dependency and a privacy question for decoration. The board is global only, which also keeps it to one index instead of two.

### 6.4 Leaderboard queries

Ranking needs the opposite access pattern from the rest of the game: not "this player", but "the best players in order". A scan is out - it reads the whole table on every request and gets slower as the game grows.

**One sparse global secondary index:**

| Index | Partition key | Sort key | Query |
|---|---|---|---|
| `byScore` | `board` = `"GLOBAL"` | `score` | the top of the board |

Sparse is doing real work here: `board` is written only for players eligible for the board, which means signed-in players. Anonymous players never carry the attribute and therefore never enter the index - the eligibility rule is enforced by the data model rather than by a filter someone can forget. Promoting an anonymous player at sign-in is what writes them in.

**Projection matters as much as the key.** A board row shows name, score, success rate and number of guesses, so the index projects `publicName`, `score`, `wins` and `losses` - everything a row needs. Without that, each of the three podium rows costs a second read back to the table, which would undo the point of querying an index at all.

Numeric sort keys order negatives correctly, so a player on -6 sorts below one on 0 without any offset trickery.

**Three queries**, which is what the four-row design costs:

1. **The podium:** `Query` on the index, `ScanIndexForward: false`, `Limit: 3`. Cheap and constant.
2. **The player's rank:** `Query` on the same index with `score > :myScore` and `Select: COUNT`. Rank is that count plus one, so players on equal scores share a rank for free - exactly the behaviour the product spec asks for, with no tie-breaking rule to invent.
3. **The total:** a counter item incremented with an atomic `ADD` when a player becomes eligible for the board, so "138th of 1,204" does not require counting anything.

If the player is already in the podium rows, queries 2 and 3 are skipped.

**Known trade-offs, worth naming before they are found:**

- **The rank query is O(players above you).** A `COUNT` query still reads the matching items server-side, so a player near the bottom of a large board is the expensive case - the opposite of the usual intuition. At a few thousand players this is a handful of reads and stays in the free tier. The scale answer is a histogram of score buckets maintained at resolution time, where rank is the sum of the buckets above plus an approximation inside the bucket; that is a README line, not today's work.
- **The rank is read live, not cached.** The board is sent on the game stream when it opens and after each result or sign-in (3.1), not with every state, so there is no burst around a resolution for a cache to absorb. The podium is cached (below); the caller's row is theirs alone.
- **One hot partition.** Every row shares the partition key `GLOBAL`, so writes concentrate. Fine at this volume; at scale the key becomes `GLOBAL#<shard>` with a scatter-gather read.
- **Eventual consistency.** GSIs lag their table by a moment, so a player can see their new score on their own card before it moves on the board. Acceptable for a leaderboard, and worth one sentence in the README rather than a fix.
- **Caching.** The podium is identical for everyone, so it is cached for ten seconds in the same cache-item pattern used for the price. Not at CloudFront: the distribution in front of Amplify Hosting is managed, so cache behaviour there is not ours to configure - the same constraint that dropped the country (6.3). The player's own row is not cached, since it is theirs alone.

### 6.5 Sign-in implementation: Auth.js

With Next.js chosen, sign-in is **Auth.js** (formerly NextAuth) with the Google provider, mounted at `/api/auth/[...nextauth]`. It runs the OAuth redirect flow, binds the response to the request with `state` and PKCE, checks the ID token's `iss`, `aud` and `exp`, and issues its own encrypted session cookie. It does not check the ID token's signature against Google's JWKS: in this flow the token comes from Google's token endpoint over TLS, not from the browser, which is the case OpenID Connect Core allows. `src/auth.test.ts` runs the real handlers against a fake Google to pin what is enforced. Every property 6.2 asks for is one the library provides - correctly, and without sixty lines of ours to review.

What still has to be written, because no library knows about this game:

- **The `jwt` and `session` callbacks** map Google's `sub` onto our `playerId` (`google:<sub>`) and put it in the session, so every handler reads identity the same way regardless of how the player arrived.
- **The `signIn` callback runs the anonymous merge** described above, reading the anonymous cookie and promoting that record once, under the same conditional write.
- **Cookie settings** stay explicit: `httpOnly`, `Secure`, `SameSite=Lax`, with `AUTH_SECRET` never committed: it is an Amplify app environment variable that `amplify.yml` copies into the runtime, alongside `AUTH_URL`, the public origin Auth.js builds its callback from (behind Amplify's proxy the app sees itself as `localhost:3000`).

As built (`src/auth.ts`, `signIn` in `src/lib/game.ts`):

- **Scope `openid` only.** The UI never shows the Google name, so it is not asked for; the JWT carries `playerId` and nothing else from Google. Checks are `pkce` and `state`, JWT sessions (no adapter), a fixed 30 days from sign-in. It does not slide: that would need a proxy on every request to re-issue the cookie, which is not worth the extra moving part for this game.
- **The merge is one `TransactWriteItems`:** put `google:<sub>` with `board` set (condition: does not exist), delete the anonymous item (condition: `updatedAt` and the pending guess unchanged since read - the only writes to an anonymous item start or settle a guess, and both change them), and `ADD 1` to the board counter. A conflict re-reads and retries (five attempts, backing off with jitter): a guess settling mid-merge is carried over rather than lost, a double click merges once, and DynamoDB cancelling the transaction because another sign-in is adding to the same counter (`TransactionConflict`) is retried like any other conflict rather than shown as an error. This is the only place a player joins the board, and the counter moves only then. A signed-in player's record does not expire, so it should not go missing; if it does, `POST /api/player` writes it back without moving the counter (it was counted when it first joined), and the counter is never decremented. A record deleted by hand therefore stays counted, and one that signs in again afresh is counted again: the total is a display figure, not a ledger.
- **Outcomes:** `promoted`, `kept-existing` (the account wins; the anonymous item is left alone, and comes back on sign-out), `returning` (account exists, browser had not played) and `created`. The callback leaves the outcome in a short-lived `httpOnly` cookie; the next `GET /api/stream-token` reports it once as `signIn` and clears it, and the screen says what happened (product §7).
- **Identity is read in one place** (`playerIdFrom`): the session's `google:<sub>` first, the anonymous cookie otherwise. Without `AUTH_SECRET`, sign-in is off and the game runs anonymously.
- **Sign-in and sign-out are server actions** behind plain forms, so they carry Auth.js's CSRF protection and work before hydration.

Two alternatives, named in the README rather than built: **Cognito with Google federated**, the more AWS-native answer that also gives anonymous-to-account promotion out of the box; and **Google Identity Services**, where the browser obtains an ID token and posts it once to an endpoint of ours that verifies it by hand against the JWKS - which is what 6.2 describes when there is no framework to lean on, and the shape this would take in the Vite variant of 2.1. Using a library here is a deliberate choice: the risk in authentication is in the details it already handles, and the time saved goes into the parts of the game that are actually ours.

---

## 7. Frontend technical notes

### 7.1 UI layer: Astryx

The interface is built with [Astryx](https://astryx.atmeta.com/), Meta's open-source design system: over 170 accessible React components, dark mode, themeable tokens, built on React 19 and StyleX, with a CLI and MCP support. Components come from `@astryxdesign/core`.

Why it fits this build:

- **Accessibility and dark mode arrive with the components**, so the half-day goes into the game's own logic rather than into re-implementing a button, a dialog and a focus trap. The things the components cannot know - the `aria-live` announcement of a result, the reduced-motion rule for the confetti, where focus goes when the control holding it disappears - stay ours. The guess buttons are unavailable through `aria-disabled` rather than `disabled`, so a pressed button keeps focus and its hint ("your guess is in play") stays reachable by Tab; when a re-render removes the focused control (the view toggle or slider at a result, a dismissed banner, "Try again"), focus moves to the guess strip, which at the end of a round holds the result.
- **It is a token-based design system**, which is the same shape of problem as the one epilot is working through internally. Using one deliberately, and being able to say where its opinions end and mine begin, is worth more here than hand-rolled CSS.
- **It is built to be read by agents**, with a CLI and an MCP server over its own documentation - which is a genuinely new idea in this space and one I want to use on something real rather than read about. A take-home is a good place to find out whether it changes how the work feels.
- **Examples for both Next.js and Vite**, which is what makes it safe to commit to here: the build integration is a clone away rather than a discovery.

What it pulls in, and must be set up first:

- **React 19+** and **StyleX**, which is compile-time CSS-in-JS - the Next build needs `@stylexjs/babel-plugin` and `@stylexjs/postcss-plugin` wired in before any UI work, not after. Astryx components render in server components; anything interactive (the buttons, the countdown, the chart) is marked `"use client"`.
- **A pinned version**, with the upgrade story as a README line rather than a surprise.
- **The official examples as the starting point.** Astryx ships example applications for both Next.js - including one for the StyleX integration specifically - and Vite. Cloning the Next example and diffing against it is a faster and more reliable day one than wiring the build from the documentation, and it is also the cheapest way to test the Vite fallback in 2.1 if it is ever needed.
- **A Dracula theme.** Astryx themes are token-based, so the palette is a token set rather than overrides: near-black ground (`#17171F`), `#21222C` surfaces as in the rendered screens, and the Dracula accents. It lives in `src/themes/dracula.theme.ts`, extends Neutral, and is compiled with `astryx theme build` so it is present on first paint rather than injected at hydration. What the theme has no slot for - the two hero gradients and the ink on them - is a small StyleX token file of the app's own (`src/components/ui/tokens.stylex.ts`). The two hero buttons carry pastel gradients (mint to cyan for higher, pink to lilac for lower), which is the one place gradient is used. Outcomes never rely on hue alone - each direction has an arrow and a word, and the loss banner uses a pastel coral rather than full `#FF5555`.

**The charts are hand-built SVG, not a charting library.** Sixty candles are four `path` elements - up bodies, down bodies, up wicks, down wicks - and the live minute is one path plus a filled area. A charting library would bring a bundle, a theming layer to fight and defaults to undo, for a picture with one simple tooltip, no zoom and no axes worth configuring. It also means the dashed locked-in line, the shaded minute and the provisional label are ordinary elements rather than plugin points.

**Each tick can be read, by pointer or keyboard.** Hovering either chart shows the nearest tick - a minute's open, high, low and close, or a second's price and how the guess stood - with a crosshair. The same reading is reachable without a mouse: a transparent slider (`role="slider"`, the WAI-ARIA pattern) lies over the plot, so Tab reaches it, the arrows step one tick, Page Up and Down ten, Home and End jump to the ends and Escape hides the tooltip. Its `aria-valuetext` is the tick as a sentence, which a screen reader reads as it moves; the picture keeps its one-sentence summary. A focused slider is read aloud whenever its value changes, so while it has focus it changes only when the player moves it: the tick is held by its time rather than its place in the array (the hour's candles shift along on every refresh, the minute gains a point a second), focus holds the latest tick as it is at that moment rather than following the end, Escape keeps the tick held, and the sentence is taken at the player's own key press, so a minute still forming is read afresh on the next press rather than every ten seconds. Which tick a pointer or key lands on, and where a held time sits after a refresh, are pure functions (`src/lib/chart-inspect.ts`).

**Both charts have a price axis.** Gridlines sit at round prices chosen by a pure function (`src/lib/axis.ts`: steps of 1, 2, 2.5 or 5 times a power of ten, whichever gives the count closest to four), labelled in a fixed 80px gutter on the right - the same on both charts, so the plot does not shift when the view switches, and the time axis below stops where the gutter begins. Labels show whole dollars when the step is whole and cents when it is not ($2.50 steps would otherwise put a rounded price on a line that is not at it). They are hidden from assistive technology: the summary and the inspector already give every price as a sentence, and the axis would only repeat them.

**A charting library was reconsidered for accessibility, and declined again.** The question was whether a library would guarantee accessibility out of the box, and bring an axis with it. None guarantees it. Highcharts has the most complete accessibility module - keyboard navigation between points, screen-reader descriptions, a data-table view - but candlesticks need Highcharts Stock, a paid licence beyond personal use, and about 300 KB to re-theme. ECharts can generate a text description, with thin keyboard support. TradingView's Lightweight Charts draws the best candles, but on a canvas, which a screen reader cannot read at all without rebuilding what is described above beside it. Recharts, Victory and visx leave candles, accessibility or both to the caller. What these charts already have - a one-sentence summary each, every tick reachable by keyboard and read as a sentence, axe clean in every state, rendered contrast included (section 9) - is what those libraries offer at best, and it is tested here; a library would replace it with something to test again rather than a guarantee. It would also cost what hand-built SVG was chosen for: pure, tested geometry, the locked-in line, the shaded minute and the provisional tag as ordinary elements, and a small bundle. The one real gap was the axis, and it was cheaper to add than to change libraries.

### 7.2 Behaviour

- **One Server-Sent Events stream for game state** (3.1), not polling and not a WebSocket: the traffic is one-way, server to browser, which is what SSE is for, and `EventSource` needs no library. The one thing the player sends is a `POST`.
- **The chart view is local state**, defaulting to the hour and switching to the minute when a guess starts; the player can switch back, and the choice is remembered for the session only.
- **Countdown from server time.** Every response carries `serverNow`; the client derives the offset once and counts from there, so a skewed clock cannot show a wrong countdown.
- **Page Visibility API:** close the stream on a hidden tab and reopen it on focus, with a fresh ticket. Frees a stream the account can ill spare (section 11), and the reopened stream's first state resyncs the countdown at once.
- **Multiple tabs reconcile** on every `GET /state`; the server is the truth and a pending guess disables the buttons everywhere.
- **A result settled while away is said once.** A result this page watched pending is the result moment; any other `lastResult` the browser has not shown before is the "while you were away" result (product spec §7). "Shown before" is the last result id the browser has put on screen, kept in `localStorage` - display state only, nothing the server reads, so it has no bearing on fairness. It is read once per page load, so the away result stays up for that visit as a watched one does, and is not new on the next. Without storage, an unwatched result stays in the history and nothing is announced: silence is the better failure than announcing it on every load. A first visit on a new browser (another device after sign-in, cleared storage) says it once. No confetti: the moment was missed, and a burst on opening the page celebrates nothing the player just did.
- **Explicit loading and error states:** first load, offline, 409 on a duplicate guess, delayed feed.
- **Price formatting** with `Intl.NumberFormat` and fixed decimals, so the number does not jump; the delta against the guess price is derived, not stored.
- **Accessibility:** results announced through one `aria-live="polite"` region, confetti `aria-hidden` and skipped under `prefers-reduced-motion`, no meaning carried by colour alone, and every chart tick readable from the keyboard (7.1).

---

## 8. Operations

- **Deployment:** AWS Amplify Hosting builds and runs the Next app, wired to the repository so a push to `main` deploys - but only once every test has passed in the same build: the unit and infra tests, then the accessibility tests (section 9) against the build about to ship, on DynamoDB Local in its own table. A red test fails the build and the last good deployment stays live. The table, its two indexes, the scheduler and the IAM role live in a small CDK stack, and Amplify consumes their names as environment variables. OpenNext with CDK is the alternative if more control is needed - and is what the country flag and CloudFront-level caching would have required (6.3, 6.4) - named in the README as such.
- **Runtime identity:** the app runs under an execution role with least-privilege access to the one table and its indexes. No AWS keys reach the client, and none exist in the repository.
- **Secrets:** `AUTH_SECRET` and the Google client id and secret are Amplify app environment variables, copied into the runtime by `amplify.yml`. The cron shared secret is also in SSM Parameter Store as a SecureString, where the sweep Lambda reads it. None is ever committed.
- **Security:** same-origin by construction, since the API is part of the app - no CORS configuration to get wrong. The cron route rejects anything without the shared secret.
- **Abuse, and what actually bounds it:** the conditional write on `POST /api/guess` already limits a player to one guess until it resolves, which is at most one per minute - a tighter bound than any rate limiter would have set, enforced by the data rather than by a counter. A counter would also need shared state to mean anything, since each runtime instance has its own memory. What that leaves exposed is minting fresh anonymous players and holding streams open; the first is the limitation already stated in 6.1, and the second is bounded, bluntly, by the account's Lambda concurrency (section 11). Named rather than solved.
- **Observability:** structured JSON logs, metrics for price-fetch failures, and CloudWatch alarms, all in the CDK stack. The sweep trigger logs each run with its Lambda request id and throws when the route reports a stale price (`priceStale`), so a stalled sweep counts in the function's `Errors` metric and trips the sweep alarm; the game stream's `price-fetch-failed` and `tape-fetch-failed` lines feed a `PriceFeedFailures` metric filter and a second alarm. The alarms have no notification target yet (who is told, and how, is undecided). Not built: a request id and `playerId` on the web tier's own log lines, alarms on the web tier's log group (Amplify's, outside CDK; a stalled sweep is still caught through the trigger), and a resolved-guesses metric.
- **Retention:** TTL on inactive anonymous player items, 30 days, refreshed on every write. Signed-in players carry no TTL: they are on the board and counted in its total, and an expiry would delete them while the counter still counted them.
- **Cost:** DynamoDB on-demand and Amplify's build and hosting stay inside the free tier at this volume; the SSR runtime is the one line item a static bundle would not have had.

---

## 9. Test plan

- **Resolution:** price up with an `up` guess; price down with an `up` guess; unchanged price; under 60 s; exactly 60 s.
- **The store against a real engine** (`src/lib/dynamo-store.integration.test.ts`, DynamoDB Local, so Java): the mocked-SDK tests say what the store sends, and a mock accepts any expression. Against the engine: the sign-in transaction writes the account, deletes the anonymous record and moves the board total together or not at all (refused when the account exists or the record changed since it was read); the sweep's `byPending` query returns only what is due, oldest first, within its limit, and a settled guess leaves the index; the `byScore` query orders negative scores, leaves anonymous players off and counts strictly above a score; a guess starts once and settles once. The table is made by `scripts/dynamodb-local.mjs`, and `infra/test/local-table.test.mts` fails if its keys and indexes differ from the CDK stack's. The in-memory store keeps the board total as a counter, as the table does, so "counted once" tests can fail on the counter.
- **Route handlers with a mocked SDK**, called as plain functions: a double guess returns 409; resolution is idempotent; a new player starts at 0; counters and streaks move in step with the score, including the sign flip when a winning streak breaks.
- **Coinbase adapter:** contract test against a recorded response, plus the failure paths (timeout, 429).
- **Google sign-in** (`src/auth.test.ts`, the real Auth.js handlers against a fake Google): wrong `aud`, wrong issuer, an expired token and one with no subject are all refused, with no session and nothing written; a callback with a forged `state`, or without the state or PKCE cookie it started with, is refused; a valid token issues a session holding only `google:<sub>`, whatever else Google sent; our own callbacks refuse a non-Google account. The signature is not checked (6.5), so no test claims it. The merge runs once and is refused the second time (`src/lib/game.test.ts`).
- **Names and leaderboard:** generation is pure and draws only on the curated lists; an anonymous player never carries the `board` attribute and signing in adds it; the board orders negative scores correctly; equal scores produce equal ranks and the next rank skips accordingly; a podium player gets no duplicate row; no response ever contains a Google display name.
- **The sweep (3.2):** a pending guess enters the index on creation and leaves it on resolution; a sweep with nothing outstanding returns nothing; a guess left by a closed browser is picked up once, and a sweep racing the stream's state read still resolves it exactly once.
- **Frontend:** buttons disabled (`aria-disabled`, keeping focus) while a guess is pending; focus never falls to the page when its control goes away; the "waiting for price change" notice; the countdown uses server time; no confetti under `prefers-reduced-motion`.
- **The game stream (3.1):** `runGameStream` over the in-memory store and a fake clock: the whole screen on connect; state every second, carrying a price refreshed every second; a result within a second of the guess settling; the board again when a result lands; the hour only when the shared cache refreshes it, and "no hour" said once when there is none; `gone` for a missing player; stopping when the browser leaves. The stream ticket: it names one player, cannot be forged or altered, and expires after a minute.
- **Accessibility:** axe-core runs in a real browser over the screen's states - first visit, the chart inspector reached by keyboard and read by pointer, a guess on the live minute, time up, a win and a loss, a guess settled while away (said once, then idle on the next visit), a guess that did not go through, the game unreachable, a signed-in player - at desktop width, 390 px and 320 px, with no sideways scroll and the one live region's sentence asserted in each; and by keyboard: tab order, the view toggle by arrow keys, focus landing on the game after "Try again" and after dismissing the sign-in notice - against WCAG 2.2 A and AA, colour contrast as rendered included (`npm run test:a11y`, Playwright against a production build and DynamoDB Local, in its own table). The outage is tested too: a second copy of the app with the server's Coinbase fetch switched off (`E2E_PRICE_FEED_DOWN`, test-only), checked with no price ever cached, with a stale one, and with a guess in play when the feed goes quiet - each must say what is happening, pause guessing, and pass axe. The tests never call the live Coinbase: the app reads a fake serving the same response shapes from a made-up market (`E2E_COINBASE_URL`, test-only; `e2e/support/fake-coinbase.mjs`, read by the app's own fetchers in a unit test so it cannot drift), so the deploy gate depends on nothing outside the repository; `E2E_LIVE_COINBASE=1` runs against the real API. axe skips text hidden from assistive technology, which includes the chart tooltip, so the tooltip's contrast is measured directly. axe's best-practice rules run as well (one `h1`, content in landmarks). What no scanner can see is tested directly: the banner landmark holds the `h1` and sits outside `main`, every panel is a region with an `h2`, the countdown is a `timer`, the guess buttons read as one phrase, and a guess that does not go through is announced through the one live region - twice in a row, heard twice. axe cannot judge text on a gradient, so it reports the hero buttons as needing review rather than failing; that one case is not covered automatically.
- **Optional:** one end-to-end run with Playwright and a fake clock.

---

## 10. Definition of done

- [ ] No client-supplied price or timestamp can affect an outcome, verifiable in the network tab.
- [ ] Guess creation and resolution are each idempotent under concurrent calls.
- [ ] A guess left behind by a closed browser resolves within a minute of becoming resolvable.
- [ ] A stale price feed blocks resolution and is reported as such.
- [ ] Sign-in rejects malformed, expired and wrongly-audienced tokens and forged callbacks; the anonymous merge is single-shot.
- [ ] The leaderboard and the sweep are both served from indexes rather than scans, and no response carries a real name or an IP address.
- [ ] Tests pass in CI; README covers the design, how to run it and how to deploy it.
- [ ] Public deployment reachable by link, from a public repository.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| ~~Coinbase CORS blocks browser calls~~ | Checked on day one: open on both hosts. Since moot: the browser no longer calls Coinbase (3.1, 5) |
| Amplify Hosting cannot stream a response | Measured on a deployed branch: buffered, and cut at 30 s. The game stream is a Lambda Function URL in `RESPONSE_STREAM` mode instead (3.1) |
| AWS and CDK are the unfamiliar part | Deploy an infrastructure "hello world" first, before any game code |
| Next.js on AWS is more deployment than a static bundle | Amplify Hosting first, because it runs Next natively; the fallback is OpenNext with CDK, decided on day one rather than the evening before delivery |
| The scheduled sweep depends on an HTTP route being reachable | The shared secret is the only guard, so the route is written and tested before the scheduler exists; if it proves awkward, the sweep moves to a standalone Lambda in the same CDK stack |
| Google OAuth setup drags | Consent screen and client id done before any code; anonymous play alone satisfies the brief, so sign-in can be dropped - but the leaderboard goes with it, since eligibility is being signed in, and 2.1's flip condition on the framework applies too |
| Settlement reads Coinbase's trade history per resolution, from shared AWS IPs, against a public rate limit | Normal play is one request per guess; only the unchanged-price case repeats, once a second per open stream while it waits. If limits bite, the tape is cached per deadline second in the price item's pattern |
| Lambda concurrency: each open tab holds one streaming Lambda for up to 15 minutes, and the account's limit is 10, shared with the sweep | **Accepted as a known limitation: about nine players at once.** The tenth simultaneous tab is throttled until another closes, and the browser retries. A quota increase to the standard 1,000 lifts it; not requested, on purpose, for a demo |
| Scope creep (bot, extra providers, time-windowed boards) | They stay in the README's future-work list |
| Astryx and StyleX change the build | Start from the official Next example, pin the version, and get a component rendering through the pipeline on day one (2.1); falling back to plain CSS modules later would cost a morning |
| Limited time | Build order in the product spec, section 9; everything below the line drops cleanly |
