/* eslint-disable no-undef */
/*
 This is a sample implementation of the Cloudflare Worker
 to use "dosid" to generate globaly unique but short ID strings.
 If you need to use this in production, we recommend to lift neccessery code from
 this implementation and then use it in your production code of the worker.
 */

export { DOSIDCounter } from './idgenerator'

interface Env {
  DOSID_COUNTER: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handleRequest(request, env)
    } catch (e) {
      return new Response(`${e}`)
    }
  }
}

async function handleRequest(request: Request, env: Env) {
  // Derive DO name from continent, country, and colo
  // You may want to use other parameters to spread your shards across the globe
  // WARNING: Do not attempt to change the structure of doName after initial production usage,
  // or you will start generating spontaniouse duplicates.
  const doName = {
    continent: request.cf?.continent ?? 'XX',
    country: request.cf?.country ?? 'XX',
    colo: request.cf?.colo ?? 'XXX'
  }

  // Derive DO id from DO name
  const id = env.DOSID_COUNTER.idFromName(JSON.stringify(doName))

  // Get DO object and fetch counter value
  const resp = await env.DOSID_COUNTER.get(id).fetch(request.url)

  // Respond with the final HashIDs
  return new Response(await resp.text(), {
    status: resp.status,
    headers: resp.headers
  })
}
