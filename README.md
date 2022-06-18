# Durable Objects Short ID (DOSID)

## Please read the [Durable Object documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects) before using this repo.

## NOT TESTED IN PRODUCTION ENVIRONMENT

This is an implementation of [short-duid](https://github.com/phpb-com/short-duid-js) that runs on top of Cloudflare and Durable Objects (requires paid worker plan).

## Intro

The main idea behind this implementation is to utilize durable storage to maintain group of counters sharded across continents, countries and colocation spaces. No time element is used, we are relying only on counters.

## ID structure

The numeric ID is javascript `bigint` type, giving us 63 bits of positive integers (`2^64` == 9,223,372,036,854,775,808 or 9 quintillion 223 quadrillion 372 trillion 36 billion 854 million 775 thousand 808)

## Basic Usage

## Potential usage scenariouse

## License

MIT
