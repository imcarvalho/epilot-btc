import * as stylex from "@stylexjs/stylex";
import { ArrowDown, ArrowUp, Check, Clock, Loader } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import type { GuessPhase } from "@/lib/guess-phase";
import { resultHeadline } from "@/lib/guess-phase";
import { GUESS_WINDOW_MS } from "@/lib/resolve-guess";
import { IconTile, Numeric, Panel } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";
import { formatAge, formatCountdown, formatElapsed, formatUsd } from "./format";
import type { GuessError } from "./useGameState";

const WORD = { up: "Higher", down: "Lower" } as const;

/**
 * The strip between the buttons and the panels: what is going on with the
 * guess (product spec §5, §6.2, §7). Every waiting state is named, so the
 * player never has to wonder which one they are in.
 */
export function GuessStrip({
  phase,
  name,
  guessError,
  now,
}: {
  phase: GuessPhase | null;
  name: string | null;
  guessError: GuessError;
  now: number;
}) {
  if (phase?.kind === "locked" || phase?.kind === "time-up" || phase?.kind === "stale") {
    return <LockedStrip phase={phase} now={now} />;
  }
  if (phase?.kind === "result") {
    return <ResultBanner phase={phase} />;
  }
  return <Prompt firstVisit={phase?.kind !== "idle"} name={name} guessError={guessError} />;
}

