/* eslint-disable no-undef */
import Hashids from 'hashids'
export { DOSIDCounterV1 } from './counter'

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
  },
}

async function handleRequest(request: Request, env: Env) {
  // Instanciate hashids library
  const hashids = new Hashids(env.DOSID_HASHIDS_SALT)

  // Derive DO name from continent, country, and colo
  const doName = {
    continent: request.cf?.continent || 'XX',
    country: request.cf?.country || 'XX',
    colo: request.cf?.colo || 'XXX',
  }

  // Derive DO id from DO name
  const id = env.DOSID_COUNTER.idFromName(JSON.stringify(doName))

  // Get DO Object
  const obj = env.DOSID_COUNTER.get(id)

  // Fetch counter value and store it as bigint
  const resp = await obj.fetch(request.url)
  const doCounter = BigInt(await resp.text())

  // Create the final HashIDs
  const hashidsResp = hashids.encode(doCounter)

  return new Response(hashidsResp)
}
