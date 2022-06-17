/* eslint-disable no-undef */
import Hashids from 'hashids'
export { DOSIDCounter } from './counter'

interface Env {
  DOSID_COUNTER: DurableObjectNamespace
  DOSID_HASHIDS_SALT: string
}

export default {
  async fetch (request: Request, env: Env) {
    try {
      return await handleRequest(request, env)
    } catch (e) {
      return new Response(`${e}`)
    }
  }
}

async function handleRequest (request: Request, env: Env) {
  const url = new URL(request.url)
  // Instanciate hashids library
  // Since salt for hashids will have direct impact on the unqiueness of the generated id,
  // ensure that it is never changed after the first deployment. It is recommended to commit
  // the salt value to the secure environment variable and fail if it is not set.
  const hashids = new Hashids(env.DOSID_HASHIDS_SALT || 'dosid')

  // Derive DO name from continent, country, and colo
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
    return new Response(`${resp}, worker DO id: ${id}`)
  }
  // Store counter value as bigint
  const doCounter = BigInt(await resp.text())

  // Create the final HashIDs
  const hashidsResp = hashids.encode(doCounter)

  return new Response(hashidsResp)
}
