import * as stylex from "@stylexjs/stylex";
import { Download } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { BrandMark, PlayerChip, ScoreChip, SourceBadge } from "@/components/ui";

export function TopBar({
  player,
  isLive,
  source,
}: {
  /** Null while the first state read is in flight. */
  player: { name: string; score: number } | null;
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
            <ScoreChip score={player.score} />
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

const styles = stylex.create({
  bar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
    justifyContent: "space-between",
  },
  group: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
  },
  end: {
    gap: "var(--spacing-3)",
  },
  title: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-semibold)",
    marginInlineEnd: "var(--spacing-2)",
  },
});
