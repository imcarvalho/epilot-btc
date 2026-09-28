'use client';

import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { YTick } from '@/lib/axis';
import { nearestIndex, stepIndex } from '@/lib/chart-inspect';
import { formatAxisPrice, type Readout } from '../utils';
import { styles } from './chart-parts.styles';

/** Both charts share one height, so switching views does not move the page. */
export const CHART_HEIGHT = 300;
export const CHART_PADDING = 12;
/**
 * Room on the right for the price labels, the same on both charts so the
 * plot does not shift when the view switches. "84,531.50", the longest
 * label, is about 65px in the chart's 12px monospace type; with the 8px gap
 * before it that leaves a little room.
 */
export const Y_AXIS_GUTTER = 80;

/** The plot's width: the chart's, less the price-axis gutter. */
export const plotWidthOf = (width: number) =>
	Math.max(0, width - Y_AXIS_GUTTER);

/** Width of an element, tracked as it resizes. The charts are drawn in real pixels. */
export function useWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}

/**
 * The price axis: a light gridline at each round price across the plot,
 * labelled in the gutter to its right. The labels are part of the picture,
 * not extra information for assistive technology: the chart's summary and
 * the inspector already give every price as a sentence.
 */
export function GridLines({
	plotWidth,
	ticks,
	step,
}: {
	plotWidth: number;
	ticks: YTick[];
	step: number;
}) {
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
					x={plotWidth + 8}
					y={t.y}
					dominantBaseline="middle"
					{...stylex.props(styles.yLabel)}
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
	const tagWidth = label.length * 7.4 + 18;
	const x = Math.min(Math.max(0, tagX - tagWidth / 2), width - tagWidth);
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
	const tagWidth = label.length * 7 + 20;
	const left = Math.min(Math.max(0, x - tagWidth / 2), width - tagWidth);
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
	inset = Y_AXIS_GUTTER,
}: {
	ticks: {
		at: number;
		label: string;
	}[];
	inset?: number;
}) {
	return (
		<div aria-hidden {...stylex.props(styles.axis, styles.axisInset(inset))}>
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
 * Home and End jump, Escape puts it away. A screen reader hears each tick's
 * `aria-valuetext` as it moves, so the tooltip is never the only way in.
 *
 * The picture underneath keeps its own summary as its accessible name.
 */
export function Inspector({
	xs,
	index,
	onIndex,
	label,
	valueText,
}: {
	/** Each tick's x, ascending. */
	xs: number[];
	index: number | null;
	onIndex: (index: number | null) => void;
	label: string;
	valueText: (index: number) => string;
}) {
	const last = xs.length - 1;
	const shown = index ?? last;
	const pick = (e: PointerEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const next = nearestIndex(xs, e.clientX - rect.left);
		if (next !== index) {
			onIndex(next);
		}
	};
	return (
		<div
			role="slider"
			tabIndex={xs.length > 0 ? 0 : -1}
			aria-label={label}
			aria-valuemin={1}
			aria-valuemax={Math.max(1, xs.length)}
			aria-valuenow={Math.max(1, shown + 1)}
			aria-valuetext={shown >= 0 ? valueText(shown) : undefined}
			onPointerMove={pick}
			onPointerDown={pick}
			// Kept while focused: a tap focuses it, and the reading stays until
			// the player looks away.
			onPointerLeave={(e) => {
				if (document.activeElement !== e.currentTarget) {
					onIndex(null);
				}
			}}
			onFocus={() => {
				if (index === null && last >= 0) {
					onIndex(last);
				}
			}}
			onBlur={() => onIndex(null)}
			onKeyDown={(e) => {
				const next = stepIndex(index, e.key, xs.length);
				if (next === undefined) {
					return;
				}
				e.preventDefault();
				onIndex(next);
			}}
			{...stylex.props(styles.inspector)}
		/>
	);
}

/** Where the inspector is: a vertical rule through the tick, and a ring on its value. */
export function Crosshair({ x, y }: { x: number; y: number }) {
	return (
		<g aria-hidden>
			<line
				x1={x}
				x2={x}
				y1={0}
				y2={CHART_HEIGHT}
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
