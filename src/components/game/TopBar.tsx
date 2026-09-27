import * as stylex from "@stylexjs/stylex";
import { Download } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { successRate } from "@/lib/stats";
import { BrandMark, PlayerChip, ScoreChip, SourceBadge } from "@/components/ui";
import { styles } from "./TopBar.styles";

export function TopBar({
  player,
  isLive,
  source,
}: {
  /** Null while the first state read is in flight. */
  player: { name: string; score: number; wins: number; losses: number } | null;
  isLive: boolean;
  source: "candles" | "ticker";
}) {
  return (
    <header {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.group)}>
        <BrandMark />
        <span {...stylex.props(styles.title)}>BTC Guess</span>
        <SourceBadge isLive={isLive} source={source} />
      </div>
      <div {...stylex.props(styles.group, styles.end)}>
        {player ? (
          <>
            <ScoreChip
              score={player.score}
              wins={player.wins}
              losses={player.losses}
              rate={successRate(player)}
            />
            <PlayerChip name={player.name} />
          </>
        ) : (
          <Skeleton width={320} height={48} />
        )}
        {/* Google sign-in is build-order item 5; the control is here for the layout. */}
        <Button
          label="Sign in to save your score"
          size="lg"
          variant="secondary"
          icon={<Icon icon={Download} size="sm" color="accent" />}
        />
      </div>
    </header>
  );
}
