/* eslint-disable no-undef */
import 'isomorphic-fetch'

// TODO: Implement tests work the worker and durable object if possible

test('make sure test polyfills for fetch api work', () => {
  const url = 'http://workers.cloudflare.com/'
  const req = new Request(url)
  expect(req.url).toBe(url)
})
