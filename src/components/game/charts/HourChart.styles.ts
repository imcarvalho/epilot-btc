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
	// Hollow, so a falling candle differs from a rising one by shape too. The
	// width is `HOLLOW_STROKE` in candles.ts, which insets the path for it.
	downHollow: {
		fill: 'none',
		stroke: palette.downFrom,
		strokeWidth: 1,
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
