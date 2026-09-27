# BTC Guess

Guess whether BTC/USD will be higher or lower one minute from now. Right +1, wrong −1, one guess at a time.

A take-home exercise for epilot. Not yet built — this repository currently holds the design and the pieces of logic that could be written before any framework existed.

## Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | Context for an agent picking this up: decisions made, decisions open, build order, conventions |
| `docs/product-spec.md` | What is being built and why — rules, screens, states, copy, acceptance criteria |
| `docs/engineering-spec.md` | How it is built — architecture, data model, API, resolution, identity, operations, tests |
| `docs/screens/` | The six screen designs, as rendered |
| `docs/flows/` | The user-flow diagram, with its Mermaid source |
| `src/lib/` | The pure logic: the resolution rule, the name generator, the request cadence — each with tests |
| `infra/` | CDK stack: table, indexes, scheduler, IAM (to be written) |

## The one-paragraph version

The server is the only source of truth about game state. The browser sends who it is and what it guesses, and nothing else it says counts — no prices, no timestamps. A guess resolves when a minute has passed *and* the price has changed, decided by a pure function against the server's own cached price. There is no WebSocket to our backend: the browser knows when to ask, because it owns the countdown and already watches the ticker for the chart. A scheduled sweep catches whatever a closed browser left behind.

## Running it

Nothing to run yet. `CLAUDE.md` has the day-one checklist — the three things to verify before writing feature code.
