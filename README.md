# BTC Guess

Guess whether BTC/USD will be higher or lower one minute from now. Right +1, wrong -1, one guess at a time.

**Live: https://main.dalnijp0oanzq.amplifyapp.com**

A take-home exercise for epilot. Everything in the build order is in: the fair guess-and-resolve loop, the waiting states and result moments, the last-hour chart, the scoreboard with a generated name, Google sign-in, the leaderboard, the live minute and confetti.

## The design

The question underneath the game is whether a player can trust the result. So **the server is the only source of truth about game state.** The browser sends who it is (an `httpOnly` cookie) and what it guesses (`up` or `down`), and nothing else it says counts: no prices, no timestamps. Those fields do not exist in the API contract, and a request that tries to carry one is a 400, which you can check in the network tab.

A guess resolves when a minute has passed _and_ the price has changed, decided by a pure function (`resolveGuess`) against the market as it stood at the deadline: the last Coinbase trade at or before `createdAt + 60 s`, read server-side from the public trade history (or, if that equals the locked price, the first later trade that moves it). When a request arrives therefore cannot choose the outcome, and anyone can check the settling trade against Coinbase. A delayed feed blocks resolution and the screen says so. Resolution has two triggers that share one path: the game stream's state read, once a second while the page is open, and a scheduled sweep for guesses left behind by closed browsers. Each write that must happen once is a DynamoDB conditional write, so a double click, a second tab and the sweep racing a read all settle a guess exactly once.

The server pushes the game to the browser over **one Server-Sent Events stream per tab**: the player's state every second (which carries the price, and so draws the live minute), the hour of candles, and the board. The browser sends one thing: `POST /api/guess`. It never calls Coinbase; every price, trade and candle is fetched server-side into shared caches, so Coinbase load does not grow with players. Amplify Hosting buffers responses and cuts them at 30 s (measured), so the stream is a Lambda Function URL in `RESPONSE_STREAM` mode, opened with a short-lived signed ticket from `GET /api/stream-token`, since its domain gets none of the site's cookies.

The player can check a result rather than take it on trust. Each history row shows both prices the game used, the locked price is drawn on the chart, and the charts can be read tick by tick with a pointer or the keyboard.

The decisions, briefly:

