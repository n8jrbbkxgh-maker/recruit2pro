import { describe, test, expect } from 'vitest'

describe('stripe-webhook handler', () => {
  test('returns 400 for invalid signature', async () => {
    const { handler } = await import('../../netlify/functions/stripe-webhook.js')
    const result = await handler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'bad_sig' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    })
    expect(result.statusCode).toBe(400)
  })
})
