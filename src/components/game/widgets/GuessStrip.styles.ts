import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	compact: {
		paddingBlock: 'var(--spacing-5)',
		paddingInline: {
			default: 'var(--spacing-6)',
			'@media (max-width: 640px)': 'var(--spacing-4)',
		},
	},
	row: {
		alignItems: 'center',
		display: 'flex',
		gap: 'var(--spacing-4)',
	},
	stack: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-0-5)',
		minWidth: 0,
	},
	sparkle: {
		color: palette.purple,
		display: 'inline-flex',
		flexShrink: 0,
	},
	lead: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-xl)',
		margin: 0,
	},
	sub: {
		color: 'var(--color-text-secondary)',
		margin: 0,
	},
	warn: {
		color: 'var(--color-warning)',
	},
	locked: {
		alignItems: 'center',
		display: 'grid',
		gap: 'var(--spacing-6)',
		gridTemplateColumns: {
			default: 'auto auto 1fr',
			'@media (max-width: 860px)': '1fr 1fr',
		},
	},
	lockedNoClock: {
		gridTemplateColumns: {
			default: 'auto 1fr',
			'@media (max-width: 860px)': '1fr',
		},
	},
	lockedWithMoved: {
		gridTemplateColumns: {
			default: 'auto auto 1fr auto',
			'@media (max-width: 860px)': '1fr 1fr',
		},
	},
	movedBox: {
		alignItems: 'center',
		borderRadius: 'var(--radius-element)',
		borderStyle: 'solid',
		borderWidth: 1,
		display: 'flex',
		fontSize: 'var(--font-size-sm)',
		gap: 'var(--spacing-3)',
		paddingBlock: 'var(--spacing-2)',
		paddingInline: 'var(--spacing-4)',
	},
	movedYes: {
		backgroundColor: 'rgba(125, 251, 170, 0.06)',
		borderColor: 'rgba(125, 251, 170, 0.35)',
		color: palette.upFrom,
	},
	movedFlat: {
		backgroundColor: 'rgba(241, 250, 140, 0.06)',
		borderColor: 'rgba(241, 250, 140, 0.35)',
		color: palette.yellow,
	},
	movedFigure: {
		color: 'var(--color-text-secondary)',
	},
	strong: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-lg)',
		fontWeight: 'var(--font-weight-medium)',
	},
	muted: {
		color: 'var(--color-text-secondary)',
		fontSize: 'var(--font-size-sm)',
	},
	flush: {
		margin: 0,
	},
	lockedPrice: {
		color: palette.yellow,
	},
	clock: {
		borderInlineStartColor: 'var(--color-border)',
		borderInlineStartStyle: 'solid',
		borderInlineStartWidth: 1,
		paddingInlineStart: 'var(--spacing-6)',
	},
	clockIcon: {
		color: palette.purple,
		display: 'inline-flex',
	},
	countdown: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-3xl)',
		fontWeight: 'var(--font-weight-bold)',
		lineHeight: 1,
	},
	countdownDone: {
		color: palette.yellow,
	},
	progress: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-2)',
		gridColumn: {
			default: 'auto',
			'@media (max-width: 860px)': '1 / -1',
		},
	},
	result: {
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: 'var(--spacing-4)',
		justifyContent: 'space-between',
	},
	headline: {
		color: 'var(--color-text-primary)',
		fontSize: 'var(--font-size-xl)',
		fontWeight: 'var(--font-weight-semibold)',
		margin: 0,
	},
	scoreBox: {
		alignItems: 'baseline',
		borderRadius: 'var(--radius-element)',
		borderStyle: 'solid',
		borderWidth: 1,
		display: 'flex',
		gap: 'var(--spacing-2)',
		paddingBlock: 'var(--spacing-2)',
		paddingInline: 'var(--spacing-5)',
	},
	scoreBoxWin: {
		borderColor: 'rgba(125, 251, 170, 0.4)',
	},
	scoreBoxLoss: {
		borderColor: 'rgba(255, 138, 138, 0.4)',
	},
	delta: {
		fontSize: 'var(--font-size-3xl)',
		fontWeight: 'var(--font-weight-bold)',
	},
	deltaWin: {
		color: palette.upFrom,
	},
	deltaLoss: {
		color: 'var(--color-error)',
	},
});
