/* eslint-disable no-undef */
import Hashids from 'hashids'

export interface Env {
  DOSID_MAX_COUNT: string // (optional) Allowable maximum count for the number of returned numeric IDs
  DOSID_HASHIDS_SALT: string // (required) Salt for the Hashids library
  DEBUG: boolean // (optional) Enable debug mode
  DOSID_SHARDER: DurableObjectNamespace // (required) DOSIDSharder instance
}

export class DOSIDCounter {
  state: DurableObjectState // DO state object
  myId: string // DO object ID string
  env: Env // DO environment variables
  debug: boolean // DEBUG
  myShardId: bigint // DO Instance shard id

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.myId = state.id.toString()
    this.env = env
    this.debug = env.DEBUG ?? false
    this.myShardId = -1n

    // Initialize the shard id for this instance of the DO
    this.state.blockConcurrencyWhile(async () => {
      this.myShardId =
        (await this.state.storage?.get<bigint>('myShardId')) ?? -1n
    })
  }

  // Handle HTTP requests from clients.
  async fetch(request: Request): Promise<Response> {
    // Check for the shard id and request a new one if it is not set
    if (this.myShardId === -1n) {
      // We need to ensure that we have only one instance of the sharder DO globally,
      // therefore we hardcode the sharder name here.
      await this.state.blockConcurrencyWhile(async () => {
        const sharderDOID = this.env.DOSID_SHARDER.idFromName('SHARDER')
        // Fetch a new shard id from the sharder DO to store it in our DOSID counter instance stiorage
        if (this.debug) {
          console.log(
            'DOSIDCounter: fetching new shard id from sharder DO:',
            sharderDOID
          )
        }
        this.myShardId = BigInt(
          await (
            await this.env.DOSID_SHARDER.get(sharderDOID).fetch(request.url)
          ).text()
        )
        if (this.debug) {
          console.log('DOSIDCounter: new shard id:', this.myShardId)
        }
        // Check if the shard id is thinin 9bit space, otherwise throw an error
        if (this.myShardId < 2n ** 9n) {
          this.state.storage?.put<bigint>('myShardId', this.myShardId)
        } else {
          throw new Error(
            'DOSIDCounter: shard id is too large, exceeding 9bit space'
          )
        }
      })
    }
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
       2) 9 bits (512 values) of this instance's shard id that is assigned by the sharder DO
       3) 7 bits (128 values) of crypto randomness that will defined stored value id of the counter */

    // 3) Durable Object stored counter value ID
    // Generate random id tail that will be used to store the counter value,
    // and use only last 7 bits (0 - 127). This gives us 128 counters per DO shard.
    // This improves unpredictability of the counter value, but is not a security measure
    const randomVal: Uint8Array = crypto.getRandomValues(new Uint8Array(1))
    const idTail: bigint = BigInt.asUintN(7, BigInt(randomVal[0]))

    // 1) Durable Object stored counter value
    // Read the counter value from durable storage / cache, or initialize it to 0
    // NOTE: The following read-modify-write is safe. For more details,
    // see: https://blog.cloudflare.com/durable-objects-easy-fast-correct-choose-three/
    let counterValue: bigint =
      (await this.state.storage?.get<bigint>(idTail.toString())) || 0n
    counterValue += BigInt(idCount)
    // Increment the counter value by the number of IDs requested
    // In the unlikely scenario that the counter value overflows, log the message about clamping.
    // At this point, you should consider increasing the number of bits allocated to the counter value
    // or evaluate alternative solutions to the problem.
    if (counterValue >= 2n ** 48n) {
      throw new Error(
        'DOSIDCounter: counter value is too large, exceeding 48bit space:' +
          counterValue.toString()
      )
    }

    await this.state.storage?.put<bigint>(idTail.toString(), counterValue) // Store the updated counter value

    // Instanciate hashids library
    const hashids: Hashids = new Hashids(this.env.DOSID_HASHIDS_SALT)

    // Generate the final IDs
    const hashIds: ArrayLike<string> = new Array(idCount)
      .fill(null)
      .map((_, i) => {
        // "Glue" the final ID from its parts, while only changing the counter value once
        return hashids.encode(
          ((counterValue - BigInt(i)) << 16n) | (this.myShardId << 7n) | idTail
        )
      })
    // Generate numeric IDs to be included in the response, use string for BigInt
    // since JSON.stringify() does not support BigInt type
    const numericIds: ArrayLike<string> = new Array(idCount)
      .fill(null)
      .map((_, i) => {
        // "Glue" the final ID from its parts, while only changing the counter value once
        return (
          ((counterValue - BigInt(i)) << 16n) |
          (this.myShardId << 7n) |
          idTail
        ).toString()
      })

    // Log debug info, if requested
    if (this.debug) {
      try {
        // Wrap debug info in try/catch to avoid errors in production
        console.log({
          doId: this.myId,
          storedCounterValue: counterValue.toString(),
          shardID: this.myShardId.toString(),
          idTail: idTail.toString(),
          hashIds: hashIds.toString().substring(0, 1024),
          numericIds: numericIds.toString().substring(0, 1024)
        })
      } catch (e) {
        console.log(e)
      }
    }

    // Return the final calculated IDs as JSON
    return new Response(JSON.stringify({ hashIds, numericIds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
