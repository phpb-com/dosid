/* eslint-disable no-undef */
import { hash } from 'ohash' // Import library for consistent hashing
import Hashids from 'hashids'

export interface Env {
  DOSID_MAX_COUNT: string // (optional) Allowable maximum count for the number of returned numeric IDs
  DOSID_HASHIDS_SALT: string // (required) Salt for the Hashids library
  DEBUG: boolean // (optional) Enable debug mode
}

export class DOSIDCounter {
  state: DurableObjectState // DO state object
  myId: string // DO object ID string
  env: Env // DO environment variables
  debug: boolean // DEBUG

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.myId = state.id.toString()
    this.env = env
    this.debug = env.DEBUG || false
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    // Parse request URL
    const url = new URL(request.url)
    // Set maximum count for the number of returned IDs, default to 8192
    const maxCount = parseInt(this.env.DOSID_MAX_COUNT || '8192', 10)

    // Instanciate hashids library
    // Since salt for hashids will have direct impact on the unqiueness of the generated id,
    // ensure that it is never changed after the first deployment. It is recommended to commit
    // the salt value to the secure environment variable and fail if it is not set.
    // WARNING: Chaning salt after initial production use will result in spontaniouse duplicate IDs
    if (typeof this.env.DOSID_HASHIDS_SALT === 'undefined') {
      // This is for your own safety to ensure that we have at least a primitive safety in place
      throw new Error('No HashIDs SALT set, you must set DOSID_HASHIDS_SALT')
    }

    // Get the number of requested IDs
    const idCount = parseInt(url.searchParams.get('count') || '1', 10)
    if (idCount < 1 || idCount > maxCount || isNaN(idCount)) {
      throw new Error(
        'Invalid ID count, should be between 1 and ' + maxCount.toString()
      )
    }

    /* Returned numeric ID will consist of three parts (left to right):
       1) Durable Object stored counter value
       2) 9 bits (512 values) of shard value (shard id calculation should be based on physical location of DO)
       3) 7 bits (128 values) of crypto randomness that will defined stored value id of the counter */

    // 3) Durable Object stored counter value ID
    // Generate random id tail that will be used to store the counter value,
    // and use only last 7 bits (0 - 127). This gives us 128 counters per DO shard
    const randomVal: Uint8Array = crypto.getRandomValues(new Uint8Array(1))
    const idTail: bigint = BigInt.asUintN(7, BigInt(randomVal[0]))

    // 2) Calculate 10 bit shard id for the use in the final counter
    const shardID: bigint = BigInt.asUintN(9, BigInt(hash(this.myId)))

    // 1) Durable Object stored counter value
    // Read the counter value from durable storage / cache, or initialize it to 0
    // NOTE: The following read-modify-write is safe. For more details,
    // see: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
    let counterValue: bigint =
      (await this.state.storage?.get(idTail.toString())) || 0n
    counterValue += BigInt(idCount) // Increment the counter value by the number of IDs requested
    counterValue = BigInt.asUintN(48, counterValue) // Clamp the value at 48 bits to fit the final ID in 64uint range
    await this.state.storage?.put(idTail.toString(), counterValue) // Store the updated counter value

    // Instanciate hashids library
    const hashids: Hashids = new Hashids(this.env.DOSID_HASHIDS_SALT)

    // Generate the final IDs
    const hashIds: ArrayLike<string> = new Array(idCount)
      .fill(null)
      .map((_, i) => {
        // "Glue" the final ID from its parts, while only changing the counter value once
        return hashids.encode(
          ((counterValue - BigInt(i)) << 16n) | (shardID << 7n) | idTail
        )
      })

    // Log debug info, if requested
    if (this.debug) {
      try {
        // Wrap debug info in try/catch to avoid errors in production
        console.log({
          doId: this.myId,
          storedCounterValue: counterValue.toString(),
          shardID: shardID.toString(),
          idTail: idTail.toString(),
          hashIds: hashIds.toString().substring(0, 1024)
        })
      } catch (e) {
        console.log(e)
      }
    }

    // Return the final calculated IDs as JSON
    return new Response(JSON.stringify({ hashIds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
