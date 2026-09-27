import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Pill } from "./Pill";

/** Where the numbers come from, and whether the feed is live. */
export function SourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <Pill size="sm">
      <StatusDot
        variant={isLive ? "success" : "warning"}
        label={isLive ? "Live" : "Delayed"}
      />
      <span>Coinbase BTC/USD · 1-minute candles · {isLive ? "live" : "delayed"}</span>
    </Pill>
  );
}
