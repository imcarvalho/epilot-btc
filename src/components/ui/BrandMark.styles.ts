import * as stylex from '@stylexjs/stylex';
import { palette } from './tokens.stylex';

export const styles = stylex.create({
	tile: {
		alignItems: 'center',
		backgroundImage: `linear-gradient(135deg, ${palette.upFrom}, ${palette.upTo} 50%, ${palette.downTo})`,
		borderRadius: 'var(--radius-element)',
		color: palette.ink,
		display: 'inline-flex',
		height: 40,
		justifyContent: 'center',
		width: 40,
	},
});
