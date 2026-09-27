/**
 * The screen's data: the game state and its cadence, the hour of candles,
 * and the live minute's ticker.
 */
export { useCandles, type CandlesState } from './useCandles';
export {
	useGame,
	useServerNow,
	type GameStatus,
	type TickerSnapshot,
	type GuessError,
} from './useGame';
export { useLiveMinute, type LiveMinute } from './useLiveMinute';
