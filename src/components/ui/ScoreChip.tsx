import * as stylex from '@stylexjs/stylex';
import { Numeric } from './Numeric';
import { Pill } from './Pill';
import { styles } from './ScoreChip.styles';

/**
 * The running score, always visible (rule R1) - it may be negative - with
 * the success rate beside it once anything has resolved (product spec §6.5).
 * The score stays the primary number; the rate is secondary text.
 */
export function ScoreChip({
	score,
	wins,
	losses,
	rate,
}: {
	score: number;
	wins: number;
	losses: number;
	/** Whole percent, or null before the first result. */
	rate: number | null;
}) {
	const resolved = wins + losses;
	return (
		<Pill>
			<span>Score</span>
			<Numeric xstyle={styles.value}>{score}</Numeric>
			{rate !== null && (
				<>
					<span aria-hidden {...stylex.props(styles.divider)} />
					<span
						title={`${wins} of ${resolved} ${resolved === 1 ? 'guess' : 'guesses'} correct`}
					>
						<span {...stylex.props(styles.visuallyHidden)}>success rate </span>
						<Numeric xstyle={styles.rate}>{rate}%</Numeric>
					</span>
				</>
			)}
		</Pill>
	);
}
