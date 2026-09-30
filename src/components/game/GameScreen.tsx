'use client';

import * as stylex from '@stylexjs/stylex';
import { useRef, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import type { SignInOutcome } from '@/lib/contracts';
import {
	UNREACHABLE_BODY,
	UNREACHABLE_TITLE,
	guessFailureSentence,
	guessPhase,
	priceBlocksGuess,
} from '@/lib/guess-phase';
import { signInSentence } from '@/lib/sign-in';
import { EmptyMessage, Panel } from '@/components/ui';
import { Announcer, Confetti } from './feedback';
import {
	GuessButtons,
	GuessStrip,
	HistoryPanel,
	LeaderboardPanel,
	PriceCard,
	type ChartView,
	TopBar,
} from './widgets';
import { useFocusRescue, useGame, useServerNow, useLiveMinute } from './hooks';
import { styles } from './GameScreen.styles';

/**
 * The one screen (product spec §5). Every value on it comes from the server:
 * pushed on the game stream, or returned by `POST /api/guess`, the one call
 * the player makes (engineering spec §3.1). Nothing is rendered on the server
 * but the shell (engineering spec §2.1). What the strip and the buttons show
 * is one pure function of that state and the server's clock (`guessPhase`).
 */
export function GameScreen() {
	const {
		status,
		candles,
		board,
		isLive,
		signIn,
		retry,
		placeGuess,
		isPlacing,
		guessError,
		watchedGuessId,
		seenResultId,
	} = useGame();
	const ready = status.kind === 'ready' ? status : null;
	const now = useServerNow(ready?.clockOffset ?? 0);
	const state = ready?.state ?? null;
	const phase = state
		? guessPhase(state, now, watchedGuessId, seenResultId)
		: null;

	const pending = state?.pendingGuess ?? null;
	// Nothing in play and no fresh price: nothing can be locked in.
	const priceBlocked = state !== null && priceBlocksGuess(state);
	const live = useLiveMinute(pending, state, isLive);

	// When a re-render removes the focused control, focus lands on the strip -
	// which, at the end of a round, is where the result is.
	const mainRef = useRef<HTMLElement>(null);
	const stripRef = useRef<HTMLDivElement>(null);
	useFocusRescue(mainRef, stripRef);

	// The chart follows the guess (product spec §6.1): to the minute when one
	// starts, back to the hour once it resolves. The player can switch
	// between them in the meantime.
	const [view, setView] = useState<ChartView>('hour');
	const [viewFollows, setViewFollows] = useState<string | null>(null);
	if ((pending?.id ?? null) !== viewFollows) {
		setViewFollows(pending?.id ?? null);
		setView(pending ? 'minute' : 'hour');
	}
	const isMinuteView = view === 'minute' && pending !== null;

	// Nothing in play and nothing to report: the strip is only a prompt, and
	// on a phone it steps below the buttons it points at. A warning stays on top.
	const prompting =
		(phase === null || phase.kind === 'first-visit' || phase.kind === 'idle') &&
		!priceBlocked &&
		!guessError;

	// A result on a phone reads best right under the chart it is about.
	const showingResult =
		phase?.kind === 'result' || phase?.kind === 'away-result';

	// What a sign-in did is reported once, by the stream's ticket; hold it
	// until the player dismisses it.
	const [signInSeen, setSignInSeen] = useState<SignInOutcome | null>(null);
	const [noticeOpen, setNoticeOpen] = useState(false);
	if (signIn && signIn !== signInSeen) {
		setSignInSeen(signIn);
		setNoticeOpen(true);
	}
	// Derived, because a first sign-in's welcome names the player, and the
	// name arrives with the game state.
	const notice =
		noticeOpen && signInSeen
			? signInSentence(signInSeen, state?.publicName ?? null)
			: null;

	// Failures are shown on screen, and heard: through the same announcer.
	const failure =
		status.kind === 'error'
			? `${UNREACHABLE_TITLE} ${UNREACHABLE_BODY}`
			: guessError
				? guessFailureSentence(guessError)
				: null;

	return (
		<div {...stylex.props(styles.page)}>
			<div {...stylex.props(styles.column)}>
				{/* Outside <main>, so the header is the page's banner landmark. */}
				<TopBar
					player={
						state && {
							name: state.publicName,
							score: state.score,
							stats: state.stats,
							signedIn: state.signedIn,
						}
					}
				/>
				<main ref={mainRef} {...stylex.props(styles.main)}>
					{status.kind === 'error' ? (
						<Panel>
							<EmptyMessage title={UNREACHABLE_TITLE} body={UNREACHABLE_BODY} />
							<div {...stylex.props(styles.retry)}>
								<Button
									label="Try again"
									variant="primary"
									clickAction={retry}
								/>
							</div>
						</Panel>
					) : (
						<>
							{notice && (
								// `role="note"` in place of the Banner's own live `status`: the
								// announcer already says the notice, and one live region says
								// each thing once.
								<Banner
									role="note"
									status={signInSeen === 'kept-existing' ? 'info' : 'success'}
									title={<span {...stylex.props(styles.notice)}>{notice}</span>}
									isDismissable
									onDismiss={() => setNoticeOpen(false)}
									dismissLabel="Dismiss"
								/>
							)}
							<div {...stylex.props(styles.play)}>
								{/* Focusable only by script: where focus goes when its control disappears. */}
								<div
									ref={stripRef}
									tabIndex={-1}
									{...stylex.props(
										styles.strip,
										prompting && styles.stripAfter,
										showingResult && styles.stripUnderChart,
									)}
								>
									<GuessStrip
										phase={phase}
										name={state?.publicName ?? null}
										signedIn={state?.signedIn ?? false}
										guessError={guessError}
										priceBlocked={priceBlocked}
										now={now}
										live={live}
										isMinuteView={isMinuteView}
									/>
								</div>
								<PriceCard
									price={state?.price ?? null}
									priceUpdatedAt={state?.priceUpdatedAt ?? null}
									priceStale={state?.priceStale ?? false}
									now={ready ? now : null}
									phase={phase}
									live={live}
									candles={candles}
									view={view}
									onViewChange={setView}
									isFeedLive={
										isMinuteView
											? live.isAlive
											: state
												? isLive && !state.priceStale
												: true
									}
								/>
								<div {...stylex.props(styles.buttons)}>
									<GuessButtons
										phase={phase}
										onGuess={placeGuess}
										priceBlocked={priceBlocked}
										isBusy={isPlacing}
									/>
								</div>
							</div>

							<div {...stylex.props(styles.panels)}>
								<LeaderboardPanel board={board} />
								<HistoryPanel
									history={state?.history ?? []}
									pending={state?.pendingGuess ?? null}
									resolvedCount={
										state ? state.stats.wins + state.stats.losses : 0
									}
									highlightId={
										phase?.kind === 'result' || phase?.kind === 'away-result'
											? phase.result.id
											: null
									}
								/>
							</div>
						</>
					)}
					<Announcer
						phase={phase}
						priceBlocked={state === null ? null : priceBlocked}
						notice={failure ?? notice}
					/>
					{/* A win seen as it happens, not one that settled while away. */}
					{phase?.kind === 'result' && phase.result.delta === 1 && (
						<Confetti key={phase.result.id} />
					)}
				</main>
			</div>
		</div>
	);
}
