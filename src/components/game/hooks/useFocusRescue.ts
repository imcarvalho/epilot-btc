import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps keyboard focus from falling to `<body>` when the element holding it
 * is removed by a re-render - the chart's view toggle and slider when a guess
 * resolves, a banner's Dismiss, the error panel's "Try again". Without this a
 * keyboard or screen reader user loses their place every round (WCAG 2.4.3).
 *
 * It remembers the last element focused inside `scope` and, after each
 * render, if that element has left the document and nothing else has focus,
 * moves focus to `fallback`.
 */
export function useFocusRescue(
	scope: RefObject<HTMLElement | null>,
	fallback: RefObject<HTMLElement | null>,
): void {
	const lastFocused = useRef<Element | null>(null);

	useEffect(() => {
		const root = scope.current;
		if (!root) {
			return;
		}
		const remember = (event: FocusEvent) => {
			lastFocused.current = event.target as Element;
		};
		root.addEventListener('focusin', remember);
		return () => root.removeEventListener('focusin', remember);
	}, [scope]);

	// After every render: removals all happen in one, so this is where to look.
	useEffect(() => {
		const lost = lastFocused.current;
		const active = document.activeElement;
		if (
			lost &&
			!lost.isConnected &&
			(active === null || active === document.body)
		) {
			lastFocused.current = null;
			fallback.current?.focus();
		}
	});
}
