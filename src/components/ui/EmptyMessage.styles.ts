import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	base: {
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		flexGrow: 1,
		gap: 'var(--spacing-3)',
		justifyContent: 'center',
		paddingBlock: 'var(--spacing-8)',
		textAlign: 'center',
	},
	title: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-lg)',
		margin: 0,
	},
	body: {
		color: 'var(--color-text-secondary)',
		margin: 0,
		maxWidth: '30rem',
		textWrap: 'balance',
	},
});
