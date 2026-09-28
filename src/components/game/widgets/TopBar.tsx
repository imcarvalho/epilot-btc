import * as stylex from '@stylexjs/stylex';
import { Download, LogOut } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import type { Stats } from '@/lib/contracts';
import { signInWithGoogle, signOutOfGoogle } from '@/app/actions';
import { BrandMark, PlayerChip, ScoreChip, SourceBadge } from '@/components/ui';
import { styles } from './TopBar.styles';

export function TopBar({
	player,
	isLive,
	source,
}: {
	/** Null while the first state read is in flight. */
	player: {
		name: string;
		score: number;
		stats: Stats;
		signedIn: boolean;
	} | null;
	isLive: boolean;
	source: 'candles' | 'ticker';
}) {
	return (
		<header {...stylex.props(styles.bar)}>
			<div {...stylex.props(styles.group)}>
				<BrandMark />
				<h1 {...stylex.props(styles.title)}>BTC Guess</h1>
				<SourceBadge isLive={isLive} source={source} />
			</div>
			<div {...stylex.props(styles.group, styles.end)}>
				{player ? (
					<>
						<ScoreChip score={player.score} stats={player.stats} />
						<PlayerChip name={player.name} />
					</>
				) : (
					<Skeleton width="min(320px, 80vw)" height={48} />
				)}
				{/* Plain forms posting to server actions: they work before hydration. */}
				{player?.signedIn ? (
					<form action={signOutOfGoogle}>
						<Button
							type="submit"
							label="Sign out"
							size="lg"
							variant="secondary"
							icon={<Icon icon={LogOut} size="sm" />}
						/>
					</form>
				) : (
					<form action={signInWithGoogle}>
						<Button
							type="submit"
							label="Sign in to save your score"
							size="lg"
							variant="secondary"
							icon={<Icon icon={Download} size="sm" color="accent" />}
						/>
					</form>
				)}
			</div>
		</header>
	);
}
