/**
 * axe-core against WCAG 2.2 A and AA plus its best-practice rules, failing
 * with every violation spelled out rather than a count.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const RULES = [
	'wcag2a',
	'wcag2aa',
	'wcag21a',
	'wcag21aa',
	'wcag22aa',
	'best-practice',
];

/** Runs axe and fails with every violation spelled out, not a count. */
export async function expectNoViolations(page: Page) {
	const { violations } = await new AxeBuilder({
		page,
	})
		.withTags(RULES)
		.analyze();
	const report = violations.map(
		(v) =>
			`${v.id} (${v.impact}): ${v.help}\n${v.nodes
				.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`)
				.join('\n')}`,
	);
	expect(report, report.join('\n\n')).toEqual([]);
}
