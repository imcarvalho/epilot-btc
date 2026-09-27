import * as stylex from "@stylexjs/stylex";
import { Trophy } from "lucide-react";
import { EmptyMessage, Panel, PanelHeader } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";

/** Empty until the leaderboard exists (build order item 6). */
export function LeaderboardPanel() {
  return (
    <Panel aria-labelledby="leaderboard-heading" xstyle={styles.panel}>
      <PanelHeader id="leaderboard-heading" icon={Trophy} iconColor={palette.yellow} title="Leaderboard" />
      <EmptyMessage
        title="No one on the board yet."
        body="Sign in and the first correct guess puts you at the top of it."
      />
    </Panel>
  );
}

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", minHeight: 280 },
});
