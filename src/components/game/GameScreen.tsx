"use client";

import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { guessPhase } from "@/lib/guess-phase";
import { EmptyMessage, Panel } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";
import { Announcer } from "./Announcer";
import { GuessButtons } from "./GuessButtons";
import { GuessStrip } from "./GuessStrip";
import { HistoryPanel } from "./HistoryPanel";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { PriceCard } from "./PriceCard";
import { TopBar } from "./TopBar";
import { useGame, useServerNow } from "./useGameState";

/**
 * The one screen (product spec §5). Every value on it comes from the server
 * (`GET /api/state`, `POST /api/guess`); nothing is rendered on the server
 * but the shell (engineering spec §2.1). What the strip and the buttons show
 * is one pure function of that state and the server's clock (`guessPhase`).
 */
export function GameScreen() {
  const { status, refresh, placeGuess, isPlacing, guessError, watchedGuessId } = useGame();
  const ready = status.kind === "ready" ? status : null;
  const now = useServerNow(ready?.clockOffset ?? 0);
  const state = ready?.state ?? null;
  const phase = state ? guessPhase(state, now, watchedGuessId) : null;

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
            <GuessButtons phase={phase} onGuess={placeGuess} isBusy={isPlacing} />
            <GuessStrip phase={phase} name={state?.publicName ?? null} guessError={guessError} now={now} />
            <div {...stylex.props(styles.panels)}>
              <LeaderboardPanel />
              <HistoryPanel
                history={state?.history ?? []}
                pending={state?.pendingGuess ?? null}
                resolvedCount={state ? state.stats.wins + state.stats.losses : 0}
                highlightId={phase?.kind === "result" ? phase.result.id : null}
              />
            </div>
          </>
        )}
        <Announcer phase={phase} />
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
