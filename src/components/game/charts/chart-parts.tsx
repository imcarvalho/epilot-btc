'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { YTick } from '@/lib/axis';
import {
	focusInspection,
	indexAtTime,
	inspectKey,
	pointInspection,
	type Inspection,
} from '@/lib/chart-inspect';
import { formatAxisPrice, type Readout } from '../utils';
import { styles } from './chart-parts.styles';

/**
 * Both charts share one height, so switching views does not move the page.
 * The height is set in CSS (`frame.plot`: shorter on a phone, so the buttons
 * stay in view) and read back by `useSize`; this is the height to draw at
 * before the first measurement.
 */
export const CHART_HEIGHT = 300;
export const CHART_PADDING = 12;
/**
 * Room on the right for the price labels, the same on both charts so the
 * plot does not shift when the view switches. "84,531.50", the longest
 * label, is about 65px in the chart's 12px monospace type; with the 8px gap
 * before it that leaves a little room.
 */
const Y_AXIS_GUTTER = 80;
/**
 * Below this width the gutter would take a quarter of the plot, so the
 * labels move inside it instead, above their gridlines.
 */
const INSET_LABELS_BELOW = 480;

/** Whether the price labels sit inside the plot rather than in a gutter. */
const insetLabels = (width: number) => width < INSET_LABELS_BELOW;

/** The price-axis gutter at this chart width: none once the labels are inside. */
export const gutterOf = (width: number) =>
	insetLabels(width) ? 0 : Y_AXIS_GUTTER;

/** The plot's width: the chart's, less the price-axis gutter. */
export const plotWidthOf = (width: number) =>
	Math.max(0, width - gutterOf(width));

/**
 * An element's size, tracked as it resizes. The charts are drawn in real
 * pixels, at the size their CSS gives them.
 */
export function useSize<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [size, setSize] = useState({
		width: 0,
		height: CHART_HEIGHT,
	});
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const observer = new ResizeObserver(([entry]) =>
			setSize({
				width: entry.contentRect.width,
				height: entry.contentRect.height || CHART_HEIGHT,
			}),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, size] as const;
}

/**
 * About how wide a tag's text is: 0.6em a character in the monospace type,
 * rounded up so the box always holds its label.
 */
const tagTextWidth = (label: string, fontSize: number) =>
	Math.ceil(label.length * fontSize * 0.62);

/**
 * Where a tag of this width starts, centred on `x` but kept inside the plot.
 * The left edge wins when the tag is wider than the plot.
 */
const tagLeft = (x: number, tagWidth: number, width: number) =>
	Math.max(0, Math.min(x - tagWidth / 2, width - tagWidth));

/**
 * The price axis: a light gridline at each round price across the plot,
 * labelled in the gutter to its right - or, on a narrow chart, just above
 * the line at the plot's left edge, haloed so it reads over what is drawn
 * there. The labels are part of the picture, not extra information for
 * assistive technology: the chart's summary and the inspector already give
 * every price as a sentence.
 */
export function GridLines({
	width,
	ticks,
	step,
}: {
	/** The chart's full width, gutter included. */
	width: number;
	ticks: YTick[];
	step: number;
}) {
	const plotWidth = plotWidthOf(width);
	const inset = insetLabels(width);
	return (
		<g aria-hidden>
			<g {...stylex.props(styles.grid)}>
				{ticks.map((t) => (
					<line key={t.value} x1={0} x2={plotWidth} y1={t.y} y2={t.y} />
				))}
			</g>
			{ticks.map((t) => (
				<text
					key={t.value}
					x={inset ? 4 : plotWidth + 8}
					y={inset ? t.y - 5 : t.y}
					dominantBaseline={inset ? 'auto' : 'middle'}
					{...stylex.props(styles.yLabel, inset && styles.yLabelInset)}
				>
					{formatAxisPrice(t.value, step)}
				</text>
			))}
		</g>
	);
}

/**
 * The guess's locked price across the chart: dashed, in the one colour kept
 * for it, with a small tag. The tag sits above the line unless that would
 * run off the top.
 */
export function LockedLine({
	width,
	y,
	tagX,
	label,
}: {
	width: number;
	y: number;
	tagX: number;
	label: string;
}) {
	const tagWidth = tagTextWidth(label, 13) + 18;
	const x = tagLeft(tagX, tagWidth, width);
	const above = y - 30 >= 0;
	const tagY = above ? y - 30 : y + 8;
	return (
		<g>
			<line x1={0} x2={width} y1={y} y2={y} {...stylex.props(styles.locked)} />
			<rect
				x={x}
				y={tagY}
				width={tagWidth}
				height={22}
				rx={6}
				{...stylex.props(styles.tag)}
			/>
			<text
				x={x + tagWidth / 2}
				y={tagY + 15}
				textAnchor="middle"
				{...stylex.props(styles.tagText, styles.lockedText)}
			>
				{label}
			</text>
		</g>
	);
}

