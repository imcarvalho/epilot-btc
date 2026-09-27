import * as stylex from '@stylexjs/stylex';
import type { GuessPhase } from '@/lib/guess-phase';
import type { Direction } from '@/lib/resolve-guess';
import { DirectionButton, type DirectionButtonMode } from '@/components/ui';
import { styles } from './GuessButtons.styles';

/** What each button says and does in each phase (product spec §5 screens). */
function buttonFor(
	direction: Direction,
	phase: GuessPhase | null,
): { mode: DirectionButtonMode; hint: string } {
	if (
		phase?.kind === 'locked' ||
		phase?.kind === 'time-up' ||
		phase?.kind === 'stale'
	) {
		return phase.guess.direction === direction
			? { mode: 'chosen', hint: 'your guess is in play' }
			: { mode: 'muted', hint: 'one guess at a time' };
	}
	return {
		mode: 'ready',
		hint: phase?.kind === 'result' ? 'go again' : 'in 60 seconds',
	};
}

/** The two hero actions, side by side; stacked on a narrow screen. */
export function GuessButtons({
	phase,
	onGuess,
	isBusy,
}: {
	phase: GuessPhase | null;
	onGuess: (direction: Direction) => void;
	/** Loading, or a guess on its way to the server. */
	isBusy: boolean;
}) {
	return (
		<div role="group" aria-label="Make a guess" {...stylex.props(styles.grid)}>
			{(['up', 'down'] as const).map((direction) => {
				const { mode, hint } = buttonFor(direction, phase);
				return (
					<DirectionButton
						key={direction}
						direction={direction}
						mode={mode}
						hint={hint}
						isDisabled={isBusy || phase === null}
						onClick={() => onGuess(direction)}
					/>
				);
			})}
		</div>
	);
}
