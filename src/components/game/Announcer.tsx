'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import type { GuessPhase } from '@/lib/guess-phase';
import { resultSentence } from '@/lib/guess-phase';
import { formatAge, formatUsd } from './format';
import { styles } from './Announcer.styles';

/** The sentence for a phase change, or null for one that needs no announcement. */
function announcementFor(phase: GuessPhase): string | null {
	switch (phase.kind) {
		case 'locked':
			return `Locked at ${formatUsd(phase.guess.priceAtGuess)}. ${phase.secondsLeft}s to go.`;
		case 'time-up':
			return 'Time is up - waiting for the price to change.';
		case 'stale':
			return `Price feed delayed. Last updated ${formatAge(phase.ageMs)}. Nothing is settled until it catches up.`;
		case 'result':
			return resultSentence(phase.result, phase.score);
		default:
			return null;
	}
}

/**
 * The one `aria-live="polite"` region (engineering spec §7.2): each change
 * of phase is announced once, as the full sentence from product spec §7 -
 * not every tick of the countdown.
 */
export function Announcer({ phase }: { phase: GuessPhase | null }) {
	const [message, setMessage] = useState('');
	const key =
		phase === null
			? ''
			: `${phase.kind}:${'guess' in phase ? phase.guess.id : phase.kind === 'result' ? phase.result.id : ''}`;

	useEffect(() => {
		if (phase === null) return;
		const text = announcementFor(phase);
		if (text) setMessage(text);
		// Keyed on the phase and its guess, not on the phase object: the
		// countdown ticking every second is not news.
	}, [key]);

	return (
		<div
			aria-live="polite"
			role="status"
			{...stylex.props(styles.visuallyHidden)}
		>
			{message}
		</div>
	);
}
