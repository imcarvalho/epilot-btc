import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The deploy build sets VITEST_REPORTER=dot: a passing file is a dot,
		// and a failure is still printed in full. Locally, the default.
		reporters: [process.env.VITEST_REPORTER ?? 'default'],
	},
});
