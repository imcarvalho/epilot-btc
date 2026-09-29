import * as stylex from '@stylexjs/stylex';
import { ArrowDown, ArrowUp, Check, Clock, Loader, Minus } from 'lucide-react';
import { Icon } from '@astryxdesign/core/Icon';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
	awayHeadline,
	type GuessPhase,
	guessFailureSentence,
	PRICE_BLOCKED,
	resultHeadline,
	SETTLEMENT_DELAYED,
	staleSentence,
	TIME_UP,
} from '@/lib/guess-phase';
import { GUESS_WINDOW_MS } from '@/lib/resolve-guess';
import { IconTile, Numeric, Panel } from '@/components/ui';
import { formatAge, formatCountdown, formatElapsed, formatUsd } from '../utils';
import type { GuessError, LiveMinute } from '../hooks';
import { styles } from './GuessStrip.styles';

const usdSigned = (n: number) =>
	`${n > 0 ? '+' : n < 0 ? '−' : ''}${formatUsd(Math.abs(n))}`;

const WORD = {
	up: 'Higher',
	down: 'Lower',
} as const;

/**
 * The strip between the buttons and the panels: what is going on with the
 * guess (product spec §5, §6.2, §7). Every waiting state is named, so the
 * player never has to wonder which one they are in.
 */
export function GuessStrip({
	phase,
	name,
	signedIn,
	guessError,
	priceBlocked,
	now,
	live,
	isMinuteView,
}: {
	phase: GuessPhase | null;
	name: string | null;
	signedIn: boolean;
	guessError: GuessError;
	/** No guess is in play and the server has no fresh price (`priceBlocksGuess`). */
	priceBlocked: boolean;
	now: number;
	live: LiveMinute;
	/** The chart header carries the countdown in the minute view. */
	isMinuteView: boolean;
}) {
	if (
		phase?.kind === 'locked' ||
		phase?.kind === 'time-up' ||
		phase?.kind === 'stale' ||
		phase?.kind === 'delayed'
	) {
		return (
			<LockedStrip
				phase={phase}
				now={now}
				live={live}
				showClock={!isMinuteView}
			/>
		);
	}
	if (phase?.kind === 'result' || phase?.kind === 'away-result') {
		return <ResultBanner phase={phase} />;
	}
	return (
		<Prompt
			firstVisit={phase?.kind !== 'idle'}
			name={name}
			signedIn={signedIn}
			guessError={guessError}
			priceBlocked={priceBlocked}
		/>
	);
}

function Prompt({
	firstVisit,
	name,
	signedIn,
	guessError,
	priceBlocked,
}: {
	firstVisit: boolean;
	name: string | null;
	signedIn: boolean;
	guessError: GuessError;
	priceBlocked: boolean;
}) {
	return (
		<Panel as="div" variant="dashed" xstyle={styles.prompt}>
			<div {...stylex.props(styles.row)}>
				<span aria-hidden {...stylex.props(styles.sparkle)}>
					<Icon icon={Loader} size="md" />
				</span>
				<div {...stylex.props(styles.stack)}>
					<p {...stylex.props(styles.lead, priceBlocked && styles.warn)}>
						{priceBlocked
							? PRICE_BLOCKED
							: firstVisit
								? 'Will BTC be higher or lower in a minute? Make your first guess.'
								: 'No guess in play. Pick a direction and the next minute decides it.'}
					</p>
					{guessError && !priceBlocked ? (
						<p {...stylex.props(styles.sub, styles.warn)}>
							{guessFailureSentence(guessError)}
						</p>
					) : (
						firstVisit &&
						name && (
							<p {...stylex.props(styles.sub)}>
								{signedIn
									? `You are ${name}. Your score is kept with your account.`
									: `You are ${name}. Your score is kept on this browser until you sign in.`}
							</p>
						)
					)}
				</div>
			</div>
		</Panel>
	);
}