function Prompt({ firstVisit, name, guessError }: { firstVisit: boolean; name: string | null; guessError: GuessError }) {
  return (
    <Panel as="div" variant="dashed">
      <div {...stylex.props(styles.row)}>
        <span aria-hidden {...stylex.props(styles.sparkle)}>
          <Icon icon={Loader} size="md" />
        </span>
        <div {...stylex.props(styles.stack)}>
          <p {...stylex.props(styles.lead)}>
            {firstVisit
              ? "Will BTC be higher or lower in a minute? Make your first guess."
              : "No guess in play. Pick a direction and the next minute decides it."}
          </p>
          {guessError ? (
            <p {...stylex.props(styles.sub, styles.warn)}>
              {guessError === "price-unavailable"
                ? "Price feed delayed. Nothing can be locked in until it catches up."
                : "That guess did not go through. Try again."}
            </p>
          ) : (
            firstVisit &&
            name && <p {...stylex.props(styles.sub)}>You are {name}. Your score is kept on this browser until you sign in.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function LockedStrip({
  phase,
  now,
}: {
  phase: Extract<GuessPhase, { kind: "locked" | "time-up" | "stale" }>;
  now: number;
}) {
  const { guess } = phase;
  const secondsLeft = phase.kind === "locked" ? phase.secondsLeft : 0;
  const elapsed = Math.min(GUESS_WINDOW_MS, Math.max(0, now - guess.createdAt));
  const waiting = phase.kind !== "locked";

  const caption =
    phase.kind === "locked"
      ? "Resolves when the minute is up and the price has moved."
      : phase.kind === "time-up"
        ? "Time is up - waiting for the price to change."
        : `Price feed delayed. Last updated ${formatAge(phase.ageMs)}. Nothing is settled until it catches up.`;

  return (
    <Panel as="div" tone={waiting ? "warning" : "neutral"} xstyle={styles.compact}>
      <div {...stylex.props(styles.locked)}>
        <div {...stylex.props(styles.row)}>
          <IconTile icon={guess.direction === "up" ? ArrowUp : ArrowDown} tone={guess.direction} />
          <div {...stylex.props(styles.stack)}>
            <span {...stylex.props(styles.strong)}>{WORD[guess.direction]}</span>
            <span {...stylex.props(styles.muted)}>
              locked at <Numeric xstyle={styles.lockedPrice}>{formatUsd(guess.priceAtGuess)}</Numeric>
            </span>
          </div>
        </div>

        <div {...stylex.props(styles.row, styles.clock)}>
          <span {...stylex.props(styles.clockIcon)}>
            <Icon icon={Clock} size="md" />
          </span>
          <div {...stylex.props(styles.stack)}>
            <Numeric xstyle={[styles.countdown, waiting && styles.countdownDone]}>{formatCountdown(secondsLeft)}</Numeric>
            <span {...stylex.props(styles.muted)}>{waiting ? "the minute is up" : "until it can resolve"}</span>
          </div>
        </div>

        <div {...stylex.props(styles.progress)}>
          <ProgressBar
            label="Time until the guess can resolve"
            isLabelHidden
            value={elapsed / 1000}
            max={GUESS_WINDOW_MS / 1000}
            variant={waiting ? "warning" : "accent"}
          />
          <span {...stylex.props(styles.muted)}>{caption}</span>
        </div>
      </div>
    </Panel>
  );
}

function ResultBanner({ phase }: { phase: Extract<GuessPhase, { kind: "result" }> }) {
  const { result, score } = phase;
  const won = result.delta === 1;

  return (
    <Panel as="div" tone={won ? "win" : "loss"} xstyle={styles.compact}>
      <div {...stylex.props(styles.result)}>
        <div {...stylex.props(styles.row)}>
          <IconTile icon={won ? Check : result.priceAtResolve > result.priceAtGuess ? ArrowUp : ArrowDown} tone={won ? "win" : "loss"} />
          <div {...stylex.props(styles.stack)}>
            <p {...stylex.props(styles.headline)}>{resultHeadline(result)}</p>
            <p {...stylex.props(styles.muted, styles.flush)}>
              Locked at <Numeric>{formatUsd(result.priceAtGuess)}</Numeric>, resolved at{" "}
              <Numeric>{formatUsd(result.priceAtResolve)}</Numeric> after {formatElapsed(result.resolvedAt - result.createdAt)}.
            </p>
          </div>
        </div>
        <div {...stylex.props(styles.scoreBox, won ? styles.scoreBoxWin : styles.scoreBoxLoss)}>
          <Numeric xstyle={[styles.delta, won ? styles.deltaWin : styles.deltaLoss]}>{won ? "+1" : "−1"}</Numeric>
          <span {...stylex.props(styles.muted)}>score {score}</span>
        </div>
      </div>
    </Panel>
  );
}

const styles = stylex.create({
  compact: {
    paddingBlock: "var(--spacing-5)",
    paddingInline: {
      default: "var(--spacing-6)",
      "@media (max-width: 640px)": "var(--spacing-4)",
    },
  },
  row: {
    alignItems: "center",
    display: "flex",
    gap: "var(--spacing-4)",
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-0-5)",
    minWidth: 0,
  },
  sparkle: {
    color: palette.purple,
    display: "inline-flex",
    flexShrink: 0,
  },
  lead: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    margin: 0,
  },
  sub: {
    color: "var(--color-text-secondary)",
    margin: 0,
  },
  warn: {
    color: "var(--color-warning)",
  },
  locked: {
    alignItems: "center",
    display: "grid",
    gap: "var(--spacing-6)",
    gridTemplateColumns: {
      default: "auto auto 1fr",
      "@media (max-width: 860px)": "1fr 1fr",
    },
  },
  strong: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-medium)",
  },
  muted: {
    color: "var(--color-text-secondary)",
    fontSize: "var(--font-size-sm)",
  },
  flush: {
    margin: 0,
  },
  lockedPrice: {
    color: palette.yellow,
  },
  clock: {
    borderInlineStartColor: "var(--color-border)",
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    paddingInlineStart: "var(--spacing-6)",
  },
  clockIcon: {
    color: palette.purple,
    display: "inline-flex",
  },
  countdown: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-3xl)",
    fontWeight: "var(--font-weight-bold)",
    lineHeight: 1,
  },
  countdownDone: {
    color: palette.yellow,
  },
  progress: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
    gridColumn: {
      default: "auto",
      "@media (max-width: 860px)": "1 / -1",
    },
  },
  result: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--spacing-4)",
    justifyContent: "space-between",
  },
  headline: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    fontWeight: "var(--font-weight-semibold)",
    margin: 0,
  },
  scoreBox: {
    alignItems: "baseline",
    borderRadius: "var(--radius-element)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: "var(--spacing-2)",
    paddingBlock: "var(--spacing-2)",
    paddingInline: "var(--spacing-5)",
  },
  scoreBoxWin: { borderColor: "rgba(125, 251, 170, 0.4)" },
  scoreBoxLoss: { borderColor: "rgba(255, 138, 138, 0.4)" },
  delta: {
    fontSize: "var(--font-size-3xl)",
    fontWeight: "var(--font-weight-bold)",
  },
  deltaWin: { color: palette.upFrom },
  deltaLoss: { color: "var(--color-error)" },
});
