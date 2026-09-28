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
		columnGap: 'var(--spacing-3)',
		display: 'grid',
		// On a phone the success rate moves under the name, so the name keeps
		// the width and is not cut to a few letters.
		gridTemplateAreas: {
			default: '"rank name rate score"',
			'@media (max-width: 640px)': '"rank name score" "rank rate score"',
		},
		gridTemplateColumns: {
			default: '2.5rem 1fr auto 3rem',
			'@media (max-width: 640px)': '2rem 1fr 3rem',
		},
		rowGap: 0,
		paddingBlock: 'var(--spacing-2)',
		paddingInline: 'var(--spacing-3)',
	},
	you: {
		backgroundColor: palette.upWash,
		borderColor: 'rgba(125, 251, 170, 0.4)',
	},
	rank: {
		color: 'var(--color-text-secondary)',
		gridArea: 'rank',
	},
	first: {
		color: palette.yellow,
	},
	name: {
		color: 'var(--color-text-primary)',
		gridArea: 'name',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	rate: {
		color: 'var(--color-text-secondary)',
		fontSize: 'var(--font-size-sm)',
		gridArea: 'rate',
	},
	score: {
		color: palette.upFrom,
		fontWeight: 'var(--font-weight-semibold)',
		gridArea: 'score',
		textAlign: 'end',
	},
	negative: {
		color: 'var(--color-error)',
	},
	gap: {
		color: 'var(--color-text-disabled)',
		textAlign: 'center',
	},
	invite: {
		alignItems: 'center',
		borderColor: 'var(--color-border-emphasized)',
		borderRadius: 'var(--radius-element)',
		borderStyle: 'dashed',
		borderWidth: 1,
		color: 'var(--color-text-secondary)',
		display: 'flex',
		gap: 'var(--spacing-2)',
		margin: 0,
		paddingBlock: 'var(--spacing-3)',
		paddingInline: 'var(--spacing-4)',
	},
	place: {
		color: 'var(--color-text-secondary)',
		fontSize: 'var(--font-size-sm)',
		margin: 0,
	},
});
