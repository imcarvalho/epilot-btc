import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { styles } from './Pill.styles';

/** A fully rounded, outlined chip: the source badge, the score, the player. */
export function Pill({
	children,
	size = 'md',
	xstyle,
}: {
	children: ReactNode;
	size?: 'sm' | 'md';
	xstyle?: stylex.StyleXStyles;
}) {
	return (
		<span {...stylex.props(styles.base, styles[size], xstyle)}>{children}</span>
	);
}
