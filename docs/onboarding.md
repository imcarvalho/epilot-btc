# Onboarding

For someone joining this codebase, and for whoever has to explain it out loud.

The two specs in this folder say what was intended. This file says what is actually here, where to find it, and which parts are subtler than they look. Where the two disagree, the code is what is true.

## What it is, in three sentences

A player guesses whether BTC/USD will be higher or lower one minute from now. Right is +1, wrong is -1, one guess at a time, and the score can go negative.

The hard part is not the game. It is that a player should be able to *check* the result rather than trust it, and that nothing the browser says can change what the result is.

## Read it in this order

Half an hour, in this sequence, and the rest will make sense:

1. **`src/lib/resolve-guess.ts`** - the whole game rule, as a pure function. No network, no clock, no database.
2. **`src/lib/game.ts`** - the server-side cycle. Three operations (`getState`, `placeGuess`, `sweep`) and one resolution path they share.
3. **`src/lib/store.ts`** - what the game needs from storage, as an interface. Read the comments on each method: they say which writes are conditional and why.
4. **`src/app/api/guess/route.ts`** - 43 lines. Every route handler is this thin, on purpose.
5. **`src/stream/game-stream.ts`** - how the screen gets fed.
6. **`infra/lib/btc-guess-stack.ts`** - the table and its two indexes.

Then open the app and place a guess with the network tab open.

## The one idea everything hangs off

**The browser sends two things: who it is, and which direction it picked. Nothing else it says counts.**

Not the price, not the time, not the score. Those fields are not in the request bodies at all, so there is nothing to validate and nothing to forge. Look at `POST /api/guess`: the body is a direction, and that is the entire payload.

Identity is an `httpOnly` cookie holding a bare uuid (`src/lib/identity.ts`). JavaScript cannot read it. The `anon:` prefix is added server-side, so a tampered cookie can never name a `google:` player or the price-cache item. A forged cookie only lets someone play *as* another player; it cannot move a price or a score.

This is the answer to the brief's one explicit requirement, that guesses be "resolved fairly", and it is structural rather than defensive: there is no validation to get wrong because there is no input to validate.

## How one round actually works

**Placing a guess.** `placeGuess` in `src/lib/game.ts` does a cheap read first to fail fast for a player who already has one pending - but that read decides nothing. What enforces "one guess at a time" is the conditional write in `store.startGuess`: it lands only if `pendingGuess` does not exist. A double click, a second tab and a retried request all lose the race and change nothing. The rule lives in the database, not in the disabled button.

**Settling it.** `settleIfDue` reads the price tape and calls `settleAgainstTape`. If the guess resolves, it computes the new scoreboard and calls `store.settleGuess`, which is conditional on `pendingGuess.id` still being the one it resolved. If that write loses - another tab, or the sweep, got there first - it does not report its own answer. It reads the record back and returns theirs. There is exactly one truth and the loser adopts it.

**When it settles.** Three paths, same function:

- a read of state, which the stream does every tick;
- the scheduled sweep, `POST /api/cron/resolve`, for guesses left by a closed browser - it takes `SWEEP_BATCH` (100) at a time from the sparse `byPending` index;
- nothing else.

## The seams

Three shapes repeat, and recognising them makes the rest obvious.

**Dependencies are injected, never imported.** `GameDeps` in `src/lib/game.ts` carries the store, the price feed, the clock and the id generator. `src/lib/deps.ts` builds the real ones; tests replace the module. This is why almost every test runs in milliseconds against a memory store with a fake clock, and why "what happens at exactly 60 seconds" is a unit test rather than a minute of waiting.

**Storage is an interface, not a database.** `GameStore` in `src/lib/store.ts` describes what the game needs. `DynamoStore` implements it; `src/lib/testing/memory-store.ts` also implements it. Nothing above this line knows about DynamoDB.

**Anything that can be pure, is.** `resolveGuess`, `settleAgainstTape`, `guessPhase`, the name generator, the candle maths. The interesting decisions are all in functions with no I/O, which is why they can be tested exhaustively.

**Every write that must happen once is conditional, and its return type says whether it counted.** No read-then-write anywhere.

## Why A and not B

**Next.js, for deployment and auth - not for rendering.** On architecture alone this is a client-side game with a small stateful API, and a static bundle would have served it. Next was chosen because Amplify Hosting runs it natively (the deployed link is the deliverable most likely to fail) and because Auth.js takes Google sign-in off the critical path. No game state passes through server rendering: server components render the shell and stop.

**A server-sent stream, after arguing against one.** The original design had no server push at all: the browser owns the countdown and already watches the Coinbase ticker, so it could work out when to ask. That was reversed for a concrete reason - Amplify Hosting buffers a whole response and cuts it at 30 seconds, so it cannot serve SSE. The stream therefore lives in its own Lambda Function URL in `RESPONSE_STREAM` mode (`src/stream/lambda.ts`), while `src/app/api/stream/route.ts` runs the same `runGameStream` locally for development and the e2e tests. Same code, two hosts.

