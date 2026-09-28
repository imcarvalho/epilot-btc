'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import {
	awaySentence,
	type GuessPhase,
	lockedSentence,
	priceBlockAnnouncement,
	resultSentence,
	staleSentence,
	TIME_UP,
} from '@/lib/guess-phase';
import { formatAge, formatUsd } from '../utils';
import { styles } from './Announcer.styles';

/** The sentence for a phase change, or null for one that needs no announcement. */
function announcementFor(phase: GuessPhase): string | null {
	switch (phase.kind) {
		case 'locked':
			return lockedSentence(
				formatUsd(phase.guess.priceAtGuess),
				phase.secondsLeft,
			);
		case 'time-up':
			return TIME_UP;
		case 'stale':
			return staleSentence(formatAge(phase.ageMs));
		case 'result':
			return resultSentence(phase.result, phase.score);
		case 'away-result':
			return awaySentence(phase.result);
		default:
			return null;
	}
}

/**
 * The one `aria-live="polite"` region (engineering spec §7.2): each change
 * of phase is announced once, as the full sentence from product spec §7 -
 * not every tick of the countdown. A one-off `notice` - what a sign-in did,
 * a guess that did not go through, the game being unreachable - goes
 * through the same region, so there is still only one.
 *
 * `priceBlocked` is the feed holding up a new guess with nothing in play
 * (`priceBlocksGuess`), or null before the first state. Entering it and
 * leaving it are each announced once: the buttons going quiet, and coming
 * back, are not left to be seen only.
 */
export function Announcer({
	phase,
	priceBlocked = null,
	notice = null,
}: {
	phase: GuessPhase | null;
	priceBlocked?: boolean | null;
	notice?: string | null;
}) {
	const [message, setMessage] = useState('');
	const wasBlocked = useRef<boolean | null>(null);
	const key =
		phase === null
			? ''
			: `${phase.kind}:${'guess' in phase ? phase.guess.id : 'result' in phase ? phase.result.id : ''}`;

	useEffect(() => {
		if (phase === null) {
			return;
		}
		const text = announcementFor(phase);
		if (text) {
			setMessage(text);
		}
		// Keyed on the phase and its guess, not on the phase object: the
		// countdown ticking every second is not news.
	}, [key]);

	useEffect(() => {
		if (priceBlocked === null) {
			return;
		}
		const text = priceBlockAnnouncement(wasBlocked.current, priceBlocked);
		wasBlocked.current = priceBlocked;
		if (text) {
			setMessage(text);
		}
	}, [priceBlocked]);

	useEffect(() => {
		if (!notice) {
			return;
		}
		// Emptied first, then set: a screen reader only speaks when the text
		// changes, and the same failure twice in a row must be heard twice.
		setMessage('');
		const timer = setTimeout(() => setMessage(notice), 100);
		return () => clearTimeout(timer);
	}, [notice]);

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
