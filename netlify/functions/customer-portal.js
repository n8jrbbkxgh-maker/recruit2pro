// netlify/functions/customer-portal.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.APP_ORIGIN || 'http://localhost:8888',
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

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  // Get stripe_customer_id from subscriptions table
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: sub } = await serviceClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No subscription found' }) }
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.APP_ORIGIN}/app.html`,
    })
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
