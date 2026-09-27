"use client";

import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { EmptyMessage, Panel } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";
import { GuessButtons } from "./GuessButtons";
import { GuessStrip } from "./GuessStrip";
import { HistoryPanel } from "./HistoryPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { PriceCard } from "./PriceCard";
import { TopBar } from "./TopBar";
import { useGameState, useServerNow } from "./useGameState";

/**
 * The one screen (product spec §5), first-visit state. Every value on it
 * comes from `GET /api/state`; nothing is rendered on the server but the
 * shell (engineering spec §2.1). The chart goes into the price card next,
 * and the buttons are wired up with the waiting states.
 */
export function GameScreen() {
  const { status, refresh } = useGameState();
  const ready = status.kind === "ready" ? status : null;
  const now = useServerNow(ready?.clockOffset ?? 0);
  const state = ready?.state ?? null;

  return (
    <div {...stylex.props(styles.page)}>
      <main {...stylex.props(styles.column)}>
        <TopBar
          player={state && { name: state.publicName, score: state.score }}
          isLive={state ? !state.priceStale : true}
        />

        {status.kind === "error" ? (
          <Panel>
            <EmptyMessage
              title="The game could not be reached."
              body="Nothing has been lost: your score is kept on the server. Try again in a moment."
            />
            <div {...stylex.props(styles.retry)}>
              <Button label="Try again" variant="primary" clickAction={refresh} />
            </div>
          </Panel>
        ) : (
          <>
            <PriceCard
              price={state?.price ?? null}
              priceUpdatedAt={state?.priceUpdatedAt ?? null}
              priceStale={state?.priceStale ?? false}
              now={ready ? now : null}
            />
            <GuessButtons isDisabled={state === null || state.pendingGuess !== null} />
            <GuessStrip name={state?.publicName ?? null} />
            <div {...stylex.props(styles.panels)}>
              <LeaderboardPanel />
              <HistoryPanel resolvedCount={state ? state.stats.wins + state.stats.losses : 0} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: "var(--color-background-body)",
    backgroundImage: `radial-gradient(ellipse 60% 40% at 0% 0%, ${palette.pageGlow}, transparent 70%)`,
    minHeight: "100vh",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-5)",
    marginInline: "auto",
    maxWidth: 1440,
    paddingBlock: {
      default: "var(--spacing-8)",
      "@media (max-width: 640px)": "var(--spacing-4)",
    },
    paddingInline: {
      default: "var(--spacing-10)",
      "@media (max-width: 640px)": "var(--spacing-4)",
    },
  },
  panels: {
    display: "grid",
    gap: "var(--spacing-5)",
    gridTemplateColumns: {
      default: "1fr 1fr",
      "@media (max-width: 860px)": "1fr",
    },
  },
  retry: {
    display: "flex",
    justifyContent: "center",
  },
});
