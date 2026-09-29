# Decisions, and the ones still open

A short log of the choices that would otherwise be invisible in the code, with the argument compressed to a line or two each. The full reasoning is in the specs.

## Made

**Server-authoritative game state.** The browser sends identity and a direction. Prices and timestamps are not in the API contract at all, so there is nothing to forge. This is the brief's "resolved fairly" requirement, answered structurally rather than by validation.

**A pure resolution function.** `resolveGuess(guess, priceNow, now)` has no network, no clock and no database, so the rule can be tested exhaustively in milliseconds. Both triggers call it with server-supplied values.

**Three resolution triggers, one guard.** The lazy read on `GET /api/state`, the client-side cadence that decides when that read happens, and a scheduled sweep for abandoned guesses. A price older than 15 seconds resolves nothing.

**No WebSocket to our own backend.** The client can predict the moment of resolution - it owns the countdown and already watches the Coinbase ticker for the chart. A persistent connection would exist to deliver one predictable message per minute. The one socket in the app goes straight to Coinbase and is cosmetic.

**Next.js, for deployment and auth - not for rendering.** On architecture alone this is a client-side game with a small stateful API, and a static bundle would serve it. Next is chosen because Amplify Hosting runs it natively (the deployed link is the deliverable most likely to fail) and because Auth.js takes Google sign-in off the critical path. No game state passes through server rendering, which keeps the decision reversible.

**DynamoDB with conditional writes, not read-then-write.** One guess at a time is enforced by `attribute_not_exists(pendingGuess)`, not by a disabled button. Resolution is conditioned on the pending guess id, so the loser of a race changes nothing.

**Chart data straight from the browser.** Coinbase's CORS policy was checked on day one rather than assumed: both hosts return `access-control-allow-origin: *`, verified in the browser from the deployed origin, because `curl` ignores CORS and proves nothing on its own. So there is no proxy route, and the server is spared an invocation per chart load. The fallback - a cached `GET /api/history` - is documented in the README rather than built.

**Sparse indexes for both access patterns the main table cannot serve.** The leaderboard queries players eligible for the board; the sweep queries players with a guess outstanding. In both cases the attribute is written only when it applies, so the index holds the working set and the rule is enforced by the data rather than by a filter.

**Anonymous first, sign-in as an upgrade.** A first-time visitor guesses immediately. Signing in carries the anonymous name and any guess in play over, once, under a conditional write, but not the score: the board counts only what is earned while signed in, because anonymous scores can be farmed with free cookies. Identity is never a gate on playing.

**Generated names as the public identity for everyone.** Nobody is asked to invent a username, and a signed-in player's real Google name never reaches a leaderboard response.

**The leaderboard is signed-in only.** A board open to anonymous players measures how many incognito windows someone opened. It is also the product's one piece of honest conversion: the whole board is visible, with your place on it missing.

## Dropped, with the reason

**Country flags and a per-country board.** The country would have come from `CloudFront-Viewer-Country`, which needs control of the distribution's origin request policy - and Amplify Hosting manages the distribution. A geo lookup per request is a dependency and a privacy question in exchange for decoration.

**IP-based identity.** Shared on a wi-fi, lost on switching to mobile data, and personal data with a retention story attached. A lot of downside for something that does not work.

**A charting library.** Sixty candles are four `path` elements. A library would bring a bundle, a theming layer to fight and defaults to undo, for a picture with no tooltips, no zoom and no axes worth configuring.

**A rate limiter on `POST /api/guess`.** The conditional write already bounds a player to one guess per minute, which is tighter than any limiter would have been, and a counter would need shared state to mean anything.

## Open

**Remix / React Router 7.** Considered against Next and parked rather than rejected. Not to be reopened mid-build.

**The flip condition.** If Google sign-in leaves scope, the leaderboard goes with it and the framework choice is worth revisiting - a Vite SPA with one Lambda. It is a reduction in scope rather than a rewrite, precisely because no game state depends on server rendering.
