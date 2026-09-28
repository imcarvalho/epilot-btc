import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

/**
 * Shared frame styles, compiled here: StyleX resolves values at build time,
 * so another file cannot build its own from CHART_HEIGHT.
 */
export const frame = stylex.create({
	wrap: {
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--spacing-4)',
		marginTop: 'var(--spacing-8)',
	},
	plot: {
		height: 300,
		position: 'relative',
		width: '100%',
	},
});

export const styles = stylex.create({
	grid: {
		stroke: 'var(--color-border)',
		strokeWidth: 1,
	},
	locked: {
		stroke: palette.yellow,
		strokeDasharray: '8 6',
		strokeWidth: 1.5,
	},
	tag: {
		fill: '#16171F',
		stroke: 'var(--color-border)',
		strokeWidth: 1,
	},
	tagText: {
		fontFamily: 'var(--font-family-code)',
		fontSize: 13,
	},
	lockedText: {
		fill: palette.yellow,
	},
	ahead: {
		fill: palette.upFrom,
	},
	behind: {
		fill: 'var(--color-error)',
	},
	level: {
		fill: palette.yellow,
	},
	yLabel: {
		fill: 'var(--color-text-secondary)',
		fontFamily: 'var(--font-family-code)',
		fontSize: 12,
	},
	axis: {
		color: 'var(--color-text-secondary)',
		fontFamily: 'var(--font-family-code)',
		fontSize: 'var(--font-size-sm)',
		height: '1.25em',
		position: 'relative',
	},
	axisInset: (px: number) => ({
		marginInlineEnd: `${px}px`,
	}),
	// The two ends align to the edges; the rest centre on their mark.
	tick: (at: number) => ({
		left: `${at * 100}%`,
		position: 'absolute',
		transform:
			at === 0 ? 'none' : at === 1 ? 'translateX(-100%)' : 'translateX(-50%)',
		whiteSpace: 'nowrap',
	}),
	inspector: {
		borderRadius: 'var(--radius-inner)',
		cursor: 'crosshair',
		inset: 0,
		outlineColor: palette.purple,
		outlineOffset: 4,
		outlineStyle: {
			default: 'none',
			':focus-visible': 'solid',
		},
		outlineWidth: 2,
		position: 'absolute',
		// Vertical swipes still scroll the page; horizontal ones scrub.
		touchAction: 'pan-y',
	},
	crosshair: {
		pointerEvents: 'none',
		stroke: 'var(--color-text-secondary)',
		strokeDasharray: '2 4',
		strokeWidth: 1,
	},
	crosshairDot: {
		fill: '#16171F',
		pointerEvents: 'none',
		stroke: 'var(--color-text-primary)',
		strokeWidth: 2,
	},
	tip: {
		backgroundColor: '#16171F',
		borderColor: 'var(--color-border)',
		borderRadius: 'var(--radius-inner)',
		borderStyle: 'solid',
		borderWidth: 1,
		boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
		fontFamily: 'var(--font-family-code)',
		fontSize: 13,
		insetBlockStart: 'var(--spacing-2)',
		minWidth: 150,
		paddingBlock: 'var(--spacing-2)',
		paddingInline: 'var(--spacing-3)',
		pointerEvents: 'none',
		position: 'absolute',
		whiteSpace: 'nowrap',
	},
	// Right of the crosshair on the left half, left of it on the right half.
	tipAt: (x: number, flip: boolean) => ({
		left: `${x}px`,
		transform: flip ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)',
	}),
	tipTitle: {
		color: 'var(--color-text-primary)',
		marginBottom: 'var(--spacing-1)',
	},
	tipRows: {
		display: 'grid',
		gap: 2,
		margin: 0,
	},
	tipRow: {
		display: 'flex',
		gap: 'var(--spacing-3)',
		justifyContent: 'space-between',
	},
	tipLabel: {
		color: 'var(--color-text-secondary)',
	},
	tipValue: {
		color: 'var(--color-text-primary)',
		fontVariantNumeric: 'tabular-nums',
		margin: 0,
	},
});
