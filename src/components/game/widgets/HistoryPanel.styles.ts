import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	panel: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-4)',
		minHeight: 280,
	},
	list: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-1)',
		listStyle: 'none',
		margin: 0,
		padding: 0,
	},
	row: {
		alignItems: 'center',
		borderColor: 'transparent',
		borderRadius: 'var(--radius-element)',
		borderStyle: 'solid',
		borderWidth: 1,
		display: 'grid',
		gap: 'var(--spacing-3)',
		gridTemplateColumns: '6.5rem 1fr auto 2.5rem',
		paddingBlock: 'var(--spacing-2)',
		paddingInline: 'var(--spacing-3)',
	},
	pendingRow: {
		borderColor: 'var(--color-border-emphasized)',
		borderStyle: 'dashed',
	},
	highlightWin: {
		backgroundColor: palette.upWash,
		borderColor: 'rgba(125, 251, 170, 0.4)',
	},
	highlightLoss: {
		backgroundColor: 'rgba(255, 138, 138, 0.06)',
		borderColor: 'rgba(255, 138, 138, 0.4)',
	},
	direction: {
		alignItems: 'center',
		display: 'inline-flex',
		gap: 'var(--spacing-1)',
	},
	up: {
		color: palette.upFrom,
	},
	down: {
		color: palette.downTo,
	},
	prices: {
		color: 'var(--color-text-primary)',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	outcome: {
		fontSize: 'var(--font-size-sm)',
	},
	points: {
		fontWeight: 'var(--font-weight-semibold)',
		textAlign: 'end',
	},
	win: {
		color: palette.upFrom,
	},
	loss: {
		color: 'var(--color-error)',
	},
	waiting: {
		color: 'var(--color-text-secondary)',
	},
});
