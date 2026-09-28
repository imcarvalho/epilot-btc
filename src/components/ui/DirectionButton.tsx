import * as stylex from '@stylexjs/stylex';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import type { Direction } from '@/lib/resolve-guess';
import { styles } from './DirectionButton.styles';

const COPY: Record<Direction, { word: string; Arrow: typeof ArrowUp }> = {
	up: {
		word: 'Higher',
		Arrow: ArrowUp,
	},
	down: {
		word: 'Lower',
		Arrow: ArrowDown,
	},
};

/**
 * - `ready`: the gradient, clickable.
 * - `chosen`: the guess in play - stays lit, ringed and marked "chosen".
 * - `muted`: the other direction while a guess runs - flat and disabled.
 */
export type DirectionButtonMode = 'ready' | 'chosen' | 'muted';

/**
 * One of the two hero actions. Direction is carried by an arrow and a word as
 * well as by the gradient, so it never depends on colour alone (engineering
 * spec §7.2). The accessible name is the visible text, e.g. "Higher in 60
 * seconds" or "Higher, your guess is in play, chosen".
 */
export function DirectionButton({
	direction,
	mode = 'ready',
	hint,
	onClick,
	isDisabled = false,
}: {
	direction: Direction;
	mode?: DirectionButtonMode;
	/** The line under the word: "in 60 seconds", "go again", ... */
	hint: string;
	onClick?: () => void;
	isDisabled?: boolean;
}) {
	const { word, Arrow } = COPY[direction];
	const lit = mode !== 'muted';

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDisabled || mode !== 'ready'}
			{...stylex.props(
				styles.base,
				lit && (direction === 'up' ? styles.up : styles.down),
				mode === 'chosen' &&
					(direction === 'up' ? styles.chosenUp : styles.chosenDown),
				mode === 'muted' && styles.muted,
			)}
		>
			<Arrow
				aria-hidden
				size={40}
				strokeWidth={2.5}
				{...stylex.props(styles.arrow)}
			/>
			<span {...stylex.props(styles.text)}>
				<span {...stylex.props(styles.word)}>{word}</span>
				<span {...stylex.props(styles.hint, !lit && styles.mutedHint)}>
					{hint}
				</span>
			</span>
			{mode === 'chosen' && (
				<span {...stylex.props(styles.badge)}>
					<Check aria-hidden size={14} strokeWidth={3} />
					chosen
				</span>
			)}
		</button>
	);
}
