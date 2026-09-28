import * as stylex from '@stylexjs/stylex';
import type { Stats } from '@/lib/contracts';
import { bestStreakLabel, streakLabel, successRate } from '@/lib/stats';
import { Numeric } from './Numeric';
import { Pill } from './Pill';
import { styles } from './ScoreChip.styles';

/**
 * The running score, always visible (rule R1) - it may be negative - with
 * the success rate and the streak beside it once anything has resolved
 * (product spec §6.5). The score stays the primary number; the rest is
 * secondary text, and hover gives the raw numbers behind each.
 */
export function ScoreChip({ score, stats }: { score: number; stats: Stats }) {
	const resolved = stats.wins + stats.losses;
	const rate = successRate(stats);
	const streak = streakLabel(stats);
	const best = bestStreakLabel(stats.bestStreak);

	return (
		<Pill>
			<span>Score</span>
			<Numeric xstyle={styles.value}>{score}</Numeric>
			{rate !== null && (
				<>
					<span aria-hidden {...stylex.props(styles.divider)} />
					<span
						title={`${stats.wins} of ${resolved} ${resolved === 1 ? 'guess' : 'guesses'} correct`}
					>
						<span {...stylex.props(styles.visuallyHidden)}>success rate </span>
						<Numeric xstyle={styles.secondary}>{rate}%</Numeric>
					</span>
				</>
			)}
			{streak !== null && (
				<>
					<span aria-hidden {...stylex.props(styles.divider)} />
					<span title={best ?? undefined} {...stylex.props(styles.secondary)}>
						{streak}
						{/* The tooltip is for the pointer; this is for everyone else. */}
						{best && (
							<span {...stylex.props(styles.visuallyHidden)}>. {best}.</span>
						)}
					</span>
				</>
			)}
		</Pill>
	);
}
