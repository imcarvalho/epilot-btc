import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	pill: {
		paddingInlineStart: 'var(--spacing-1-5)',
	},
	avatar: {
		display: 'inline-flex',
		transform: {
			default: 'scale(1.25)',
			'@media (max-width: 640px)': 'none',
		},
		marginInline: {
			default: 'var(--spacing-1)',
			'@media (max-width: 640px)': 0,
		},
	},
	name: {
		color: 'var(--color-text-primary)',
		fontSize: {
			default: 'var(--font-size-lg)',
			'@media (max-width: 640px)': 'var(--font-size-sm)',
		},
		fontWeight: 'var(--font-weight-medium)',
	},
});
