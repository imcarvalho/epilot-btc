export interface SweepTriggerDeps {
  url: string
  getSecret: () => Promise<string>
  fetchImpl?: typeof fetch
  log?: (line: string) => void
}

export function createHandler(deps: SweepTriggerDeps): () => Promise<unknown>

export const handler: () => Promise<unknown>
