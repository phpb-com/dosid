/* eslint-disable no-undef */
export interface Env {
  DEBUG: boolean
}

export class DOSIDSharder {
  state: DurableObjectState // DO state object
  env: Env // DO environment variables
  debug: boolean // DEBUG
  nextShardId: bigint // shard id

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.debug = env.DEBUG ?? false
    this.nextShardId = 0n
  }

  async fetch(request: Request): Promise<Response> {
    // Retrieve shard id from the storage, increment it and store it back
    // to the storage while blocking concurrent access
    await this.state.blockConcurrencyWhile(async () => {
      this.nextShardId =
        (await this.state.storage.get<bigint>('nextShardId')) ?? 0n
      this.state.storage?.put<bigint>('nextShardId', this.nextShardId + 1n)
    })

    try {
      console.log(
        'DOSIDSharder: new shard id: ',
        this.nextShardId.toString(),
        this.debug ? JSON.stringify(request) : ''
      )
    } catch (e: any) {
      console.log('DOSIDSharder: error: ', e.message)
    }

    // Return the plaintext shard id
    return new Response(this.nextShardId.toString(), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
