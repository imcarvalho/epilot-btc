import * as stylex from '@stylexjs/stylex';
import { Download, Trophy } from 'lucide-react';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/contracts';
import { ordinal, placeSentence } from '@/lib/leaderboard';
import { formatRate } from '@/lib/stats';
import { EmptyMessage, Numeric, Panel, PanelHeader } from '@/components/ui';
import { palette } from '@/components/ui/tokens.stylex';
import { formatScore } from '../utils';
import { styles } from './LeaderboardPanel.styles';

/**
 * The board (product spec §6.7): four rows at most - the top three, and you.
 * Your row is always there once you are on the board, highlighted, and on
 * the podium it is simply highlighted in place. Anonymous players see the
 * full podium with their place missing and a line saying what puts them
 * there: the value is visible before anything is asked.
 */
export function LeaderboardPanel({
	board,
}: {
	board: LeaderboardResponse | null;
}) {
	const you = board?.podium.find((r) => r.isYou) ?? board?.you ?? null;

	return (
		<Panel aria-labelledby="leaderboard-heading" xstyle={styles.panel}>
			<PanelHeader
				id="leaderboard-heading"
				icon={Trophy}
				iconColor={palette.yellow}
				title="Leaderboard"
			/>
			{board && board.podium.length === 0 ? (
				<EmptyMessage
					title="No one on the board yet."
					body="Sign in and the first correct guess puts you at the top of it."
				/>
			) : (
				board && (
					<>
						<ol {...stylex.props(styles.list)}>
							{board.podium.map((row) => (
								<Row key={`${row.rank}-${row.publicName}`} row={row} />
							))}
							{board.you && (
								<>
									<li aria-hidden {...stylex.props(styles.gap)}>
										...
									</li>
									<Row row={board.you} />
								</>
							)}
						</ol>
						{!board.isEligible && (
							<p {...stylex.props(styles.invite)}>
								<Download aria-hidden size={16} />
								Sign in to take your place on the board.
							</p>
						)}
						{you && (
							<p {...stylex.props(styles.place)}>
								{placeSentence(you.rank, board.total)}
							</p>
						)}
					</>
				)
			)}
		</Panel>
	);
}

function Row({ row }: { row: LeaderboardRow }) {
	const label = `${ordinal(row.rank)}${row.isYou ? ', you' : ''}: ${row.publicName}, score ${row.score}, ${
		row.successRate === null ? 'no results yet' : `${row.successRate}% correct`
	} over ${row.guesses} ${row.guesses === 1 ? 'guess' : 'guesses'}.`;
	return (
		<li
			aria-label={label}
			{...stylex.props(styles.row, row.isYou && styles.you)}
		>
			<Numeric xstyle={[styles.rank, row.rank === 1 && styles.first]}>
				{row.rank}
			</Numeric>
			<span {...stylex.props(styles.name)}>{row.publicName}</span>
			<Numeric xstyle={styles.rate}>{formatRate(row.successRate)}</Numeric>
			<Numeric xstyle={[styles.score, row.score < 0 && styles.negative]}>
				{formatScore(row.score)}
			</Numeric>
		</li>
	);
}
