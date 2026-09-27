import * as stylex from '@stylexjs/stylex';
import { TrendingUp } from 'lucide-react';
import { Icon } from '@astryxdesign/core/Icon';
import { styles } from './BrandMark.styles';

/** The app mark: the chart glyph on a tile blending both hero gradients. */
export function BrandMark() {
	return (
		<span aria-hidden {...stylex.props(styles.tile)}>
			<Icon icon={TrendingUp} size="md" />
		</span>
	);
}