function LockedStrip({
	phase,
	now,
	live,
	showClock,
}: {
	phase: Extract<
		GuessPhase,
		{ kind: 'locked' | 'time-up' | 'stale' | 'delayed' }
	>;
	now: number;
	live: LiveMinute;
	showClock: boolean;
}) {
	const { guess } = phase;
	const secondsLeft = phase.kind === 'locked' ? phase.secondsLeft : 0;
	const elapsed = Math.min(GUESS_WINDOW_MS, Math.max(0, now - guess.createdAt));
	const waiting = phase.kind !== 'locked';

	const moved = live.price === null ? null : live.price - guess.priceAtGuess;

	const caption =
		phase.kind === 'locked'
			? showClock
				? 'Resolves when the minute is up and the price has moved.'
				: 'The line is indicative. The result is settled on the server with its own price, which may differ by a few cents.'
			: phase.kind === 'time-up'
				? TIME_UP
				: phase.kind === 'delayed'
					? SETTLEMENT_DELAYED
					: staleSentence(formatAge(phase.ageMs));

	return (
		<Panel
			as="div"
			tone={waiting ? 'warning' : 'neutral'}
			xstyle={styles.compact}
		>
			<div
				{...stylex.props(
					styles.locked,
					!showClock && styles.lockedNoClock,
					moved !== null && styles.lockedWithMoved,
				)}
			>
				<div {...stylex.props(styles.row)}>
					<IconTile
						icon={guess.direction === 'up' ? ArrowUp : ArrowDown}
						tone={guess.direction}
					/>
					<div {...stylex.props(styles.stack)}>
						<span {...stylex.props(styles.strong)}>
							{WORD[guess.direction]}
						</span>
						<span {...stylex.props(styles.muted)}>
							locked at{' '}
							<Numeric xstyle={styles.lockedPrice}>
								{formatUsd(guess.priceAtGuess)}
							</Numeric>
						</span>
					</div>
				</div>

				{showClock && (
					<div {...stylex.props(styles.row, styles.clock)}>
						<span {...stylex.props(styles.clockIcon)}>
							<Icon icon={Clock} size="md" />
						</span>
						{/* A timer, which by default does not announce each second. */}
						<div role="timer" {...stylex.props(styles.stack)}>
							<Numeric
								xstyle={[styles.countdown, waiting && styles.countdownDone]}
							>
								{formatCountdown(secondsLeft)}
							</Numeric>
							<span {...stylex.props(styles.muted)}>
								{waiting ? 'the minute is up' : 'until it can resolve'}
							</span>
						</div>
					</div>
				)}

				<div {...stylex.props(styles.progress)}>
					<ProgressBar
						label="Time until the guess can resolve"
						isLabelHidden
						value={elapsed / 1000}
						max={GUESS_WINDOW_MS / 1000}
						variant={waiting ? 'warning' : 'accent'}
					/>
					<span {...stylex.props(styles.muted)}>{caption}</span>
				</div>

				{moved !== null && (
					// The live gap (product spec §7), from the streamed price: provisional.
					<div
						{...stylex.props(
							styles.movedBox,
							!showClock && styles.movedBeside,
							moved === 0 ? styles.movedFlat : styles.movedYes,
						)}
					>
						<Icon icon={moved === 0 ? Minus : Check} size="sm" />
						<div {...stylex.props(styles.stack)}>
							<span>
								{moved === 0 ? 'Price has not moved' : 'Price has moved'}
							</span>
							<Numeric xstyle={styles.movedFigure}>
								{usdSigned(moved)} so far
							</Numeric>
						</div>
					</div>
				)}
			</div>
		</Panel>
	);
}

function ResultBanner({
	phase,
}: {
	phase: Extract<GuessPhase, { kind: 'result' | 'away-result' }>;
}) {
	const { result, score } = phase;
	const won = result.delta === 1;
	// Settled while away: said as that, in the same banner (product spec §7).
	const headline =
		phase.kind === 'away-result'
			? awayHeadline(result)
			: resultHeadline(result);

	return (
		<Panel as="div" tone={won ? 'win' : 'loss'} xstyle={styles.compact}>
			<div {...stylex.props(styles.result)}>
				<div {...stylex.props(styles.row, styles.resultRow)}>
					<IconTile
						icon={
							won
								? Check
								: result.priceAtResolve > result.priceAtGuess
									? ArrowUp
									: ArrowDown
						}
						tone={won ? 'win' : 'loss'}
					/>
					<div {...stylex.props(styles.stack)}>
						<p {...stylex.props(styles.headline)}>{headline}</p>
						<p {...stylex.props(styles.muted, styles.flush)}>
							Locked at <Numeric>{formatUsd(result.priceAtGuess)}</Numeric>,
							resolved at <Numeric>{formatUsd(result.priceAtResolve)}</Numeric>{' '}
							after {formatElapsed(result.resolvedAt - result.createdAt)}.
						</p>
					</div>
				</div>
				<div
					{...stylex.props(
						styles.scoreBox,
						won ? styles.scoreBoxWin : styles.scoreBoxLoss,
					)}
				>
					<Numeric
						xstyle={[styles.delta, won ? styles.deltaWin : styles.deltaLoss]}
					>
						{won ? '+1' : '−1'}
					</Numeric>
					{/* The top bar already shows the score; on a phone the +1 or -1 stays alone. */}
					<span {...stylex.props(styles.muted, styles.scoreTotal)}>
						score {score}
					</span>
				</div>
			</div>
		</Panel>
	);
}
