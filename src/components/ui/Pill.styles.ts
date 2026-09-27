import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	base: {
		alignItems: 'center',
		backgroundColor: 'var(--color-background-muted)',
		borderColor: 'var(--color-border-emphasized)',
		borderRadius: 'var(--radius-full)',
		borderStyle: 'solid',
		borderWidth: 1,
		color: 'var(--color-text-secondary)',
		display: 'inline-flex',
		gap: 'var(--spacing-2)',
		whiteSpace: 'nowrap',
	},
	sm: {
		fontSize: 'var(--font-size-sm)',
		minHeight: 32,
		paddingInline: 'var(--spacing-3)',
	},
	md: {
		fontSize: 'var(--font-size-base)',
		minHeight: 'var(--size-element-lg)',
		paddingInline: 'var(--spacing-4)',
	},
});
