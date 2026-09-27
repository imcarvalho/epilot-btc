'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { confettiPieces } from '@/lib/confetti';
import { styles } from './Confetti.styles';

const PIECES = 80;
/** Longest delay plus longest fall, with a little room. */
const LIFETIME_MS = 3_200;

/**
 * Confetti for a correct guess (product spec §6.4): winning is loud, losing
 * is quiet. Decorative, so hidden from assistive technology - the result is
 * announced in words by the live region - and not shown at all when the
 * system asks for reduced motion (engineering spec §7.2).
 *
 * Mount it keyed on the result, so each win plays it exactly once. It
 * removes itself when the last piece has landed.
 */
export function Confetti() {
	// Read once, on the client, when the win arrives. Starting from "reduced"
	// means nothing flashes before the preference is known.
	const [pieces] = useState(() =>
		typeof window !== 'undefined' &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
			? confettiPieces(PIECES, Math.random)
			: [],
	);
	const [done, setDone] = useState(pieces.length === 0);

	useEffect(() => {
		if (done) return;
		const id = setTimeout(() => setDone(true), LIFETIME_MS);
		return () => clearTimeout(id);
	}, [done]);

	if (done) return null;

	return (
		<div aria-hidden {...stylex.props(styles.layer)}>
			{pieces.map((p, i) => (
				<span
					key={i}
					{...stylex.props(
						styles.piece,
						styles.placed(
							`${p.left}%`,
							`${p.delayMs}ms`,
							`${p.durationMs}ms`,
							`${p.driftPx}px`,
							`${p.spin}turn`,
							`${p.widthPx}px`,
							`${p.heightPx}px`,
							p.colour,
						),
					)}
				/>
			))}
		</div>
	);
}
