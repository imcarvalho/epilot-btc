import * as stylex from "@stylexjs/stylex";
import { History } from "lucide-react";
import { EmptyMessage, Panel, PanelHeader } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";

/** The player's resolved guesses. Rows arrive with the result moments (build order item 2). */
export function HistoryPanel({ resolvedCount }: { resolvedCount: number }) {
  return (
    <Panel aria-labelledby="history-heading" xstyle={styles.panel}>
      <PanelHeader
        id="history-heading"
        icon={History}
        iconColor={palette.cyan}
        title="Your last guesses"
        meta={`${resolvedCount} resolved`}
      />
      <EmptyMessage
        title="No guesses yet."
        body="Each one lands here with both prices, so you can check the result rather than take our word for it."
      />
    </Panel>
  );
}

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", minHeight: 280 },
});
