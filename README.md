# BTC Guess

Guess whether BTC/USD will be higher or lower one minute from now. Right +1, wrong -1, one guess at a time.

**Live: https://main.dalnijp0oanzq.amplifyapp.com**

A take-home exercise for epilot. Everything in the build order is in: the fair guess-and-resolve loop, the waiting states and result moments, the last-hour chart, the scoreboard with a generated name, Google sign-in, the leaderboard, the live minute and confetti.

## The design

The question underneath the game is whether a player can trust the result. So **the server is the only source of truth about game state.** The browser sends who it is (an `httpOnly` cookie) and what it guesses (`up` or `down`), and nothing else it says counts: no prices, no timestamps. Those fields do not exist in the API contract, and a request that tries to carry one is a 400, which you can check in the network tab.

A guess resolves when a minute has passed _and_ the price has changed, decided by a pure function (`resolveGuess`) against the server's own cached price, compared at the moment that price was observed rather than when a request arrived. A stale feed (over 15 s) blocks resolution and the screen says so. Resolution has three triggers that share one path: a lazy check on every state read, the browser's cadence, and a scheduled sweep for guesses left behind by closed browsers. Each write that must happen once is a DynamoDB conditional write, so a double click, a second tab and the sweep racing a read all settle a guess exactly once.

There is no WebSocket to our backend. The browser knows when to ask, because it owns the countdown and, during a guess, watches Coinbase's public ticker for the live minute. That socket is cosmetic by construction: its prices never leave the browser, and the line it draws is labelled provisional.

The player can check a result rather than take it on trust. Each history row shows both prices the game used, the locked price is drawn on the chart, and the charts can be read tick by tick with a pointer or the keyboard.

The decisions, briefly:

| Area                     | Decision                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                | Next.js App Router, for deployment risk and Auth.js. No server rendering of game data: server components render the shell, all state arrives by `fetch` to route handlers on the Node runtime        |
| Hosting                  | Amplify Hosting for the web tier, a small CDK stack for the table, indexes, scheduler and IAM. eu-central-1                                                                                           |
| Store                    | DynamoDB, one item per player, the price cached in its own item so one Coinbase call serves everyone                                                                                                  |
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
- **Cold starts** can show in the first request after a quiet period, and the request cadence is deliberately sparse, so quiet periods are normal.
- **The chart fetches Coinbase straight from the browser**, since both endpoints send `access-control-allow-origin: *` (checked from the deployed origin). If that ever changes, the chart moves behind a cached `GET /api/history` using the same cache-item pattern as the price.
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
| `src/lib/`                   | The game, framework-free and unit-tested: the resolution rule, scoring, the price cache, the guess cycle and sign-in merge (`game.ts`), the DynamoDB store, the leaderboard, the name generator, the request cadence, and the pure logic behind every screen state and chart |
| `src/app/api/`               | Thin route handlers over `src/lib`: `player`, `state`, `guess`, `leaderboard`, `cron/resolve`, and Auth.js at `auth/[...nextauth]`                                                            |
| `src/auth.ts`                | Google sign-in via Auth.js; its callback runs the one-time merge                                                                                                                             |
| `src/components/ui/`         | The design language as atoms (`Panel`, `Pill`, `DirectionButton`, ...), on Astryx primitives and tokens                                                                                        |
| `src/components/game/`       | The screen: `GameScreen` composing `widgets/`, `charts/`, `feedback/`, with `hooks/` and `utils/`                                                                                             |
| `src/themes/`                | The Dracula token set, and the theme compiled from it                                                                                                                                        |
| `infra/`                     | CDK stack: table and indexes, the IAM policy for the Amplify compute role, and the once-a-minute sweep (EventBridge Scheduler invoking a small Lambda that calls `/api/cron/resolve`)        |
| `CLAUDE.md`                  | Context for an agent picking this up: decisions made and open, build order, conventions                                                                                                      |

## Running it

```
nvm use           # Node 24, from .nvmrc: the Astryx CLI that builds the theme needs >= 22.13
npm install
npm run dev:local  # http://localhost:3000 - the whole app, no AWS account needed
npm test           # vitest: the rules, the store's conditions, the routes, every screen state
npm run build      # next build; also proves the StyleX/Astryx atomic CSS compiles for production
npm run format     # Prettier: tabs and single quotes
npm run lint       # ESLint, two layout rules: braces on every if/else/loop, objects over lines
npm run test:a11y  # axe-core in a real browser over the screen's states (Playwright; needs Java and the network)
```

