import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Pill } from './Pill';

const LABEL = {
	candles: 'Coinbase BTC/USD · 1-minute candles',
	ticker: 'Coinbase ticker · one point per second',
} as const;

/** Where the numbers on the chart come from, and whether that feed is live. */
export function SourceBadge({
	isLive,
	source = 'candles',
}: {
	isLive: boolean;
	source?: keyof typeof LABEL;
}) {
	return (
		<Pill size="sm">
			<StatusDot
				variant={isLive ? 'success' : 'warning'}
				label={isLive ? 'Live' : 'Delayed'}
			/>
			<span>
				{LABEL[source]}
				{source === 'candles' && ` · ${isLive ? 'live' : 'delayed'}`}
			</span>
		</Pill>
	);
}
