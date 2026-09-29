import 'vitest';

declare module 'vitest' {
	/** What test/dynamo-global-setup.ts provides to the integration tests. */
	export interface ProvidedContext {
		dynamoEndpoint: string;
	}
}
