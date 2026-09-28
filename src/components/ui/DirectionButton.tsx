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
 *
 * Disabled means `aria-disabled`, not `disabled`: the button keeps focus when
 * it is pressed and stays in the tab order, so a keyboard or screen reader
 * user neither loses their place nor misses the hint that says why it is
 * unavailable ("your guess is in play", "one guess at a time").
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
	const inactive = isDisabled || mode !== 'ready';

	return (
		<button
			type="button"
			// Named as one phrase ("Higher, in 60 seconds"): the word and the hint
			// are separate blocks, which a name built from content splits oddly.
			// It starts with the visible word, so voice control still finds it.
			aria-label={`${word}, ${hint}`}
			aria-disabled={inactive || undefined}
			onClick={inactive ? undefined : onClick}
			{...stylex.props(
				styles.base,
				inactive && styles.inactive,
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
				// The hint already says so ("your guess is in play"): the badge is for the eye.
				<span aria-hidden {...stylex.props(styles.badge)}>
					<Check size={14} strokeWidth={3} />
					chosen
				</span>
			)}
		</button>
	);
}
