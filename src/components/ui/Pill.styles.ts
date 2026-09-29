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
	// A little lower on a phone, where the header's chips stack.
	md: {
		fontSize: {
			default: 'var(--font-size-base)',
			'@media (max-width: 640px)': 'var(--font-size-sm)',
		},
		gap: {
			default: 'var(--spacing-2)',
			'@media (max-width: 640px)': 'var(--spacing-1-5)',
		},
		minHeight: {
			default: 'var(--size-element-lg)',
			'@media (max-width: 640px)': 32,
		},
		paddingInline: {
			default: 'var(--spacing-4)',
			'@media (max-width: 640px)': 'var(--spacing-3)',
		},
	},
});
