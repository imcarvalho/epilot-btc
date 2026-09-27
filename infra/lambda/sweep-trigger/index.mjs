/**
 * Calls the sweep route once (engineering spec §3.2). Invoked every minute by
 * EventBridge Scheduler, which cannot call an HTTPS endpoint on its own.
 *
 * This decides nothing: it knocks, and the route resolves whatever the
 * server's own price allows. The shared secret lives in SSM Parameter Store
 * (§8) and is read at cold start, so it never appears in the template or in
 * the function's configuration.
 *
 * No dependencies beyond the Node runtime, which ships the AWS SDK v3 and
 * fetch, so the directory deploys as-is with no bundling step.
 */

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

const TIMEOUT_MS = 10_000

/**
 * @param {{ url: string, getSecret: () => Promise<string>, fetchImpl?: typeof fetch, log?: (line: string) => void }} deps
 */
export function createHandler({ url, getSecret, fetchImpl = fetch, log = console.log }) {
  /** @type {string | undefined} */
  let secret

  return async function handler() {
    secret ??= await getSecret()

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = await res.text()

    // A rotated secret: forget the cached one so the next run re-reads it.
    if (res.status === 401) secret = undefined

    // Thrown, not logged, so a failing sweep shows up in the function's
    // error metric rather than looking like a quiet success.
    if (!res.ok) throw new Error(`sweep responded ${res.status}: ${body.slice(0, 200)}`)

    log(JSON.stringify({ event: 'sweep-triggered', status: res.status, result: body }))
    return JSON.parse(body)
  }
}

const ssm = new SSMClient({})

export const handler = createHandler({
  url: process.env.SWEEP_URL ?? '',
  getSecret: async () => {
    const { Parameter } = await ssm.send(
      new GetParameterCommand({ Name: process.env.CRON_SECRET_PARAMETER, WithDecryption: true }),
    )
    if (!Parameter?.Value) throw new Error('cron secret parameter is empty')
    return Parameter.Value
  },
})
