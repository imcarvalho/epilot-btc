import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	value: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-lg)',
		fontWeight: 'var(--font-weight-bold)',
	},
	divider: {
		alignSelf: 'stretch',
		backgroundColor: 'var(--color-border-emphasized)',
		marginBlock: 10,
		marginInline: 'var(--spacing-1)',
		width: 1,
	},
	secondary: {
		color: 'var(--color-text-secondary)',
	},
	visuallyHidden: {
		border: 0,
		clip: 'rect(0 0 0 0)',
		height: 1,
		margin: -1,
		overflow: 'hidden',
		padding: 0,
		position: 'absolute',
		whiteSpace: 'nowrap',
		width: 1,
	},
});
