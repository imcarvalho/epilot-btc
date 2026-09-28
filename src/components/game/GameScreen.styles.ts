import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	page: {
		backgroundColor: 'var(--color-background-body)',
		backgroundImage: `radial-gradient(ellipse 60% 40% at 0% 0%, ${palette.pageGlow}, transparent 70%)`,
		minHeight: '100vh',
	},
	column: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-5)',
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
	retry: {
		display: 'flex',
		justifyContent: 'center',
	},
});
