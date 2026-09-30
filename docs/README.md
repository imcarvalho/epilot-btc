# Docs

Written and reviewed before any code. Both are the source of truth; `CLAUDE.md` at the repository root is the index into them.

- **`product-spec.md`** - what is being built and why. Rules (§2), scope (§3), user flow (§4), the six screens (§5), the reasoning behind each state (§6), copy (§7), acceptance criteria (§8), build order (§9).
- **`engineering-spec.md`** - how it is built. The principle (§1), architecture and why Next.js (§2), resolution and its two triggers (§3), concurrency (§4), price data (§5), identity and leaderboard (§6), frontend (§7), operations (§8), test plan (§9), definition of done (§10), risks (§11).

`screens/` holds the seven designs at 2880×2240 and `screens/small/` the 1440×1120 versions the product spec embeds. `flows/` holds the user-flow diagram and its Mermaid source.

The designs also exist as a live canvas in Claude, where the artboards can be edited and re-rendered. The PNGs here are exports of it, and the canvas holds two further layouts explored and set aside.

## If a spec turns out to be wrong

Change it, in the same commit as the code. A spec that disagrees with the running app is worse than no spec, and this exercise leans on both agreeing.
