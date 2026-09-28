import * as stylex from '@stylexjs/stylex';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import type { PendingGuess, ResolvedGuess } from '@/lib/contracts';
import { EmptyMessage, Numeric, Panel, PanelHeader } from '@/components/ui';
import { palette } from '@/components/ui/tokens.stylex';
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
 * The player's last guesses, each with both prices, so a result can be
 * checked rather than taken on trust (product spec §6.5). A guess in play
 * sits on top as a dashed row; the result just announced is highlighted.
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
				<ul {...stylex.props(styles.list)}>
					{pending && (
						<li
							aria-label={`${WORD[pending.direction]} at ${plain.format(pending.priceAtGuess)}, in play.`}
							{...stylex.props(styles.row, styles.pendingRow)}
						>
							<Direction direction={pending.direction} />
							<Numeric xstyle={styles.prices}>
								{plain.format(pending.priceAtGuess)} → in play
							</Numeric>
							<span {...stylex.props(styles.outcome, styles.waiting)}>
								waiting
							</span>
							<Numeric xstyle={[styles.points, styles.waiting]}>-</Numeric>
						</li>
					)}
					{history.map((g) => {
						const won = g.delta === 1;
						return (
							<li
								key={g.id}
								aria-label={`${WORD[g.direction]}, ${plain.format(g.priceAtGuess)} to ${plain.format(g.priceAtResolve)}, ${won ? 'correct, plus 1' : 'wrong, minus 1'}.`}
								{...stylex.props(
									styles.row,
									g.id === highlightId &&
										(won ? styles.highlightWin : styles.highlightLoss),
								)}
							>
								<Direction direction={g.direction} />
								<Numeric xstyle={styles.prices}>
									{plain.format(g.priceAtGuess)} →{' '}
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
									{won ? '+1' : '−1'}
								</Numeric>
							</li>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}

function Direction({ direction }: { direction: 'up' | 'down' }) {
	const Arrow = direction === 'up' ? ArrowUp : ArrowDown;
	return (
		<span
			aria-hidden
			{...stylex.props(
				styles.direction,
				direction === 'up' ? styles.up : styles.down,
			)}
		>
			<Arrow size={16} strokeWidth={2.5} />
			{WORD[direction]}
		</span>
	);
}
