export interface SweepTriggerDeps {
	url: string;
	getSecret: () => Promise<string>;
	fetchImpl?: typeof fetch;
	log?: (line: string) => void;
}

export type SweepTriggerHandler = (
	event?: unknown,
	context?: { awsRequestId?: string },
) => Promise<unknown>;

export function createHandler(deps: SweepTriggerDeps): SweepTriggerHandler;

export const handler: SweepTriggerHandler;
