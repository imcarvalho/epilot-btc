import type { NextRequest } from "next/server";
import { GuessRequestSchema, type GuessResponse } from "@/lib/contracts";
import { getDeps } from "@/lib/deps";
import { placeGuess } from "@/lib/game";
import { error, json, playerIdFrom } from "../respond";

/**
 * Places a guess. The body is `{ direction }` and nothing else - a body that
 * also carries a price or a timestamp is a 400, not a field quietly ignored.
 * One guess at a time is enforced by a conditional write (§4), so a double
 * click, a second tab or a retry gets a 409 whatever the UI did.
 */
export async function POST(request: NextRequest) {
  const playerId = playerIdFrom(request);
  if (!playerId) return error("no-player", 401);

  const body = GuessRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return error("invalid-request", 400);

  const result = await placeGuess(getDeps(), playerId, body.data.direction);
  switch (result.kind) {
    case "started":
      return json<GuessResponse>({ pendingGuess: result.pendingGuess, serverNow: result.serverNow }, 201);
    case "guess-pending":
      return error("guess-pending", 409);
    case "no-player":
      return error("no-player", 401);
    case "price-unavailable":
      return error("price-unavailable", 503);
  }
}
