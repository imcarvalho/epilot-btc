import * as stylex from '@stylexjs/stylex';
import { palette } from './tokens.stylex';

const NARROW = '@media (max-width: 640px)';

/**
 * On a phone the two buttons share a row, so each one packs tighter: the
 * arrow beside the word, the hint beneath both (a grid, with the text span
 * dissolved into it).
 */
export const styles = stylex.create({
	base: {
		alignItems: 'center',
		borderColor: 'transparent',
		borderRadius: 'var(--radius-container)',
		borderStyle: 'solid',
		borderWidth: 2,
		color: palette.ink,
		columnGap: {
			default: 'var(--spacing-5)',
			[NARROW]: 'var(--spacing-2)',
		},
		cursor: 'pointer',
		display: {
			default: 'flex',
			[NARROW]: 'grid',
		},
		fontFamily: 'inherit',
		gridTemplateAreas: {
			default: null,
			[NARROW]: '"arrow word" "hint hint"',
		},
		gridTemplateColumns: {
			default: null,
			[NARROW]: 'auto auto',
		},
		justifyContent: 'center',
		minHeight: {
			default: 172,
			[NARROW]: 88,
		},
		outlineColor: 'var(--color-text-primary)',
		outlineOffset: 4,
		outlineStyle: {
			default: 'none',
			':focus-visible': 'solid',
		},
		outlineWidth: 2,
		paddingBlock: {
			default: 0,
			[NARROW]: 'var(--spacing-3)',
		},
		paddingInline: {
			default: 'var(--spacing-6)',
			[NARROW]: 'var(--spacing-3)',
		},
		position: 'relative',
		rowGap: 'var(--spacing-1)',
		transform: {
			default: 'none',
			':hover': {
				default: 'translateY(-2px)',
				'@media (prefers-reduced-motion: reduce)': 'none',
			},
		},
		transitionDuration: 'var(--duration-fast)',
		transitionProperty: 'transform, box-shadow, filter, background-color',
		transitionTimingFunction: 'var(--ease-standard)',
		filter: {
			default: 'none',
			':hover': 'brightness(1.04)',
		},
		width: '100%',
	},
	/** `aria-disabled`: no pointer, no lift on hover. */
	inactive: {
		cursor: 'default',
		filter: 'none',
		transform: 'none',
	},
	up: {
		backgroundImage: `linear-gradient(100deg, ${palette.upFrom}, ${palette.upTo})`,
		boxShadow: `0 16px 48px -16px ${palette.upGlow}`,
	},
	down: {
		backgroundImage: `linear-gradient(100deg, ${palette.downFrom}, ${palette.downTo})`,
		boxShadow: `0 16px 48px -16px ${palette.downGlow}`,
	},
	chosenUp: {
		borderColor: palette.green,
		boxShadow: `0 0 0 4px ${palette.upWash}, 0 16px 48px -16px ${palette.upGlow}`,
	},
	chosenDown: {
		borderColor: palette.pink,
		boxShadow: `0 0 0 4px ${palette.downWash}, 0 16px 48px -16px ${palette.downGlow}`,
	},
	muted: {
		backgroundColor: 'var(--color-background-card)',
		borderColor: 'var(--color-border)',
		borderWidth: 1,
		color: 'var(--color-text-disabled)',
	},
	arrow: {
		flexShrink: 0,
		gridArea: 'arrow',
		height: {
			default: 40,
			[NARROW]: 26,
		},
		width: {
			default: 40,
			[NARROW]: 26,
		},
	},
	text: {
		alignItems: 'flex-start',
		display: {
			default: 'flex',
			[NARROW]: 'contents',
		},
		flexDirection: 'column',
		gap: 'var(--spacing-1)',
	},
	word: {
		fontSize: {
			default: 'clamp(1.75rem, 3.5vw, 2.5rem)',
			[NARROW]: '1.5rem',
		},
		gridArea: 'word',
		fontWeight: 'var(--font-weight-semibold)',
		letterSpacing: '-0.01em',
		lineHeight: 1.1,
	},
	hint: {
		color: palette.inkSoft,
		fontSize: {
			default: 'var(--font-size-lg)',
			[NARROW]: 'var(--font-size-sm)',
		},
		gridArea: 'hint',
		textAlign: {
			default: null,
			[NARROW]: 'center',
		},
	},
	mutedHint: {
		color: 'var(--color-text-disabled)',
	},
	badge: {
		alignItems: 'center',
		backgroundColor: 'rgba(26, 23, 38, 0.14)',
		borderRadius: 'var(--radius-full)',
		display: 'inline-flex',
		fontSize: 'var(--font-size-sm)',
		fontWeight: 'var(--font-weight-medium)',
		gap: 'var(--spacing-1)',
		insetBlockStart: {
			default: 'var(--spacing-3)',
			[NARROW]: 'var(--spacing-2)',
		},
		insetInlineEnd: {
			default: 'var(--spacing-3)',
			[NARROW]: 'var(--spacing-2)',
		},
		paddingBlock: {
			default: 'var(--spacing-1)',
			[NARROW]: 3,
		},
		paddingInline: {
			default: 10,
			[NARROW]: 3,
		},
		position: 'absolute',
	},
	// On a phone the badge is just the tick: the word would sit on the arrow.
	// The ring round the button says "chosen" as well.
	badgeWord: {
		display: {
			default: 'inline',
			[NARROW]: 'none',
		},
	},
});
