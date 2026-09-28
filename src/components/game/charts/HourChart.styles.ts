import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	minute: {
		fill: 'rgba(255, 255, 255, 0.035)',
	},
	lastPrice: {
		stroke: 'var(--color-text-disabled)',
		strokeDasharray: '4 6',
		strokeWidth: 1,
	},
	wick: {
		fill: 'none',
		strokeLinecap: 'round',
		strokeWidth: 1.5,
	},
	upStroke: {
		stroke: palette.upFrom,
	},
	downStroke: {
		stroke: palette.downFrom,
	},
	upFill: {
		fill: palette.upFrom,
	},
	downFill: {
		fill: palette.downFrom,
	},
	note: {
		alignItems: 'center',
		color: 'var(--color-text-secondary)',
		display: 'flex',
		height: '100%',
		justifyContent: 'center',
		margin: 0,
	},
});