**Sparse indexes for both access patterns the table cannot serve.** The leaderboard needs "best players in order"; the sweep needs "everyone with a guess outstanding". Both are sparse global secondary indexes: the attribute is written only when it applies, so the index holds the working set rather than the table, and eligibility is enforced by the data rather than by a filter someone can forget. The `byScore` index projects exactly what a podium row renders, so three rows cost one query and no reads back.

**Hand-built SVG charts.** Sixty candles are four `path` elements. A library would have brought a bundle, a theming layer to fight and defaults to undo, for a picture with no tooltips, no zoom and no configurable axes.

**The leaderboard is signed-in only.** Anyone can mint anonymous players in incognito windows, so an open board measures patience rather than guessing. It is also the product's one honest piece of conversion: the whole board is visible with your place on it missing.

## The parts that are subtler than they look

These are the ones worth understanding before explaining anything.

**Settlement is against the price at the deadline, not the price now.** Read `src/lib/settlement.ts`. A guess settles against the market as it stood when its minute ran out, read afterwards from Coinbase Exchange's trade history - never against whatever the price happens to be when somebody asks. This matters: without it, a player could sit on a pending guess, watch the ticker, and refresh at a favourable moment. With it, *when* a request arrives cannot change an outcome. The rule over the trades in time order: the last trade at or before the deadline is the price at the deadline; if that equals the locked price, the guess stays in play (rule R4) and the first later trade at a different price settles it.

**The settle write computes counters from the record read just before it.** That looks like a race and is not. The only write that moves the counters is a settle, and a settle also removes the pending guess - so if the pending id still matches, nothing has touched the counters since that read. The condition is what makes the arithmetic safe. `src/lib/dynamo-store.ts` says this in its header.

**Stream admission has three gates, not one.** The Function URL is public, so a ticket is the only credential - and a ticket alone would open as many streams as its holder liked. So: the ticket is single-use, spent with a conditional write on its `jti`; a player holds at most a few live streams at once (two tabs and a spare, not one); and each stream holds its slot on a lease it must renew. The reason is capacity - each stream holds a Lambda execution for minutes and the account has ten. See `src/stream/admission.ts`.

**When the stream cannot open, the screen polls.** `src/components/game/hooks/useStream.ts` falls back to a state read every two seconds, deliberately well inside the "stream is quiet" threshold so the screen still counts as live. Three failures in a row before an empty screen admits something is wrong.

**Waiting is three different states and the player is never left guessing which.** `src/lib/guess-phase.ts` derives them, purely: counting down; time up but the price has not moved; or the feed is behind and nothing can settle until it catches up. The second is the brief's own rule made visible. The third is ours - a stale price settles nothing.

## Tests

37 unit and integration files beside the code they test, plus three end-to-end suites in `e2e/`: accessibility, screen states, and an outage (`E2E_PRICE_FEED_DOWN` makes every Coinbase call fail so the screen can be seen during one).

```
npm test        # typecheck + unit + the CDK stack's own assertions
npm run test:a11y
npm run test:all
```

The deploy runs them: a failing test fails the build and the live site stays on the last good one.

## With more time or budget

Named honestly, because they are the obvious next questions:

- **Rank is O(players above you).** A `COUNT` query still reads the matching items, so a player near the bottom of a large board is the expensive case. The scale answer is a histogram of score buckets maintained at resolution time.
- **One hot partition.** Every board row shares the partition key `GLOBAL`. At scale that becomes `GLOBAL#<shard>` with a scatter-gather read.
- **No audit trail.** History is trimmed to the last ten. A full one would be its own table keyed by player and resolution time.
- **The stream's capacity is the account's Lambda limit.** Ten concurrent executions is what shaped the admission rules; a real deployment would raise it or move the stream somewhere built for long connections.
- **Country and a per-country board** were dropped: the flag needed control of the CloudFront distribution, which Amplify Hosting manages.
- **Anonymous players can be minted freely.** Without authentication there is no defence, which is exactly why the board requires sign-in.

## Questions you will be asked

If you are using this to prepare rather than to onboard, these are the ones to have an answer for:

- Why does the browser not send the price? *(There is nothing to send: it is not in the contract.)*
- What stops two tabs both placing a guess? *(A conditional write, not the disabled button.)*
- What happens if the sweep and a tab resolve the same guess at once? *(One write lands; the other reads back the winner's answer.)*
- Why settle from trade history instead of the current price? *(So waiting for a better moment cannot change the outcome.)*
- Why is there a stream when the specs argue against one? *(Amplify cuts responses at 30 seconds; the decision was reversed and the specs were updated with it.)*
- Why is the leaderboard sign-in only? *(Incognito windows; and it is the one honest conversion.)*
- What would you change first for production? *(Rank by histogram, shard the partition, raise the stream's concurrency.)*
