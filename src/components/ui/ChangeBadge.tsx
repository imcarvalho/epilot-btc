import * as stylex from '@stylexjs/stylex';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Icon } from '@astryxdesign/core/Icon';
import { styles } from './ChangeBadge.styles';

const usd = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
});

/**
 * A signed price change with its period: "+$1,244.80 in the last hour",
 * "+$118.20 ahead". Direction is carried by the arrow and the sign as well
 * as the colour. A change of exactly zero reads as `flatLabel` instead
 * ("unchanged since your guess"), never as "+$0.00".
 */
export function ChangeBadge({
	change,
	period,
	flatLabel,
}: {
	change: number;
	period: string;
	flatLabel?: string;
}) {
	if (change === 0 && flatLabel) {
		return (
			<span {...stylex.props(styles.base, styles.flat)}>
				<Icon icon={Minus} size="sm" />
				<span>{flatLabel}</span>
			</span>
		);
	}
	const up = change >= 0;
	return (
		<span {...stylex.props(styles.base, up ? styles.up : styles.down)}>
			<Icon icon={up ? ArrowUp : ArrowDown} size="sm" />
			<span>
				{up ? '+' : '−'}
				{usd.format(Math.abs(change))} {period}
			</span>
		</span>
	);
}
