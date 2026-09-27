import type { NextRequest } from "next/server";
import { getDeps } from "@/lib/deps";
import { getState } from "@/lib/game";
import { error, json, playerIdFrom } from "../respond";

/**
 * The player's whole game state, and the normal resolution path (engineering
 * spec §3): a pending guess that the server's own price can settle is settled
 * here, before responding. The client decides when to ask (§3.1); it never
 * decides the answer.
 */
export async function GET(request: NextRequest) {
  const playerId = playerIdFrom(request);
  if (!playerId) return error("no-player", 401);

  const state = await getState(getDeps(), playerId);
  if (!state) return error("no-player", 401);

  return json(state);
}
