import * as stylex from '@stylexjs/stylex';
import { palette } from '@/components/ui/tokens.stylex';

export const styles = stylex.create({
	future: {
		fill: 'rgba(0, 0, 0, 0.18)',
	},
	area: {
		stroke: 'none',
	},
	aheadArea: {
		fill: 'rgba(125, 251, 170, 0.14)',
	},
	behindArea: {
		fill: 'rgba(255, 138, 138, 0.14)',
	},
	levelArea: {
		fill: 'rgba(241, 250, 140, 0.08)',
	},
	offArea: {
		fill: 'rgba(255, 255, 255, 0.04)',
	},
	line: {
		fill: 'none',
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		strokeWidth: 2,
	},
	aheadLine: {
		stroke: palette.upFrom,
	},
	behindLine: {
		stroke: 'var(--color-error)',
	},
	levelLine: {
		stroke: palette.yellow,
	},
	offLine: {
		stroke: 'var(--color-text-disabled)',
	},
	aheadDot: {
		fill: palette.upFrom,
	},
	behindDot: {
		fill: 'var(--color-error)',
	},
	levelDot: {
		fill: palette.yellow,
	},
	offDot: {
		fill: 'var(--color-text-disabled)',
	},
	note: {
		color: 'var(--color-text-secondary)',
		fontSize: 'var(--font-size-sm)',
		insetBlockStart: 'var(--spacing-2)',
		insetInlineStart: 'var(--spacing-2)',
		margin: 0,
		position: 'absolute',
	},
});
