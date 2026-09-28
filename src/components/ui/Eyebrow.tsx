import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { styles } from './Eyebrow.styles';

/**
 * Small, spaced, upper-case label above a figure ("BITCOIN · US DOLLAR").
 * `as="h2"` when it is the only title a panel has, so the panel is reachable
 * by heading like the others; the look does not change.
 */
export function Eyebrow({
	children,
	as: Element = 'p',
	id,
}: {
	children: ReactNode;
	as?: 'p' | 'h2';
	id?: string;
}) {
	return (
		<Element id={id} {...stylex.props(styles.base)}>
			{children}
		</Element>
	);
}
