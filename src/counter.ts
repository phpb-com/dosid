/* eslint-disable no-undef */
import { hash } from 'ohash' // Import library for consistent hashing

export interface Env {}

export class DOSIDCounter {
  state: DurableObjectState
  myId: string

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.myId = state.id.toString()
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request) {
    // Returned numeric ID will consist of three parts (left to right):
    // 1) Durable Object stored counter value
    // 2) 9 bits (512 values) of shard value (shard id calculation should be based on physical location of DO)
    // 3) 7 bits (128 values) of crypto randomness that will defined stored value id of the counter

    // 3) Durable Object stored counter value ID
    // Generate random id tail, 7 bits
    // Generate random id tail that will be used to store the counter value
    const randomVal = crypto.getRandomValues(new Uint8Array(1))
    const idTail = BigInt(randomVal[0] & ((1 << 7) - 1) /* mask 7 bits */)

    // 2) Calculate 10 bit shard id for the use in the final counter
    const shardID = BigInt(hash(this.myId)) & ((1n << 9n) - 1n)

    // 1) Durable Object stored counter value
    // Read the counter value from durable storage / cache, or initialize it to 0
    let counterValue: bigint =
      (await this.state.storage?.get(idTail.toString())) || 0n
    // Increment and store the counter value, meaning that we will never use 0 as a value
    await this.state.storage?.put(idTail.toString(), ++counterValue)

    // Return the final calculated numeric ID as a string
    return new Response(
      String((counterValue << 16n) | (shardID << 7n) | idTail),
    )
  }
}
