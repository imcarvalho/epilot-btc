import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	// The longest pill on the screen: on a narrow phone it wraps rather than
	// push the page sideways (WCAG 1.4.10), so it keeps its padding when it
	// runs to two lines.
	wrap: {
		paddingBlock: 'var(--spacing-1)',
		whiteSpace: 'normal',
	},
});
