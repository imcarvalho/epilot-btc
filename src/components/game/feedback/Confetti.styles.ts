import * as stylex from '@stylexjs/stylex';

// Each piece reads its own sideways drift and spin from custom properties,
// so one animation serves all of them.
const fall = stylex.keyframes({
	from: {
		opacity: 1,
		transform: 'translate3d(0, -5vh, 0) rotate(0turn)',
	},
	'80%': {
		opacity: 1,
	},
	to: {
		opacity: 0,
		transform:
			'translate3d(var(--confetti-drift), 105vh, 0) rotate(var(--confetti-spin))',
	},
});

export const styles = stylex.create({
	layer: {
		inset: 0,
		overflow: 'hidden',
		pointerEvents: 'none',
		position: 'fixed',
		zIndex: 50,
	},
	piece: {
		animationFillMode: 'both',
		animationName: fall,
		animationTimingFunction: 'cubic-bezier(0.25, 0.6, 0.45, 1)',
		borderRadius: 2,
		position: 'absolute',
		top: 0,
	},
	placed: (
		left: string,
		delay: string,
		duration: string,
		drift: string,
		spin: string,
		width: string,
		height: string,
		colour: string,
	) => ({
		'--confetti-drift': drift,
		'--confetti-spin': spin,
		animationDelay: delay,
		animationDuration: duration,
		backgroundColor: colour,
		height,
		left,
		width,
	}),
});