| Area                     | Decision                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                | Next.js App Router, for deployment risk and Auth.js. No server rendering of game data: server components render the shell, all state arrives by `fetch` to route handlers on the Node runtime        |
| Hosting                  | Amplify Hosting for the web tier, a small CDK stack for the table, indexes, scheduler and IAM. eu-central-1                                                                                           |
| Store                    | DynamoDB, one item per player, the price cached in its own item so one Coinbase call serves every screen                                                                                                  |
| Price                    | Coinbase Exchange ticker, the same market the chart and the live minute read, so the provisional line and the result agree                                                                            |
| Identity                 | Anonymous cookie first; Google sign-in as an upgrade that carries the anonymous player over once, in one transaction                                                                                  |
| Public identity          | A server-generated `AdjectiveAnimal` name for everyone. The Google account never appears publicly; the app asks Google for `openid` only                                                              |
| Leaderboard              | Global, top three plus your own row, signed-in players only, served from a sparse index (a `COUNT` query for your rank, a counter for the total), never a scan                                        |
| UI                       | [Astryx](https://astryx.atmeta.com/) with a Dracula token set, and the app's own atoms on top. Charts are hand-built SVG                                                                               |
| Accessibility            | One `aria-live` region announcing results as full sentences, no meaning carried by colour alone, charts readable from the keyboard, confetti skipped under `prefers-reduced-motion`                  |

The full reasoning is in [`docs/product-spec.md`](docs/product-spec.md) (what and why: rules, screens, states, copy) and [`docs/engineering-spec.md`](docs/engineering-spec.md) (how: architecture, data model, resolution, concurrency, identity, operations, tests). Both were written before the code, and are kept in step with it.

### Trade-offs and limitations

Named here rather than found later:

- **Anonymous identity is a cookie.** Clearing browser data makes a new player, another browser or device is another player, and anyone who learns an id can play as that player. Nothing stops someone minting fresh anonymous players; that is why only signed-in players are on the board.
- **Signing in to an account that already has a score keeps the account's score.** The two are never summed, or anyone could farm points in incognito windows and merge them in. The screen says so, and the anonymous score comes back on sign-out.
- **The leaderboard is eventually consistent.** The index lags the table by a moment, so your own card can show a new score before the board moves.
- **Your rank costs O(players above you).** A `COUNT` query still reads what it counts. Fine at a few thousand players; the scale answer is a histogram of score buckets maintained at resolution time.
- **One hot partition.** Every board row shares one partition key. At scale that becomes `GLOBAL#<shard>` with a scatter-gather read.
- **About nine players at once.** Each open tab holds one streaming Lambda for up to 15 minutes, and this AWS account's Lambda concurrency limit is 10, shared with the sweep. The tenth simultaneous tab is throttled until another closes; its stream fails to open and the browser retries. A quota increase to the standard 1,000 lifts it; it was left as is on purpose for a demo.
- **Cold starts** can show in the first request after a quiet period: the ticket route and the stream Lambda each start cold once.
- **A stream lasts up to 14 minutes**, the Function URL's limit being 15; the browser then reconnects with a fresh ticket, which is invisible on screen but costs a new invocation.
- **The live minute moves once a second**, not per trade: it is drawn from the game price the stream sends, which is cached for a second.
- **Google brand verification was skipped, on purpose.** The OAuth app asks for `openid` only, a non-sensitive scope, so it can be published and used by anyone without verification, and Google shows no unverified-app warning. What verification adds is the app's name and logo on the consent screen, which is why Google shows the `amplifyapp.com` domain there instead. It needs a domain registered to us and a privacy policy page, out of scope for this exercise.
- **Astryx is pre-1.0**, so it is pinned exactly: `@astryxdesign/core`, `theme-neutral` and `cli` at 0.6.3. Upgrading is a deliberate change of all three together. The Dracula theme is compiled from `src/themes/dracula.theme.ts` on every `dev` and `build`, so an upgrade takes effect on the next run; check the screen after one.

### Alternatives considered

- **Cognito with Google federated** instead of Auth.js: the more AWS-native answer, with anonymous-to-account promotion out of the box. **Google Identity Services** with the ID token verified by hand against the JWKS: the shape sign-in would take without a framework.
- **OpenNext with CDK** instead of Amplify Hosting, for control over the CloudFront distribution: what a country flag beside each name or CloudFront-level caching of the podium would have needed.
- **A Vite SPA plus one Lambda** instead of Next: worth revisiting if sign-in, and with it the leaderboard, ever left scope.

### Future work

Sign-in providers beyond Google and self-service account deletion; leaderboards over time windows and a country view; an opponent bot (a scheduled job playing a fixed strategy under a reserved player); other trading pairs; variable stakes or guess windows.

## Where things are

| Path                         | What                                                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/`                      | Both specs, the six screen designs, the user-flow diagram with its Mermaid source, and the setup checklist                                                                                    |
| `src/lib/`                   | The game, framework-free and unit-tested: the resolution rule, scoring, the price cache, the guess cycle and sign-in merge (`game.ts`), the DynamoDB store, the leaderboard, the name generator, the stream ticket, and the pure logic behind every screen state and chart |
| `src/app/api/`               | Thin route handlers over `src/lib`: `player`, `stream-token`, `guess`, `cron/resolve`, Auth.js at `auth/[...nextauth]`, and `stream` (the game stream, local only) |
| `src/stream/`                | The game stream: `runGameStream`, and the Lambda that serves it in production |
| `src/auth.ts`                | Google sign-in via Auth.js; its callback runs the one-time merge                                                                                                                             |
| `src/components/ui/`         | The design language as atoms (`Panel`, `Pill`, `DirectionButton`, ...), on Astryx primitives and tokens                                                                                        |
| `src/components/game/`       | The screen: `GameScreen` composing `widgets/`, `charts/`, `feedback/`, with `hooks/` and `utils/`                                                                                             |
| `src/themes/`                | The Dracula token set, and the theme compiled from it                                                                                                                                        |
| `infra/`                     | CDK stack: table and indexes, the IAM policy for the Amplify compute role, the game stream's Lambda and Function URL, and the once-a-minute sweep (EventBridge Scheduler invoking a small Lambda that calls `/api/cron/resolve`)        |
| `CLAUDE.md`                  | Context for an agent picking this up: decisions made and open, build order, conventions                                                                                                      |

## Running it

```
nvm use           # Node 24, from .nvmrc: the Astryx CLI that builds the theme needs >= 22.13
npm install && npm --prefix infra install
npm run dev:local  # http://localhost:3000 - the whole app, no AWS account needed
npm test           # type-check (app, e2e, infra), the app's unit tests, the store against DynamoDB Local (needs Java), then the infra stack's: no network
npm run build      # next build; also proves the StyleX/Astryx atomic CSS compiles for production
npm run format     # Prettier: tabs and single quotes
npm run lint       # ESLint, two layout rules: braces on every if/else/loop, objects over lines
npm run test:a11y  # axe-core in a real browser over the screen's states (Playwright; needs Java, no network)
npm run test:all   # both of the above
```

`npm run dev:local` needs Java 17+. The first run downloads [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) into `.dynamodb/` (git-ignored); every run starts it, creates the table if missing, and starts `next dev` against it. Local players persist in `.dynamodb/data`; delete that folder to start over. Ctrl-C stops both. Arguments pass through to Next, so `npm run dev:local -- -p 3001` works. Next allows one dev server per project, so stop any other `npm run dev` first.

Sign-in is off locally until `.env.local` has `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`; the game plays anonymously without them.

`dev:local` also serves the game stream from the app itself (`LOCAL_STREAM=1`), since the Lambda is for production. `npm run dev` on its own runs against a real table instead: put `PLAYERS_TABLE_NAME` (the stack's `PlayersTableName` output) in `.env.local`, with `LOCAL_STREAM=1`, any `STREAM_SECRET`, and `STREAM_URL=http://localhost:3000/api/stream`, and the AWS SDK uses your local AWS credentials. Anything played that way lands in the deployed game's table.

The environment:

| Variable                               | What                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAYERS_TABLE_NAME`                   | The stack's `PlayersTableName` output                                                                                                                                                 |
| `PLAYERS_TABLE_REGION`                 | The table's region. Defaults to `eu-central-1`; set explicitly rather than taken from the runtime, which may run elsewhere                                                            |
| `CRON_SECRET`                          | Shared secret the scheduler sends as `x-cron-secret`. Unset, the sweep route rejects everything                                                                                        |
| `DYNAMODB_ENDPOINT`                    | Local development only: point at DynamoDB Local instead of AWS. `dev:local` sets it, with the other three                                                                              |
| `AUTH_SECRET`                          | Encrypts the Auth.js session cookie (`openssl rand -base64 32`). Unset, sign-in is off and the game runs anonymously                                                                   |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | The Google OAuth client. Redirect URI: `<origin>/api/auth/callback/google`                                                                                                             |
| `STREAM_URL`                           | Where the game stream is: the stack's `StreamUrl` output when deployed; `<origin>/api/stream` locally |
| `STREAM_SECRET`                        | Signs the stream tickets. Deployed, the same value as SSM `/btc-guess/stream-secret`, which the stream Lambda reads. Unset, the ticket route says the stream is unavailable |
| `LOCAL_STREAM`                         | Local development and the e2e tests only: `1` serves the game stream from `/api/stream`. `dev:local` sets it |
| `AUTH_URL`                             | Deployed only: the public origin, e.g. `https://main.dalnijp0oanzq.amplifyapp.com`. Behind Amplify's proxy the app sees itself as `localhost:3000`, and Auth.js would build its Google callback from that |

The cycle by hand, with a cookie jar standing in for the browser:

```
curl -c jar -X POST localhost:3000/api/player                  # first visit: sets the httpOnly cookie
curl -b jar localhost:3000/api/stream-token                    # the stream's URL and a 60 s ticket
curl -N "localhost:3000/api/stream?token=$TOKEN"               # the game stream: state every second, the hour, the board
curl -b jar -H 'content-type: application/json' \
     -d '{"direction":"up"}' localhost:3000/api/guess          # 201; again and it is a 409
curl -b jar -H 'content-type: application/json' \
     -d '{"direction":"up","price":1}' localhost:3000/api/guess   # 400: the server takes no price
curl -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/cron/resolve   # the sweep
```

## Tests

Fairness is the thing being demonstrated, so the tests carry the argument. `npm test` runs the app's and the infra stack's without any AWS account (the store's tests need Java, for DynamoDB Local); `npm run test:all` adds the browser accessibility checks:

- **The rules:** no resolution before a minute or on an unchanged price, the price at the deadline settles a guess however late anyone asks (so waiting for a better moment finds nothing), a stale feed blocks it, and correct and wrong move the score by exactly one.
- **Races:** two simultaneous guesses let exactly one through; reads racing each other, and the sweep racing a player's own read, settle a guess exactly once; two sign-ins racing merge once; a guess settling mid-merge is carried over rather than lost. They run over an in-memory store with DynamoDB's conditional semantics, and separate tests check that the real store's expressions encode those same conditions: against a mocked SDK for what is sent, and against DynamoDB Local for what a real engine does with it (the sign-in transaction, the sweep's and the board's index queries, the once-only writes).
- **Sign-in:** the real Auth.js handlers against a fake Google: a token for another client, from another issuer, expired or without a subject is refused with no session and nothing written; so is a callback with a forged state or without its PKCE cookie; a valid one issues a session holding only `google:<sub>`. Auth.js does not check the id token's signature in this flow (the token comes from Google's token endpoint over TLS), so no test claims it.
- **The edge:** a request body carrying a price or a timestamp is a 400; cookies are `httpOnly` and `SameSite=Lax`; no leaderboard response carries a player id.
- **The stream:** what it sends and when, over the in-memory store and a fake clock (the whole screen on connect, state every second, a result within a second of settling, the board after a result, the hour only when it changes), and the ticket (one player, unforgeable, expiring).
- **The screen:** every waiting and result state, the copy it announces, and the chart geometry, as pure functions.
- **Accessibility:** `npm run test:a11y` runs axe-core in a real browser over the screen's states, at desktop width, 390 px and 320 px: first visit, a guess on the live minute, time up, a win and a loss, the game unreachable, a guess that did not go through, a signed-in player, the chart read by pointer and by keyboard - and Coinbase down, with no price ever fetched, with a stale one, and with a guess in play. Each state also checks that nothing scrolls sideways and what the one live region announces, and the keyboard journeys check tab order and that focus never falls to the page. axe skips the chart tooltip (it is hidden from assistive technology), so its contrast is checked directly. It builds the app and runs it against DynamoDB Local in a separate `PlayersE2E` table, so your local players are untouched, and against a fake Coinbase (`e2e/support/fake-coinbase.mjs`) so a blip or a 429 from the live API cannot block a deploy; `E2E_LIVE_COINBASE=1 npm run test:a11y` uses the real one. The first run needs `npx playwright install chromium`.
- **The infra stack:** CDK assertions against the synthesized template (including that the DynamoDB Local table the tests run on has the same keys and indexes), and the sweep Lambda. They live in `infra/`, its own package, and `npm test` runs them after the app's.

## Deploying it

A push to `main` deploys the app: Amplify Hosting builds it with `amplify.yml`, and **only if every test passes** - `npm test` (the app's and the infra stack's), then the accessibility tests against the very build about to be deployed. A failing test fails the build, and the live site stays on the last good one. The infrastructure around it:

```
cd infra
npm install
npm test       # CDK assertions against the synthesized template
npm run synth  # renders CloudFormation, no AWS credentials needed
npm run deploy # needs AWS credentials
```

One-off setup around the stack, because none of it can live in a template:

- Create the Amplify app in eu-central-1, connected to the repository, with an SSR compute role, and attach the stack's `PlayersTableAccessPolicyArn` output to that role.
- Set the environment variables above on the Amplify app. They reach the build but not the SSR runtime, so `amplify.yml` copies exactly these names into `.env.production`, which Next loads at runtime. After changing one, redeploy.
- Put the sweep's shared secret in SSM as a SecureString, with the same value as `CRON_SECRET` on the Amplify app. CloudFormation cannot create a SecureString, and this keeps the value out of every template:

  ```
  aws ssm put-parameter --region eu-central-1 --type SecureString \
    --name /btc-guess/cron-secret --value "$CRON_SECRET"
  ```

- Put the stream's signing secret in SSM the same way, as `/btc-guess/stream-secret`, and set the same value as `STREAM_SECRET` on the Amplify app, with the stack's `StreamUrl` output as `STREAM_URL`:

  ```
  aws ssm put-parameter --region eu-central-1 --type SecureString \
    --name /btc-guess/stream-secret --value "$STREAM_SECRET"
  ```

- Create a Google OAuth client (Web application) with the redirect URIs `http://localhost:3000/api/auth/callback/google` and `<deployed origin>/api/auth/callback/google`. Publish the consent screen rather than leaving it in Testing, or only listed test users can sign in.

`docs/setup-checklist.md` records each of these as it was done for the live app.
