import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { styles } from './Numeric.styles';

/**
 * Numbers in the monospaced face with tabular figures, so a price or a score
 * that changes does not make the text around it jump (engineering spec §7.2).
 */
export function Numeric({
	children,
	size = 'inherit',
	xstyle,
}: {
	children: ReactNode;
	size?: 'inherit' | 'hero';
	xstyle?: stylex.StyleXStyles;
}) {
	return (
		<span
			{...stylex.props(styles.base, size === 'hero' && styles.hero, xstyle)}
		>
			{children}
		</span>
	);
}