/** A tag with a coloured label, anchored to a point on the chart. */
export function PointTag({
	width,
	x,
	y,
	label,
	tone,
}: {
	width: number;
	x: number;
	y: number;
	label: string;
	tone: 'ahead' | 'behind' | 'level';
}) {
	const tagWidth = tagTextWidth(label, 13) + 20;
	const left = tagLeft(x, tagWidth, width);
	const above = y - 36 >= 0;
	const tagY = above ? y - 36 : y + 12;
	return (
		<g>
			<rect
				x={left}
				y={tagY}
				width={tagWidth}
				height={24}
				rx={6}
				{...stylex.props(styles.tag)}
			/>
			<text
				x={left + tagWidth / 2}
				y={tagY + 16}
				textAnchor="middle"
				{...stylex.props(styles.tagText, styles[tone])}
			>
				{label}
			</text>
		</g>
	);
}

/** The time axis under the plot, stopping where the price labels begin. */
export function Axis({
	ticks,
	width,
}: {
	ticks: {
		at: number;
		label: string;
	}[];
	/** The chart's full width, gutter included. */
	width: number;
}) {
	return (
		<div
			aria-hidden
			{...stylex.props(styles.axis, styles.axisInset(gutterOf(width)))}
		>
			{ticks.map((t) => (
				<span key={t.label} {...stylex.props(styles.tick(t.at))}>
					{t.label}
				</span>
			))}
		</div>
	);
}

/**
 * Reads a chart tick by tick, for the pointer and the keyboard alike. It is
 * a transparent slider laid over the plot (WAI-ARIA APG slider): hovering
 * or dragging picks the nearest tick; focused, the arrows step through them,
 * Home and End jump, Escape hides the tooltip. A screen reader hears each
 * tick's `aria-valuetext` as it moves, so the tooltip is never the only way
 * in.
 *
 * While focused, what it says changes only when the player moves it (WCAG
 * 4.1.3, 2.2.2): the tick is held by its time, so a refresh or a new second
 * does not move it, and the reading is taken at the player's own action, so
 * a minute still forming does not re-read itself every ten seconds either.
 * The next key press reads it afresh.
 *
 * The picture underneath keeps its own summary as its accessible name.
 */
export function Inspector({
	xs,
	times,
	inspection,
	onInspect,
	label,
	valueText,
}: {
	/** Each tick's x, ascending. */
	xs: number[];
	/** Each tick's time, in the same order: what an inspection holds. */
	times: number[];
	inspection: Inspection | null;
	onInspect: (inspection: Inspection | null) => void;
	label: string;
	valueText: (index: number) => string;
}) {
	// The reading as it was at the player's last action, held while focused.
	const [said, setSaid] = useState<{
		now: number;
		text: string;
	} | null>(null);
	const last = xs.length - 1;
	const held = indexAtTime(times, inspection?.time ?? null);
	const shown = held ?? last;
	const move = (next: Inspection | null, focused: boolean) => {
		onInspect(next);
		const index = indexAtTime(times, next?.time ?? null);
		if (focused && index !== null) {
			setSaid({
				now: index + 1,
				text: valueText(index),
			});
		}
	};
	const pick = (e: PointerEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const next = pointInspection(xs, times, e.clientX - rect.left);
		if (next?.time !== inspection?.time || !inspection?.shown) {
			move(next, document.activeElement === e.currentTarget);
		}
	};
	return (
		<div
			role="slider"
			tabIndex={xs.length > 0 ? 0 : -1}
			aria-label={label}
			aria-valuemin={1}
			aria-valuemax={Math.max(1, xs.length)}
			aria-valuenow={said?.now ?? Math.max(1, shown + 1)}
			aria-valuetext={said?.text ?? (shown >= 0 ? valueText(shown) : undefined)}
			onPointerMove={pick}
			onPointerDown={pick}
			// Kept while focused: a tap focuses it, and the reading stays until
			// the player looks away.
			onPointerLeave={(e) => {
				if (document.activeElement !== e.currentTarget) {
					onInspect(null);
				}
			}}
			onFocus={() => move(focusInspection(inspection, times), true)}
			onBlur={() => {
				setSaid(null);
				onInspect(null);
			}}
			onKeyDown={(e) => {
				const next = inspectKey(inspection, e.key, times);
				if (next === undefined) {
					return;
				}
				e.preventDefault();
				move(next, true);
			}}
			{...stylex.props(styles.inspector)}
		/>
	);
}

/** Where the inspector is: a vertical rule through the tick, and a ring on its value. */
export function Crosshair({
	x,
	y,
	height,
}: {
	x: number;
	y: number;
	height: number;
}) {
	return (
		<g aria-hidden>
			<line
				x1={x}
				x2={x}
				y1={0}
				y2={height}
				{...stylex.props(styles.crosshair)}
			/>
			<circle cx={x} cy={y} r={4.5} {...stylex.props(styles.crosshairDot)} />
		</g>
	);
}

/**
 * The tick's values beside the crosshair, on whichever side has room.
 * Hidden from assistive technology: the inspector already says all of it.
 */
export function ReadoutTip({
	readout,
	x,
	width,
}: {
	readout: Readout;
	x: number;
	width: number;
}) {
	const flip = x > width / 2;
	return (
		<div aria-hidden {...stylex.props(styles.tip, styles.tipAt(x, flip))}>
			<div {...stylex.props(styles.tipTitle)}>{readout.title}</div>
			<dl {...stylex.props(styles.tipRows)}>
				{readout.rows.map((row) => (
					<div key={row.label} {...stylex.props(styles.tipRow)}>
						<dt {...stylex.props(styles.tipLabel)}>{row.label}</dt>
						<dd {...stylex.props(styles.tipValue)}>{row.value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
