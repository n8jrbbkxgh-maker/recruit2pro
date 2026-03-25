// netlify/functions/create-checkout.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Verify auth
  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // Find or create Stripe customer with user_id in metadata
    const existing = await stripe.customers.list({ email: user.email, limit: 1 })
    let customer
    if (existing.data.length > 0) {
      customer = existing.data[0]
      await stripe.customers.update(customer.id, { metadata: { user_id: user.id } })
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${process.env.APP_ORIGIN}/app.html?checkout=success`,
      cancel_url: `${process.env.APP_ORIGIN}/app.html`,
    })

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
