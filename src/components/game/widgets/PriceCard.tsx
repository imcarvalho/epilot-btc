'use client';

import * as stylex from '@stylexjs/stylex';
import {
	SegmentedControl,
	SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { hourChange } from '@/lib/candles';
import { standing } from '@/lib/live-minute';
import { ChangeBadge, Eyebrow, Numeric, Panel } from '@/components/ui';
import { formatAge, formatCountdown, formatUsd } from '../utils';
import { type GuessPhase, PRICE_UNAVAILABLE } from '@/lib/guess-phase';
import { HourChart, MinuteChart } from '../charts';
import { useCandles, type LiveMinute } from '../hooks';
import { styles } from './PriceCard.styles';

export type ChartView = 'hour' | 'minute';

const WORD = {
	up: 'Higher',
	down: 'Lower',
} as const;

/**
 * The price, always visible (rule R1), and the chart beneath it in one of
 * two views (product spec §6.1): the last hour of candles, or - while a
 * guess is in play - the minute itself, live.
 *
 * The hour view's figure is the server's game price. The minute view's is
 * the browser's ticker, and says so: it is what makes the minute worth
 * watching, and it decides nothing (engineering spec §5.1).
 */
export function PriceCard({
	price,
	priceUpdatedAt,
	priceStale,
	now,
	phase,
	live,
	view,
	onViewChange,
}: {
	price: number | null;
	priceUpdatedAt: number | null;
	priceStale: boolean;
	/** Server clock. */
	now: number | null;
	phase: GuessPhase | null;
	live: LiveMinute;
	view: ChartView;
	onViewChange: (view: ChartView) => void;
}) {
	const candles = useCandles();
	const guess = phase && 'guess' in phase ? phase.guess : null;
	const showMinute = view === 'minute' && guess !== null && now !== null;

	// The hour chart carries the guess while it runs and while its result shows.
	const marked = guess ?? (phase?.kind === 'result' ? phase.result : null);
	const lock = marked
		? {
				price: marked.priceAtGuess,
				at: marked.createdAt,
			}
		: null;

	const age =
		priceUpdatedAt !== null && now !== null
			? formatAge(now - priceUpdatedAt)
			: null;
	const secondsLeft = phase?.kind === 'locked' ? phase.secondsLeft : 0;

	// While a guess runs, the browser does not ask the server (§3.1), so the
	// game price on screen is as old as the guess. The header follows the
	// live ticker instead - provisional, like everything drawn from it - and
	// makes no claim about movement until the ticker has spoken.
	const tickerPrice = guess ? live.price : null;
	let figure: number | null = tickerPrice ?? price;
	let badge: React.ReactNode = null;
	if (guess && tickerPrice !== null) {
		if (showMinute) {
			const { margin } = standing(
				guess.direction,
				guess.priceAtGuess,
				tickerPrice,
			);
			badge = (
				<ChangeBadge
					change={margin}
					period={margin >= 0 ? 'ahead' : 'behind'}
					flatLabel="level with your guess"
				/>
			);
		} else {
			badge = (
				<ChangeBadge
					change={tickerPrice - guess.priceAtGuess}
					period="since your guess"
					flatLabel="unchanged since your guess"
				/>
			);
		}
	} else if (!guess && candles.kind === 'ready') {
		const change = hourChange(candles.candles);
		if (change !== null) {
			badge = <ChangeBadge change={change} period="in the last hour" />;
		}
	}

	return (
		<Panel aria-labelledby="price-heading">
			<div {...stylex.props(styles.header)}>
				<div {...stylex.props(styles.headline)}>
					<Eyebrow as="h2" id="price-heading">
						{showMinute && guess
							? `Your minute · ${WORD[guess.direction]}`
							: 'Bitcoin · US Dollar'}
					</Eyebrow>
					<div {...stylex.props(styles.figure)}>
						{figure !== null ? (
							<Numeric size="hero">{formatUsd(figure)}</Numeric>
						) : now !== null ? (
							// Loaded, and still nothing: say so, rather than shimmer as if
							// the price were on its way.
							<p {...stylex.props(styles.unavailable)}>{PRICE_UNAVAILABLE}</p>
						) : (
							<Skeleton width={420} height={72} />
						)}
						{badge}
					</div>
				</div>

				<div {...stylex.props(styles.side)}>
					{showMinute ? (
						// A timer, which by default does not announce each second.
						<div role="timer" {...stylex.props(styles.countdown)}>
							<Numeric
								xstyle={[
									styles.countdownValue,
									phase?.kind !== 'locked' && styles.countdownDone,
								]}
							>
								{formatCountdown(secondsLeft)}
							</Numeric>
							<span {...stylex.props(styles.caption)}>
								{phase?.kind === 'locked'
									? 'left in the minute'
									: 'the minute is up'}
							</span>
						</div>
					) : tickerPrice !== null ? (
						<p {...stylex.props(styles.caption, styles.updated)}>
							Live · provisional
						</p>
					) : (
						age !== null && (
							<p
								{...stylex.props(
									styles.caption,
									styles.updated,
									priceStale && styles.stale,
								)}
							>
								{priceStale
									? `Price feed delayed. Last updated ${age}. Nothing is settled until it catches up.`
									: `Updated ${age}`}
							</p>
						)
					)}
					{guess && (
						<SegmentedControl
							label="Chart view"
							value={view}
							onChange={(v) => onViewChange(v as ChartView)}
							size="sm"
						>
							<SegmentedControlItem value="hour" label="Last hour" />
							<SegmentedControlItem value="minute" label="This guess" />
						</SegmentedControl>
					)}
				</div>
			</div>

			{showMinute && guess && now !== null ? (
				<MinuteChart guess={guess} live={live} now={now} />
			) : (
				<HourChart state={candles} lock={lock} hasPrice={figure !== null} />
			)}
		</Panel>
	);
}
