# Durable Objects Short ID (DOSID)

## Please read the [Durable Object documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects) before using this repo.

## NOT TESTED IN PRODUCTION ENVIRONMENT

This project is a variant of the implementation of [short-duid](https://github.com/phpb-com/short-duid-js) that runs on top of Cloudflare and Durable Objects (requires paid worker plan).

## Intro

The main idea behind this implementation is to utilize durable storage to maintain a group of counters sharded across continents, countries, and colocation spaces. We do not use the time element and rely only on counters. The generated text ID is URL safe and short, thanks to [hashids](https://hashids.org/).

## ID structure

The numeric ID is javascript `bigint` type, giving us 63 bits of positive integers (`2^64` == `9,223,372,036,854,775,808` or `9 quintillion 223 quadrillion 372 trillion 36 billion 854 million 775 thousand 808`)

We allocate 47 left most bits to the counter, 9 bits (512) for the shard ID, and 7 bits (128) for the sub-shard/tail.

### Counter

The value stored in the Durable Object storage is incremented with each request.

Clampped to 47 bits, giving `140,737,488,355,328` - 1 values, or `140 trillion 737 billion 488 million 355 thousand 328`

### Shard and sub-shard

The total number of counters is `2^16` == `65,535`, or 128 counters per shard (512 shards)

Sharding happens in the Worker by creating a durable object id from a specifically generated name:

Inside of the Worker (`DOSID_COUNTER` is DO binding):

```typescript
// Derive DO name from continent, country, and colo
// You may want to use other parameters to spread your shards across the globe
const doName = {
  continent: request.cf?.continent || 'XX',
  country: request.cf?.country || 'XX',
  colo: request.cf?.colo || 'XXX'
}

// Derive DO id from DO name
const id = env.DOSID_COUNTER.idFromName(JSON.stringify(doName))
```

While sub-shard/tail is generated from the crypto-random number in the DO class:

```typescript
// Generate random id tail that will be used to store the counter value,
// and use only last 7 bits (0 - 127). This gives us 128 counters per DO shard
const randomVal = crypto.getRandomValues(new Uint8Array(1))
const idTail = BigInt(randomVal[0] & ((1 << 7) - 1) /* mask 7 bits */)
```

### Generated ID

The ID is generated using [HashIDs](https://hashids.org/), which is implemented by [hashids.js](https://github.com/niieani/hashids.js). The Worker performs the conversion of numeric ID into actual ID, not Durable Object class.

## Costs

Generating each ID comes at a cost. Here is the simple breakdown as of 2022 June ([pricing](https://developers.cloudflare.com/workers/platform/pricing)):

At a minimum you will endure one request to the worker, one request to the Durable Object and two requests to the storage (one read and one write). We will ignore bundled usage for this example:

- Worker request (Bundled) = $0.00000015
- DO Request = $0.00000015
- DO GB-s (estimated) = $0.00000005 (about 0.004 GB-s per request to DO)
- DO read + DO write = (read)$ $0.0000002 + (write) $0.000001 = (total) $0.0000012

Total per ID (estimate) = $0.00000155, or $1.55 per 1 million IDs. You can shave off $0.15 per million requests by performing HashIDs calculation and request to DO in your Worker that needs the ID.

## Basic Usage

**WARNING:** If you rely on the uniqueness of the generated IDs, the following parameters cannot change after the initial production deployment: **HashIDs Salt** (see the warning in the [code of the Worker](src/index.ts)), and generation of a shard (e.g., the textual representation that is passed to `idFromName` method of DO binding). You may also want to either back up your sequences or pad the ID sequence with additional bits that will encode version (e.g., 8 bits will give you 256 chances to reset)

You can quickly start by cloning this repo and running `yarn install`. Before performing any further steps, please read the following sections.

### Environment Variables

You will need to set some secret environment variables and modify wrangler.toml. Durable Objects (as of 2022 June) require you to have a paid worker plan with Cloudflare.

- DOSID_HASHIDS_SALT - should be set to a random value between 8 and 32 ASCII characters. Example: `openssl rand -base64 15`. To set it now, run `openssl rand -base64 15 | yarn wrangler secret and put DOSID_HASHIDS_SALT` in the project directory.

### wrangler.toml

You will have to modify `wrangler.toml` to ensure that deployment works. `route` parameter has to be set to the correct `zone_name`, and so is `pattern`. Be careful not to overtake your current domain/site/application routes.

### Deployment

Run `yarn deploy` to deploy Worker and durable object class.

If you had `worker_dev` set to `true` you should get the Worker.dev name you will be able to access and get some IDs.

## Potential usage scenarios

**WARNING:** This project is unsuitable for any cryptographic usage or as a source of entropy. There is ZERO assumption of any secrecy or unpredictability. Not to be used as a password generator or anything that requires secrecy. You've been warned!

This project may be useful to you whenever you require to have random and yet semi-unpredictable IDs. Some examples include:

- URL shorteners
- Eser-generated content URLs/IDs

## Contributing

All are welcome to submit issues, ideas, pull requests, and patches

## Project using this project
If you found this project useful, please consider making an "issue"  or pull request to add it to this list.
- <none that I am aware of>

## License

The MIT License (MIT)

Copyright (c) 2015 Ian Matyssik <ian@phpb.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
