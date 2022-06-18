/* eslint-disable no-undef */
/*
 This is a sampkle implementation of the Cloudflare Worker
 to use "dosid" to generate globaly unique but short ID strings.
 If you need to use this in production, we recommend to lift neccessery code from
 this implementation and then use it in your production code of the worker.
 */

import Hashids from 'hashids'
export { DOSIDCounter } from './counter'

interface Env {
  DOSID_COUNTER: DurableObjectNamespace
  DOSID_HASHIDS_SALT: string
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
  // Parse request URL
  const url = new URL(request.url)

  // Instanciate hashids library
  // Since salt for hashids will have direct impact on the unqiueness of the generated id,
  // ensure that it is never changed after the first deployment. It is recommended to commit
  // the salt value to the secure environment variable and fail if it is not set.
  // WARNING: Chaning salt after initial production use will result in spontaniouse duplicate IDs
  if (typeof env.DOSID_HASHIDS_SALT === 'undefined') {
    // This is for your own safety to ensure that we have at least a primitive safety in place
    return new Response('No HashIDs SALT set, refuse to work')
  }
  const hashids = new Hashids(env.DOSID_HASHIDS_SALT)

  // Derive DO name from continent, country, and colo
  // You may want to use other parameters to spread your shards across the globe
  // WARNING: Do not attempt to change the structure of doName after initial production usage,
  // or you will start generating spontaniouse duplicates.
  const doName = {
    continent: request.cf?.continent || 'XX',
    country: request.cf?.country || 'XX',
    colo: request.cf?.colo || 'XXX'
  }

  // Derive DO id from DO name
  const id = env.DOSID_COUNTER.idFromName(JSON.stringify(doName))

  // Get DO Object
  const obj = env.DOSID_COUNTER.get(id)

  // Fetch counter value
  const resp = await obj.fetch(request.url)

  // Return debug info
  if (url.pathname === '/debug') {
    return new Response((await resp.text()) + JSON.stringify(doName))
  }

  // Store counter value as bigint
  const doCounter = BigInt(await resp.text())

  // Create the final HashIDs
  const hashidsResp = hashids.encode(doCounter)

  // Respond with the final HashIDs
  return new Response(
    JSON.stringify({
      id: hashidsResp,
      nid: doCounter.toString(10)
    })
  )
}
