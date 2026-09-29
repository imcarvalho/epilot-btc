import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	// A sign-in notice can have more than one line, split by a line break in its copy.
	notice: {
		whiteSpace: 'pre-line',
	},
	page: {
		backgroundColor: 'var(--color-background-body)',
		backgroundImage: `radial-gradient(ellipse 60% 40% at 0% 0%, ${palette.pageGlow}, transparent 70%)`,
		minHeight: '100vh',
	},
	column: {
		display: 'flex',
		flexDirection: 'column',
		// On a phone the header's last row (the score) sits as far from the content as from the row above it (the top bar's row gap).
		gap: {
			default: 'var(--spacing-5)',
			'@media (max-width: 640px)': 'var(--spacing-3)',
		},
		marginInline: 'auto',
		maxWidth: 1440,
		paddingBlock: {
			default: 'var(--spacing-8)',
			'@media (max-width: 640px)': 'var(--spacing-4)',
		},
		paddingInline: {
			default: 'var(--spacing-10)',
			'@media (max-width: 640px)': 'var(--spacing-4)',
		},
	},
	// The page's content under the top bar, spaced like the column around it.
	main: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-5)',
	},
	panels: {
		display: 'grid',
		gap: 'var(--spacing-5)',
		gridTemplateColumns: {
			default: '1fr 1fr',
			'@media (max-width: 860px)': '1fr',
		},
	},
	// The strip, the price and the buttons: the game itself.
	play: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-5)',
	},
	strip: {
		borderRadius: 'var(--radius-container)',
		outlineColor: 'var(--color-text-primary)',
		outlineOffset: 4,
		outlineStyle: {
			default: 'none',
			':focus-visible': 'solid',
		},
		outlineWidth: 2,
	},
	// Visual order only: the strip is not in the tab order. On a phone the
	// chart is 0, a result sits under it at 1, the buttons are 2 and a bare
	// prompt comes after them at 3.
	stripAfter: {
		order: {
			default: 0,
			'@media (max-width: 640px)': 3,
		},
	},
	stripUnderChart: {
		order: {
			default: 0,
			'@media (max-width: 640px)': 1,
		},
	},
	buttons: {
		order: {
			default: 0,
			'@media (max-width: 640px)': 2,
		},
	},
	retry: {
		display: 'flex',
		justifyContent: 'center',
	},
});
