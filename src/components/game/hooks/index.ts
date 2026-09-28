/**
 * The screen's data, all from one game stream: the state, the hour of
 * candles, the board and the live minute - and placing a guess.
 */
export { useFocusRescue } from './useFocusRescue';
export {
	useGame,
	useServerNow,
	type GameStatus,
	type GuessError,
} from './useGame';
export { useStream, type CandlesState } from './useStream';
export { useLiveMinute, type LiveMinute } from './useLiveMinute';
