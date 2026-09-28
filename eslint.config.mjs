import tseslint from 'typescript-eslint';

/**
 * One rule, deliberately: braces on every if, else and loop body, never a
 * single-line `if (x) return y;`. Formatting otherwise belongs to Prettier.
 * `npm run lint -- --fix` applies it.
 */
export default tseslint.config(
	{
		ignores: [
			'node_modules/',
			'.next/',
			'.dynamodb/',
			'.playwright-mcp/',
			'coverage/',
			'infra/node_modules/',
			'infra/cdk.out/',
			'next-env.d.ts',
			'src/themes/dracula.js',
			'src/themes/dracula.d.ts',
		],
	},
	{
		files: ['**/*.{ts,tsx,mts,js,mjs}'],
		languageOptions: { parser: tseslint.parser },
		rules: { curly: ['error', 'all'] },
	},
);
