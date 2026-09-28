'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LeaderboardResponse } from '@/lib/contracts';

/**
 * The board, from `GET /api/leaderboard`: on mount, when the tab becomes
 * visible again, and whenever `refreshKey` changes - the latest result's id,
 * since a result is the only thing that moves a score. A failed refresh
 * keeps the last good board; the game does not depend on it.
 */
export function useLeaderboard(
	refreshKey: string | null,
): LeaderboardResponse | null {
	const [board, setBoard] = useState<LeaderboardResponse | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch('/api/leaderboard', { cache: 'no-store' });
			if (res.ok) {
				setBoard(await res.json());
			}
		} catch {
			// Keep what is on screen.
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load, refreshKey]);

	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void load();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	}, [load]);

	return board;
}
