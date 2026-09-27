import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	pill: {
		paddingInlineStart: 'var(--spacing-1-5)',
	},
	avatar: {
		display: 'inline-flex',
		transform: 'scale(1.25)',
		marginInline: 'var(--spacing-1)',
	},
	name: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-lg)',
		fontWeight: 'var(--font-weight-medium)',
	},
});
