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
		columnGap: {
			default: 'var(--spacing-3)',
			'@media (max-width: 640px)': 'var(--spacing-2)',
		},
		display: 'grid',
		// The lock time leads the row, as the chart is read left to right. On a
		// phone the prices, which are what this panel is for (product spec
		// §6.5), get a line of their own under the time, the direction and the
		// outcome, rather than a squeezed column that cuts them off (WCAG
		// 1.4.10); the points column shrinks to its "+1" to make room.
		gridTemplateAreas: {
			default: '"time direction prices outcome points"',
			'@media (max-width: 640px)':
				'"time direction outcome points" "prices prices prices prices"',
		},
		gridTemplateColumns: {
			default: 'auto 6.5rem 1fr auto 2.5rem',
			'@media (max-width: 640px)': 'auto 1fr auto auto',
		},
		rowGap: {
			default: 'var(--spacing-3)',
			'@media (max-width: 640px)': 'var(--spacing-1)',
		},
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
	time: {
		color: 'var(--color-text-secondary)',
		fontSize: 'var(--font-size-sm)',
		gridArea: 'time',
	},
	direction: {
		alignItems: 'center',
		display: 'inline-flex',
		gap: 'var(--spacing-1)',
		gridArea: 'direction',
	},
	up: {
		color: palette.upFrom,
	},
	down: {
		color: palette.downTo,
	},
	prices: {
		color: 'var(--color-text-primary)',
		gridArea: 'prices',
		minWidth: 0,
		overflowWrap: 'anywhere',
	},
	outcome: {
		fontSize: 'var(--font-size-sm)',
		gridArea: 'outcome',
	},
	points: {
		fontWeight: 'var(--font-weight-semibold)',
		gridArea: 'points',
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
