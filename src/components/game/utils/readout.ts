import type { Candle } from '@/lib/candles';
import type { PendingGuess } from '@/lib/contracts';
import { standing } from '@/lib/live-minute';
import { formatUsd } from './format';

/**
 * What the chart inspector says about one tick. `rows` is the tooltip on
 * screen; `text` is the same thing as a sentence, which is what a screen
 * reader announces as the inspector moves.
 */
export interface Readout {
	title: string;
	rows: { label: string; value: string }[];
	text: string;
}

const clock = new Intl.DateTimeFormat('en-GB', {
	hour: '2-digit',
	minute: '2-digit',
});

/** "14:32", in the player's own time zone. */
export const clockTime = (ms: number) => clock.format(ms);

/** "up $12.40", "down $3.10", "flat". */
export function movePhrase(delta: number): string {
	if (delta === 0) return 'flat';
	return `${delta > 0 ? 'up' : 'down'} ${formatUsd(Math.abs(delta))}`;
}

/** "ahead by $118.20", "behind by $4.10", "level". */
export function standingPhrase(margin: number): string {
	if (margin === 0) return 'level';
	return `${margin > 0 ? 'ahead' : 'behind'} by ${formatUsd(Math.abs(margin))}`;
}

/** One minute of the hour chart. */
export function candleReadout(c: Candle): Readout {
	const time = clockTime(c.time);
	const move = movePhrase(c.close - c.open);
	return {
		title: `${time} · ${move}`,
		rows: [
			{ label: 'Open', value: formatUsd(c.open) },
			{ label: 'High', value: formatUsd(c.high) },
			{ label: 'Low', value: formatUsd(c.low) },
			{ label: 'Close', value: formatUsd(c.close) },
		],
		text: `${time}: opened at ${formatUsd(c.open)}, closed at ${formatUsd(c.close)}, ${move}. High ${formatUsd(c.high)}, low ${formatUsd(c.low)}.`,
	};
}

/** One second of the minute chart, against the guess it belongs to. */
export function sampleReadout(
	point: { t: number; price: number },
	guess: Pick<PendingGuess, 'createdAt' | 'direction' | 'priceAtGuess'>,
): Readout {
	const seconds = Math.max(0, Math.round((point.t - guess.createdAt) / 1000));
	const price = formatUsd(point.price);
	if (seconds === 0)
		return {
			title: 'At your guess',
			rows: [{ label: 'Locked', value: price }],
			text: `At your guess: locked at ${price}.`,
		};
	const where = standingPhrase(
		standing(guess.direction, guess.priceAtGuess, point.price).margin,
	);
	return {
		title: `+${seconds}s`,
		rows: [
			{ label: 'Price', value: price },
			{ label: 'Guess', value: where },
		],
		text: `${seconds} ${seconds === 1 ? 'second' : 'seconds'} after your guess: ${price}, ${where}, provisional.`,
	};
}
