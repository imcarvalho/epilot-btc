'use client';

import * as stylex from '@stylexjs/stylex';
import {
	SegmentedControl,
	SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { hourChange } from '@/lib/candles';
import { standing } from '@/lib/live-minute';
import {
	ChangeBadge,
	Eyebrow,
	Numeric,
	Panel,
	SourceBadge,
} from '@/components/ui';
import { formatAge, formatCountdown, formatUsd } from '../utils';
import {
	type GuessPhase,
	PRICE_UNAVAILABLE,
	staleSentence,
} from '@/lib/guess-phase';
import { HourChart, MinuteChart } from '../charts';
import type { CandlesState, LiveMinute } from '../hooks';
import { styles } from './PriceCard.styles';

export type ChartView = 'hour' | 'minute';

/** What the view toggle controls: whichever chart is showing. */
const CHART_ID = 'price-chart';

const WORD = {
	up: 'Higher',
	down: 'Lower',
} as const;

/**
 * The price, always visible (rule R1), and the chart beneath it in one of
 * two views (product spec §6.1): the last hour of candles, or - while a
 * guess is in play - the minute itself, live. Beside the title, where the
 * numbers come from and whether that feed is live.
 *
 * Both figures are the server's game price, pushed once a second. The
 * minute view's says it is provisional: it is what makes the minute worth
 * watching, and it decides nothing (engineering spec §5.1).
 */
export function PriceCard({
	price,
	priceUpdatedAt,
	priceStale,
	now,
	phase,
	live,
	candles,
	view,
	onViewChange,
	isFeedLive,
}: {
	price: number | null;
	priceUpdatedAt: number | null;
	priceStale: boolean;
	/** Server clock. */
	now: number | null;
	phase: GuessPhase | null;
	live: LiveMinute;
	/** The last hour, pushed by the game stream. */
	candles: CandlesState;
	view: ChartView;
	onViewChange: (view: ChartView) => void;
	/** Whether the feed behind the view on show is live. */
	isFeedLive: boolean;
}) {
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

	// While a guess runs, the header follows the live minute - provisional,
	// like everything drawn from it - and makes no claim about movement until
	// its first price has arrived.
	const livePrice = guess ? live.price : null;
	let figure: number | null = livePrice ?? price;
	let badge: React.ReactNode = null;
	if (guess && livePrice !== null) {
		if (showMinute) {
			const { margin } = standing(
				guess.direction,
				guess.priceAtGuess,
				livePrice,
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
					change={livePrice - guess.priceAtGuess}
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
					<div {...stylex.props(styles.titleRow)}>
						<Eyebrow as="h2" id="price-heading">
							{showMinute && guess
								? `Your minute · ${WORD[guess.direction]}`
								: 'Bitcoin · US Dollar'}
						</Eyebrow>
						<SourceBadge
							isLive={isFeedLive}
							source={showMinute ? 'ticker' : 'candles'}
						/>
					</div>
					<div {...stylex.props(styles.figure)}>
						{figure !== null ? (
							<Numeric size="hero">{formatUsd(figure)}</Numeric>
						) : now !== null ? (
							// Loaded, and still nothing: say so, rather than shimmer as if
							// the price were on its way.
							<p {...stylex.props(styles.unavailable)}>{PRICE_UNAVAILABLE}</p>
						) : (
							// Sized to the viewport, not the column: the column is only as
							// wide as its content, which here is the skeleton itself.
							<Skeleton width="min(420px, 70vw)" height={72} />
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
					) : livePrice !== null ? (
						<p {...stylex.props(styles.caption, styles.updated)}>
							Live · provisional
						</p>
					) : (
						// Fresh, the price needs no caption: it moves every second on
						// the stream. Stale, it says so.
						priceStale &&
						age !== null && (
							<p
								{...stylex.props(styles.caption, styles.updated, styles.stale)}
							>
								{staleSentence(age)}
							</p>
						)
					)}
					{guess && (
						<SegmentedControl
							label="Chart view"
							aria-controls={CHART_ID}
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

			<div id={CHART_ID} {...stylex.props(styles.chart)}>
				{showMinute && guess && now !== null ? (
					<MinuteChart guess={guess} live={live} now={now} />
				) : (
					<HourChart state={candles} lock={lock} hasPrice={figure !== null} />
				)}
			</div>
		</Panel>
	);
}
