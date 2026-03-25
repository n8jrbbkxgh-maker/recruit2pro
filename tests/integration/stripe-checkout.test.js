// tests/integration/stripe-checkout.test.js
import { describe, test, expect } from 'vitest'

describe('create-checkout handler', () => {
  test('returns 405 for non-POST requests', async () => {
    const { handler } = await import('../../netlify/functions/create-checkout.js')
    const result = await handler({ httpMethod: 'GET', headers: {} })
    expect(result.statusCode).toBe(405)
  })

  test('returns 401 when no auth token provided', async () => {
    const { handler } = await import('../../netlify/functions/create-checkout.js')
    const result = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({})
    })
    expect(result.statusCode).toBe(401)
  })
})
