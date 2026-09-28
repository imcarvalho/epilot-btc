import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

/**
 * Two layout rules Prettier does not enforce, deliberately nothing else:
 *
 * - braces on every if, else and loop body, never a single-line
 *   `if (x) return y;`;
 * - every non-empty object literal broken over lines, never `{ ask: false }`
 *   on one. Prettier keeps an object expanded once it is, so the two agree.
 *
 * Formatting otherwise belongs to Prettier. `npm run lint -- --fix` applies
 * both, then `npm run format` settles the result.
 */
export default tseslint.config(
	{
		ignores: [
			'node_modules/',
			'.next/',
			'.dynamodb/',
			'.playwright-mcp/',
			'coverage/',
			'test-results/',
			'playwright-report/',
			'.playwright-browsers/',
			'infra/node_modules/',
			'infra/cdk.out/',
			'next-env.d.ts',
			'src/themes/dracula.js',
			'src/themes/dracula.d.ts',
			'src/themes/dracula.variants.d.ts',
		],
	},
	{
		files: ['**/*.{ts,tsx,mts,js,mjs}'],
		languageOptions: {
			parser: tseslint.parser,
		},
		plugins: {
			'@stylistic': stylistic,
		},
		rules: {
			curly: ['error', 'all'],
			'@stylistic/object-curly-newline': [
				'error',
				{
					ObjectExpression: {
						minProperties: 1,
					},
				},
			],
		},
	},
);
