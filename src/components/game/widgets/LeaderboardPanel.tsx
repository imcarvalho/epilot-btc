import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import * as stylex from '@stylexjs/stylex';
import { Download, Trophy } from 'lucide-react';
import type { LeaderboardResponse, LeaderboardRow } from '@/lib/contracts';
import { ordinal, placeSentence } from '@/lib/place';
import { rateWords, scoreWords } from '@/lib/spoken';
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
 *
 * A row reads as a sentence from its own content - "138th BriskMarten you
 * 48% correct over 25 guesses minus 2 points" - not from an `aria-label` a
 * screen reader may skip; the bare numbers are hidden from it and words
 * stand in for them. Your row says "you" in a tag, not in colour alone.
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
						{/* `role="list"`: with `list-style: none`, Safari drops the list semantics. */}
						<ol role="list" {...stylex.props(styles.list)}>
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
	return (
		<li {...stylex.props(styles.row, row.isYou && styles.you)}>
			<Numeric xstyle={[styles.rank, row.rank === 1 && styles.first]}>
				<span aria-hidden>{row.rank}</span>
				<VisuallyHidden>{ordinal(row.rank)}</VisuallyHidden>
			</Numeric>
			<span {...stylex.props(styles.nameCell)}>
				<span {...stylex.props(styles.name)}>{row.publicName}</span>
				{row.isYou && <span {...stylex.props(styles.youTag)}>you</span>}
			</span>
			<Numeric xstyle={styles.rate}>
				<span aria-hidden>{formatRate(row.successRate)}</span>
				<VisuallyHidden>
					{rateWords(row.successRate, row.guesses)}
				</VisuallyHidden>
			</Numeric>
			<Numeric xstyle={[styles.score, row.score < 0 && styles.negative]}>
				<span aria-hidden>{formatScore(row.score)}</span>
				<VisuallyHidden>{scoreWords(row.score)}</VisuallyHidden>
			</Numeric>
		</li>
	);
}
