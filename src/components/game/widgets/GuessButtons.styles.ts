import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	grid: {
		display: 'grid',
		gap: {
			default: 'var(--spacing-4)',
			'@media (max-width: 640px)': 'var(--spacing-3)',
		},
		gridTemplateColumns: '1fr 1fr',
	},
});
