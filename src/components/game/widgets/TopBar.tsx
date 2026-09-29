import * as stylex from '@stylexjs/stylex';
import { Download, LogOut } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import type { Stats } from '@/lib/contracts';
import { signInWithGoogle, signOutOfGoogle } from '@/app/actions';
import { BrandMark, PlayerChip, ScoreChip } from '@/components/ui';
import { styles } from './TopBar.styles';

/**
 * Sign out, then a full load of the page: the stream and the screen belong
 * to the signed-in player until they are torn down, and a same-page redirect
 * would keep both.
 */
async function signOutAndReload() {
	await signOutOfGoogle();
	window.location.assign('/');
}

/**
 * The title, the score and who is playing. One row on a wide screen, title
 * left and the rest right; on a phone it packs into as few rows as fit - the
 * name beside the title, then the score, then sign-in - so the game starts
 * within the first screen.
 */
export function TopBar({
	player,
}: {
	/** Null while the first state read is in flight. */
	player: {
		name: string;
		score: number;
		stats: Stats;
		signedIn: boolean;
	} | null;
}) {
	return (
		<header {...stylex.props(styles.bar)}>
			<div {...stylex.props(styles.brand)}>
				<BrandMark />
				<h1 {...stylex.props(styles.title)}>BTC Guess</h1>
			</div>
			{player ? (
				<div {...stylex.props(styles.score)}>
					<ScoreChip score={player.score} stats={player.stats} />
				</div>
			) : (
				<div {...stylex.props(styles.score)}>
					<Skeleton width="min(320px, 80vw)" height={48} />
				</div>
			)}
			{/* On a phone, a signed-in player's name and Sign out travel as one unit, so they never wrap apart. Signed out, the long sign-in button is a row of its own. */}
			<div
				{...stylex.props(
					styles.identity,
					player?.signedIn && styles.identityJoined,
				)}
			>
				{player && (
					<div {...stylex.props(styles.player)}>
						<PlayerChip name={player.name} />
					</div>
				)}
				{/* Sign-in is a plain form posting to a server action, so it works before hydration; sign-out reloads the page after, so it needs the client. */}
				<div {...stylex.props(styles.account)}>
					{player?.signedIn ? (
						<form action={signOutAndReload}>
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
			</div>
		</header>
	);
}
