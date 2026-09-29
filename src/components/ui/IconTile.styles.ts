import * as stylex from '@stylexjs/stylex';
import { palette } from './tokens.stylex';

export const styles = stylex.create({
	base: {
		alignItems: 'center',
		borderRadius: 'var(--radius-element)',
		color: palette.ink,
		display: 'inline-flex',
		flexShrink: 0,
		height: {
			default: 44,
			'@media (max-width: 640px)': 36,
		},
		justifyContent: 'center',
		width: {
			default: 44,
			'@media (max-width: 640px)': 36,
		},
	},
	up: {
		backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo})`,
	},
	down: {
		backgroundImage: `linear-gradient(135deg, ${palette.downFrom}, ${palette.downTo})`,
	},
	win: {
		backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo})`,
	},
	// Pastel coral rather than Dracula's full red (product spec §6.4).
	loss: {
		backgroundColor: 'var(--color-error)',
	},
});
