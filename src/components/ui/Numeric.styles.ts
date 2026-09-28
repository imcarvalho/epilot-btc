import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
	base: {
		fontFamily: 'var(--font-family-code)',
		fontVariantNumeric: 'tabular-nums',
	},
	hero: {
		color: 'var(--color-text-primary)',
		// Narrower on a phone, so eleven characters of monospace fit a 320 px
		// screen without scrolling sideways (WCAG 1.4.10).
		fontSize: {
			default: 'clamp(2.75rem, 6vw, 4.5rem)',
			'@media (max-width: 640px)': 'clamp(2rem, 9vw, 2.75rem)',
		},
		fontWeight: 'var(--font-weight-bold)',
		letterSpacing: '-0.02em',
		lineHeight: 1,
	},
});
