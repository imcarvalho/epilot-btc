import * as stylex from '@stylexjs/stylex';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import type { PendingGuess, ResolvedGuess } from '@/lib/contracts';
import { EmptyMessage, Numeric, Panel, PanelHeader } from '@/components/ui';
import { palette } from '@/components/ui/tokens.stylex';
import { signedWords } from '@/lib/spoken';
import { clockTime } from '../utils';
import { styles } from './HistoryPanel.styles';

const WORD = {
	up: 'Higher',
	down: 'Lower',
} as const;
const plain = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/**
 * The player's last guesses, each with the minute it was locked in and both
 * prices, so a result can be checked against the chart rather than taken on
 * trust (product spec §6.5). A guess in play sits on top as a dashed row;
 * the result just announced is highlighted.
 *
 * Each row reads as a sentence from its own content - "14:32, Higher
 * 84,531.50 to 84,540.10 correct plus 1" - rather than from an `aria-label`, which a
 * screen reader reading the list item by item may never announce. The
 * arrows and signs are hidden from it and words stand in for them.
 */
export function HistoryPanel({
	history,
	pending,
	resolvedCount,
	highlightId,
}: {
	history: ResolvedGuess[];
	pending: PendingGuess | null;
	/** From the counters, not history.length: history is trimmed to 10. */
	resolvedCount: number;
	highlightId: string | null;
}) {
	const empty = history.length === 0 && pending === null;

	return (
		<Panel aria-labelledby="history-heading" xstyle={styles.panel}>
			<PanelHeader
				id="history-heading"
				icon={History}
				iconColor={palette.cyan}
				title="Your last guesses"
				meta={`${resolvedCount} resolved`}
			/>
			{empty ? (
				<EmptyMessage
					title="No guesses yet."
					body="Each one lands here with both prices, so you can check the result rather than take our word for it."
				/>
			) : (
				// `role="list"`: with `list-style: none`, Safari drops the list semantics.
				<ul role="list" {...stylex.props(styles.list)}>
					{pending && (
						<li {...stylex.props(styles.row, styles.pendingRow)}>
							<LockTime at={pending.createdAt} />
							<Direction direction={pending.direction} />
							<Numeric xstyle={styles.prices}>
								{plain.format(pending.priceAtGuess)} <Arrow /> in play
							</Numeric>
							<span {...stylex.props(styles.outcome, styles.waiting)}>
								waiting
							</span>
							<Numeric xstyle={[styles.points, styles.waiting]}>
								<span aria-hidden>-</span>
							</Numeric>
						</li>
					)}
					{history.map((g) => {
						const won = g.delta === 1;
						return (
							<li
								key={g.id}
								{...stylex.props(
									styles.row,
									g.id === highlightId &&
										(won ? styles.highlightWin : styles.highlightLoss),
								)}
							>
								<LockTime at={g.createdAt} />
								<Direction direction={g.direction} />
								<Numeric xstyle={styles.prices}>
									{plain.format(g.priceAtGuess)} <Arrow />
									<VisuallyHidden>to</VisuallyHidden>{' '}
									{plain.format(g.priceAtResolve)}
								</Numeric>
								<span
									{...stylex.props(
										styles.outcome,
										won ? styles.win : styles.loss,
									)}
								>
									{won ? 'correct' : 'wrong'}
								</span>
								<Numeric
									xstyle={[styles.points, won ? styles.win : styles.loss]}
								>
									<span aria-hidden>{won ? '+1' : '−1'}</span>
									<VisuallyHidden>{signedWords(g.delta)}</VisuallyHidden>
								</Numeric>
							</li>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}

/**
 * The minute the guess was locked in, in the player's own time zone: the
 * same clock as the chart, so the row can be found on it. The comma is for
 * the ear, a pause before the direction.
 */
function LockTime({ at }: { at: number }) {
	return (
		<Numeric xstyle={styles.time}>
			{clockTime(at)}
			<VisuallyHidden>,</VisuallyHidden>
		</Numeric>
	);
}

/** The icon is for the eye; the word beside it is what is read. */
function Direction({ direction }: { direction: 'up' | 'down' }) {
	const Icon = direction === 'up' ? ArrowUp : ArrowDown;
	return (
		<span
			{...stylex.props(
				styles.direction,
				direction === 'up' ? styles.up : styles.down,
			)}
		>
			<Icon aria-hidden size={16} strokeWidth={2.5} />
			{WORD[direction]}
		</span>
	);
}

/** The arrow between the two prices, for the eye only. */
function Arrow() {
	return <span aria-hidden>→</span>;
}