`npm run dev:local` needs Java 17+. The first run downloads [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) into `.dynamodb/` (git-ignored); every run starts it, creates the table if missing, and starts `next dev` against it. Local players persist in `.dynamodb/data`; delete that folder to start over. Ctrl-C stops both. Arguments pass through to Next, so `npm run dev:local -- -p 3001` works. Next allows one dev server per project, so stop any other `npm run dev` first.

Sign-in is off locally until `.env.local` has `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`; the game plays anonymously without them.

`npm run dev` on its own runs against a real table instead: put `PLAYERS_TABLE_NAME` (the stack's `PlayersTableName` output) in `.env.local`, and the AWS SDK uses your local AWS credentials. Anything played that way lands in the deployed game's table.

The environment:

| Variable                               | What                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAYERS_TABLE_NAME`                   | The stack's `PlayersTableName` output                                                                                                                                                 |
| `PLAYERS_TABLE_REGION`                 | The table's region. Defaults to `eu-central-1`; set explicitly rather than taken from the runtime, which may run elsewhere                                                            |
| `CRON_SECRET`                          | Shared secret the scheduler sends as `x-cron-secret`. Unset, the sweep route rejects everything                                                                                        |
| `DYNAMODB_ENDPOINT`                    | Local development only: point at DynamoDB Local instead of AWS. `dev:local` sets it, with the other three                                                                              |
| `AUTH_SECRET`                          | Encrypts the Auth.js session cookie (`openssl rand -base64 32`). Unset, sign-in is off and the game runs anonymously                                                                   |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | The Google OAuth client. Redirect URI: `<origin>/api/auth/callback/google`                                                                                                             |
| `AUTH_URL`                             | Deployed only: the public origin, e.g. `https://main.dalnijp0oanzq.amplifyapp.com`. Behind Amplify's proxy the app sees itself as `localhost:3000`, and Auth.js would build its Google callback from that |

The cycle by hand, with a cookie jar standing in for the browser:

```
curl -c jar -X POST localhost:3000/api/player                  # first visit: sets the httpOnly cookie
curl -b jar localhost:3000/api/state                           # score, price, pending guess
curl -b jar -H 'content-type: application/json' \
     -d '{"direction":"up"}' localhost:3000/api/guess          # 201; again and it is a 409
curl -b jar -H 'content-type: application/json' \
     -d '{"direction":"up","price":1}' localhost:3000/api/guess   # 400: the server takes no price
curl -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/cron/resolve   # the sweep
curl localhost:3000/api/leaderboard                            # public; generated names only
```

## Tests

Fairness is the thing being demonstrated, so the tests carry the argument. `npm test` runs them without any infrastructure:

- **The rules:** no resolution before a minute or on an unchanged price, a price observed before the minute was up never settles a guess, a stale feed blocks it, and correct and wrong move the score by exactly one.
- **Races:** two simultaneous guesses let exactly one through; reads racing each other, and the sweep racing a player's own read, settle a guess exactly once; two sign-ins racing merge once; a guess settling mid-merge is carried over rather than lost. They run over an in-memory store with DynamoDB's conditional semantics, and separate tests check that the real store's expressions encode those same conditions.
- **The edge:** a request body carrying a price or a timestamp is a 400; cookies are `httpOnly` and `SameSite=Lax`; no leaderboard response carries a player id.
- **The screen:** every waiting and result state, the copy it announces, and the chart geometry, as pure functions.
- **Accessibility:** colour contrast checked at the source, every text colour against each background it sits on, to WCAG 2.2 AA; and `npm run test:a11y`, which runs axe-core in a real browser over the screen's states: first visit (desktop and phone), the chart inspector by keyboard, a guess on the live minute, a win and a loss. It builds the app and runs it against DynamoDB Local in a separate `PlayersE2E` table, so your local players are untouched; the first run needs `npx playwright install chromium`.

The infra stack has its own: CDK assertions against the synthesized template, and the sweep Lambda (`cd infra && npm test`).

## Deploying it

A push to `main` deploys the app: Amplify Hosting builds it with `amplify.yml`. The infrastructure around it:

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

- Create a Google OAuth client (Web application) with the redirect URIs `http://localhost:3000/api/auth/callback/google` and `<deployed origin>/api/auth/callback/google`. Publish the consent screen rather than leaving it in Testing, or only listed test users can sign in.

`docs/setup-checklist.md` records each of these as it was done for the live app.
