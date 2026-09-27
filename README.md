# BTC Guess

Guess whether BTC/USD will be higher or lower one minute from now. Right +1, wrong −1, one guess at a time.

A take-home exercise for epilot. No game logic yet - this repository holds the design, the pieces of logic that could be written before any framework existed, and the day-one scaffold: StyleX compiling with a real Astryx component on screen.

## Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | Context for an agent picking this up: decisions made, decisions open, build order, conventions |
| `docs/product-spec.md` | What is being built and why - rules, screens, states, copy, acceptance criteria |
| `docs/engineering-spec.md` | How it is built - architecture, data model, API, resolution, identity, operations, tests |
| `docs/screens/` | The six screen designs, as rendered |
| `docs/flows/` | The user-flow diagram, with its Mermaid source |
| `src/lib/` | The pure logic: the resolution rule, the name generator, the request cadence - each with tests |
| `src/app/` | The Next.js App Router shell: layout, providers (Astryx theme + Link), and the day-one checkpoint page |
| `infra/` | CDK stack: table, indexes, IAM policy for the Amplify SSR role. Scheduler comes later, once `/api/cron/resolve` exists |

## The one-paragraph version

The server is the only source of truth about game state. The browser sends who it is and what it guesses, and nothing else it says counts - no prices, no timestamps. A guess resolves when a minute has passed *and* the price has changed, decided by a pure function against the server's own cached price. There is no WebSocket to our backend: the browser knows when to ask, because it owns the countdown and already watches the ticker for the chart. A scheduled sweep catches whatever a closed browser left behind.

## Running it

The app - day-one scaffold only, no game logic yet:

```
npm install
npm run dev    # http://localhost:3000 - the checkpoint page: an Astryx card, two buttons, a badge
npm test       # vitest against src/lib - the pure logic modules
npm run build  # next build; also proves StyleX/Astryx atomic CSS compiles for production
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
