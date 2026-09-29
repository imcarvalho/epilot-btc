import * as stylex from '@stylexjs/stylex';

const NARROW = '@media (max-width: 640px)';

/**
 * One flex row that wraps. On a wide screen the brand takes the free space,
 * pushing the rest right. On a phone the name moves up beside the title (it
 * is short, the score chip is not), and each item takes a row only when it
 * has to. `order` changes only where things sit: nothing here but the
 * sign-in button is focusable, so the keyboard's path does not change.
 */
export const styles = stylex.create({
	bar: {
		alignItems: 'center',
		display: 'flex',
		flexWrap: 'wrap',
		gap: {
			default: 'var(--spacing-4)',
			[NARROW]: 'var(--spacing-2)',
		},
		rowGap: {
			default: 'var(--spacing-4)',
			[NARROW]: 'var(--spacing-3)',
		},
	},
	brand: {
		alignItems: 'center',
		display: 'flex',
		flexGrow: 1,
		gap: {
			default: 'var(--spacing-4)',
			[NARROW]: 'var(--spacing-3)',
		},
	},
	// On a phone the score has a row of its own, and sits in the middle of it.
	score: {
		display: {
			default: null,
			[NARROW]: 'flex',
		},
		flexBasis: {
			default: null,
			[NARROW]: '100%',
		},
		justifyContent: {
			default: null,
			[NARROW]: 'center',
		},
		order: {
			default: 1,
			[NARROW]: 2,
		},
	},
	// Invisible to the layout on a wide screen (and signed out), so the name
	// and the button order themselves among the header's items.
	identity: {
		display: 'contents',
	},
	// Signed in, on a phone: one nowrap unit, ahead of the score.
	identityJoined: {
		alignItems: 'center',
		display: {
			default: 'contents',
			[NARROW]: 'flex',
		},
		gap: {
			default: null,
			[NARROW]: 'var(--spacing-2)',
		},
		order: {
			default: null,
			[NARROW]: 1,
		},
	},
	player: {
		order: {
			default: 2,
			[NARROW]: 1,
		},
	},
	account: {
		order: 3,
	},
	title: {
		color: 'var(--color-text-primary)',
		fontSize: {
			default: 'var(--font-size-xl)',
			[NARROW]: 'var(--font-size-lg)',
		},
		fontWeight: 'var(--font-weight-semibold)',
		marginBlock: 0,
		marginInlineEnd: 'var(--spacing-2)',
		whiteSpace: 'nowrap',
	},
});

// On a phone Sign out matches the chips beside it: same height, padding and type.
export const signOut = stylex.create({
	button: {
		fontSize: {
			default: null,
			[NARROW]: 'var(--font-size-sm)',
		},
		height: {
			default: null,
			[NARROW]: 32,
		},
		paddingInline: {
			default: 'var(--spacing-3)',
		},
	},
});
