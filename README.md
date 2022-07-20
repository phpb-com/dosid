# Durable Objects Short ID (DOSID)

## Please read the [Durable Object documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects) before using this repo

## NOT TESTED IN PRODUCTION ENVIRONMENT BUT SHOULD BE SAFE TO USE

This project is a variant of the implementation of [short-duid](https://github.com/phpb-com/short-duid-js) that runs on top of Cloudflare and Durable Objects (requires paid worker plan).

## Intro

This is an implementation of the short and URL-safe ID generator that is deployable across the global Cloudflare infrastructure. The repository has the code for the durable object, as well as Worker code to fetch from it.

The main idea behind this implementation is to utilize durable storage to maintain a group of counters sharded across continents, countries, and colocation spaces. We do not use the time element and rely only on counters. The generated text ID is URL safe and short, thanks to [hashids](https://hashids.org/).

## ID structure

The numeric ID is javascript `bigint` type, giving us 64 bits of positive integers (`2^64` == `18,446,744,073,709,551,616` or `18 quintillion 446 quadrillion 744 trillion 73 billion 709 million 551 thousand 616`)

We allocate 48 left most bits to the counter, 9 bits (512) for the shard ID, and 7 bits (128) for the sub-shard/tail.

### Counter

The value stored in the Durable Object storage is incremented with each request.

Clamped to 48 bits, giving `281,474,976,710,656` - 1 values, or `281 trillion 474 billion 976 million 710 thousand 656`

### Shard and sub-shard

The total number of counters is `2^16` == `65,535`, or 128 counters per shard (512 shards)

Sharding happens in the Worker by creating a durable object id from a specifically generated name:

Inside of the [Worker](src/index.ts) (`DOSID_COUNTER` is DO binding for the ID generator, and `DOSID_SHARDER` is for the central and unique generation of shard IDs):

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

While sub-shard/tail is generated from the crypto-random number in the [DO class](src/idgenerator.ts). This is done to diversify generated IDs and make them less predictable.

```typescript
// Generate random id tail that will be used to store the counter value,
// and use only last 7 bits (0 - 127). This gives us 128 counters per DO shard
const randomVal = crypto.getRandomValues(new Uint8Array(1))
const idTail = BigInt.asUintN(7, BigInt(randomVal[0]))
```

### Generated ID

The ID is generated using [HashIDs](https://hashids.org/), which is implemented by [hashids.js](https://github.com/niieani/hashids.js). The DO performs the conversion of numeric ID into actual ID, but also returns numeric IDs that were used as a source for the hashids.

## Costs

Generating each ID comes at a cost. Refer to the Cloudflare ([pricing](https://developers.cloudflare.com/workers/platform/pricing)). Generally it should cost under $2 per million IDs.

## Quick start

Prerequisits

- node 16.X
- yarn 3.2.1 or later
- Cloudflare account with paid Workers plan (DO is only availble with the paid plan)

Clone this repository:

```sh
git clone git@github.com:phpb-com/dosid.git
```

Change directory to the newly cloned repository:

```sh
cd docid
```

Install the dependencies:

```sh
yarn install
```

Check if you are loged into the cloudflare account with wrangler:

```sh
yarn wrangler whoami
```

If not logged-in, please do so (skip this step if you are already logged-in):

```sh
yarn wrangler login
```

Deploy the durable object and its Worker:

```sh
yarn deploy
```

The last line of the output should have your workers hostname, i.e., `dosid.<your worker subdomain>.workers.dev`

Set the salt for hashids:

```sh
openssl rand -base64 15 | tee .secret_hashids_salt | yarn wrangler secret put DOSID_HASHIDS_SALT
```

The salt will be saved in `.secet_hashids_salt` file which you should backup and remove.

Query your new worker to generate first ID:

```sh
curl https://dosid.<your worker subdomain>.workers.dev
```

You should see the output similare to the following:

```json
{
  "hashIds": ["wX4V"],
  "numericIds": ["65652"]
}
```

Or, if you need to generate multiple IDs, please add `count` variable with the specific number:

```sh
curl 'https://dosid.<your worker subdomain>.workers.dev/?count=10'
```

Which should produce the output similar to the follwoing:

```json
{
  "hashIds": [
    "6xNvk",
    "yMlJW",
    "naaVw",
    "vbx6L",
    "6R0O6",
    "3oXMz",
    "n11E9",
    "v61a0",
    "eXqrJ",
    "3nrX"
  ],
  "numericIds": [
    "655553",
    "590017",
    "524481",
    "458945",
    "393409",
    "327873",
    "262337",
    "196801",
    "131265",
    "65729"
  ]
}
```

That is all to it. Now go ahead and see how you can integrate it into your app or workflow.

## Basic Usage

**WARNING:** If you rely on the uniqueness of the generated IDs, the following parameters cannot change after the initial production deployment: **HashIDs Salt** (see the warning in the [code of the worker](src/index.ts)), and generation of a shard (e.g., the textual representation that is passed to `idFromName` method of DO binding). You may also want to either back up your sequences or pad the ID sequence with additional bits that will encode version (e.g., 8 bits will give you 256 chances to reset)

You can quickly start by cloning this repo and running `yarn install`. Before performing any further steps, please read the following sections.

Please note that this project was designed to work at the edge, and may be no suitable for usage by the fixed source server to request new IDs. You may look into sharding strategy to adapt for this use case.

### Environment Variables

You will need to set some secret environment variables and modify wrangler.toml. Durable Objects (as of 2022 June) require you to have a paid worker plan with Cloudflare.

- DOSID_HASHIDS_SALT - should be set to a random value between 8 and 32 ASCII characters. Example: `openssl rand -base64 15`. To set it now, run `openssl rand -base64 15 | tee .secret_hashids_salt | yarn wrangler secret put DOSID_HASHIDS_SALT` in the project directory.

### [wrangler.toml](wrangler.toml)

You will want to modify `wrangler.toml` to ensure that deployment works, or use as is with workers.dev domain. `route` parameter has to be set to the correct `zone_name`, and so is `pattern`. Be careful not to overtake your current domain/site/application routes.

See [wrangler.toml](https://developers.cloudflare.com/workers/wrangler/configuration/) documentation for more info.

### Deployment

Run `yarn deploy` to deploy Worker and durable object class.

If you had `workers_dev` set to `true` you should get the worker.dev name you will be able to access and get some IDs.

## Potential usage scenarios

**WARNING:** This project is unsuitable for any cryptographic usage or as a source of entropy. There is ZERO assumption of any secrecy or unpredictability. Not to be used as a password generator or anything that requires secrecy. You've been warned!

This project may be useful to you whenever you require to have random and yet semi-unpredictable IDs. Some examples include:

- URL shorteners
- User-generated content URLs/IDs
- Anything that requires for you to generate a bunch of unqeue and short strings

## Contributing

All are welcome to submit issues, ideas, pull requests, and patches

## Project using this project

If you found this project useful, please consider making an "issue" or pull request to add it to this list.

- None that I am aware of so far ...

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
