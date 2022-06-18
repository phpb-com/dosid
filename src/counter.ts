/* eslint-disable no-undef */
import { hash } from 'ohash' // Import library for consistent hashing

export interface Env {}

export class DOSIDCounter {
  state: DurableObjectState // DO state object
  myId: string // DO object ID string
  env: Env // DO environment variables

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.myId = state.id.toString()
    this.env = env
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    // Parse the request URL
    const url = new URL(request.url)

    /* Returned numeric ID will consist of three parts (left to right):
       1) Durable Object stored counter value
       2) 9 bits (512 values) of shard value (shard id calculation should be based on physical location of DO)
       3) 7 bits (128 values) of crypto randomness that will defined stored value id of the counter */

    // 3) Durable Object stored counter value ID
    // Generate random id tail that will be used to store the counter value,
    // and use only last 7 bits (0 - 127). This gives us 128 counters per DO shard
    const randomVal = crypto.getRandomValues(new Uint8Array(1))
    const idTail = BigInt.asUintN(7, BigInt(randomVal[0]))

    // 2) Calculate 10 bit shard id for the use in the final counter
    const shardID = BigInt.asUintN(9, BigInt(hash(this.myId)))

    // 1) Durable Object stored counter value
    // Read the counter value from durable storage / cache, or initialize it to 0
    // NOTE: The following read-modify-write is safe. For more details,
    // see: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
    let counterValue: bigint =
      (await this.state.storage?.get(idTail.toString())) || 0n
    counterValue = BigInt.asUintN(48, ++counterValue) // Increment and clamp it at 48 bits to fit in bigint 64uint range

    // Increment and store the counter value, meaning that we will never use 0 as a value
    await this.state.storage?.put(idTail.toString(), counterValue)

    // Return debug info, if requested
    if (url.pathname.endsWith('/debug')) {
      return new Response(
        JSON.stringify({
          counterValue: counterValue.toString(),
          shardID: shardID.toString(),
          idTail: idTail.toString(),
          myId: this.myId,
          counter: String((counterValue << 16n) | (shardID << 7n) | idTail)
        })
      )
    }

    // Return the final calculated numeric ID as a string
    return new Response(
      String((counterValue << 16n) | (shardID << 7n) | idTail)
    )
  }
}
