# BTC Guess

Guess whether BTC/USD will be higher or lower one minute from now. Right +1, wrong −1, one guess at a time.

A take-home exercise for epilot. The backend guess-and-resolve cycle is built and tested; the game screen is next. Until then the page is the day-one scaffold: StyleX compiling with a real Astryx component on screen.

## Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | Context for an agent picking this up: decisions made, decisions open, build order, conventions |
| `docs/product-spec.md` | What is being built and why - rules, screens, states, copy, acceptance criteria |
| `docs/engineering-spec.md` | How it is built - architecture, data model, API, resolution, identity, operations, tests |
| `docs/screens/` | The six screen designs, as rendered |
| `docs/flows/` | The user-flow diagram, with its Mermaid source |
| `src/lib/` | The game, framework-free: the resolution rule, scoring, the price cache, the guess cycle (`game.ts`), the DynamoDB store, the name generator, the request cadence - each with tests |
| `src/app/api/` | Thin route handlers over `src/lib/game.ts`: `player`, `state`, `guess`, `cron/resolve` |
| `src/app/` | The Next.js App Router shell: layout, providers (Astryx theme + Link), and the day-one checkpoint page |
| `infra/` | CDK stack: table, indexes, IAM policy for the Amplify SSR role. Scheduler comes later, once `/api/cron/resolve` exists |

## The one-paragraph version

The server is the only source of truth about game state. The browser sends who it is and what it guesses, and nothing else it says counts - no prices, no timestamps. A guess resolves when a minute has passed *and* the price has changed, decided by a pure function against the server's own cached price. There is no WebSocket to our backend: the browser knows when to ask, because it owns the countdown and already watches the ticker for the chart. A scheduled sweep catches whatever a closed browser left behind.

## Running it

The app:

```
npm install
npm test       # vitest: the game logic, the DynamoDB store (mocked SDK) and the route handlers
npm run build  # next build; also proves StyleX/Astryx atomic CSS compiles for production
npm run dev    # http://localhost:3000
```

The API needs a table. Its environment:

| Variable | What |
|---|---|
| `PLAYERS_TABLE_NAME` | The stack's `PlayersTableName` output |
| `PLAYERS_TABLE_REGION` | The table's region. Defaults to `eu-central-1`; set explicitly rather than taken from the runtime, which may run elsewhere |
| `CRON_SECRET` | Shared secret the scheduler sends as `x-cron-secret`. Unset, the sweep route rejects everything |
| `DYNAMODB_ENDPOINT` | Local development only: point at [DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html) instead of AWS |

On Amplify these are app environment variables, which reach the build but not the SSR runtime. `amplify.yml` copies exactly these names into `.env.production` during the build, which Next loads at runtime.

The cycle by hand, with a cookie jar standing in for the browser:

```
curl -c jar -X POST localhost:3000/api/player                  # first visit: sets the httpOnly cookie
curl -b jar localhost:3000/api/state                           # score, price, pending guess
curl -b jar -H 'content-type: application/json' \
     -d '{"direction":"up"}' localhost:3000/api/guess          # 201; again and it is a 409
curl -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/cron/resolve   # the sweep
```

The infra stack, on its own:

```
cd infra
npm install
npm test      # CDK assertions against the synthesized template
npm run synth # renders CloudFormation, no AWS credentials needed
npm run deploy # needs AWS credentials
```

`npm run deploy` has not been run yet against a real account. Once it is, the remaining half of the day-one infra check is to attach `PlayersTableAccessPolicyArn` (a stack output) to the Amplify SSR compute role after connecting the repo in Amplify Hosting, then confirm a route handler can actually read/write the table.
