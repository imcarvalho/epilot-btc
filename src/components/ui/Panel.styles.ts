import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	base: {
		backgroundColor: 'var(--color-background-card)',
		borderColor: 'var(--color-border)',
		borderRadius: 'var(--radius-container)',
		borderStyle: 'solid',
		borderWidth: 1,
		padding: {
			default: 'var(--spacing-10)',
			'@media (max-width: 640px)': 'var(--spacing-6)',
		},
	},
	dashed: {
		backgroundColor: 'transparent',
		borderColor: 'var(--color-border-emphasized)',
		borderStyle: 'dashed',
		paddingBlock: 'var(--spacing-6)',
	},
	warning: {
		backgroundColor: 'rgba(241, 250, 140, 0.04)',
		borderColor: 'rgba(241, 250, 140, 0.35)',
	},
	win: {
		backgroundColor: 'rgba(125, 251, 170, 0.06)',
		borderColor: 'rgba(125, 251, 170, 0.4)',
	},
	loss: {
		backgroundColor: 'rgba(255, 138, 138, 0.06)',
		borderColor: 'rgba(255, 138, 138, 0.4)',
	},
});
