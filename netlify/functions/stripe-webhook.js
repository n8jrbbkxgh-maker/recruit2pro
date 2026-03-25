// netlify/functions/stripe-webhook.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Exported for direct testing
export async function upsertSubscription(supabase, userId, sub, customerId) {
  const periodEnd = new Date(sub.current_period_end * 1000)
  const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEnd.toISOString(),
    grace_until: graceUntil.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

async function getUserIdFromCustomer(customerId) {
  const customer = await stripe.customers.retrieve(customerId)
  return customer.metadata?.user_id
}

export const handler = async (event) => {
  const sig = event.headers['stripe-signature']
  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object
        const userId = session.metadata?.user_id
        if (!userId) break
        const sub = await stripe.subscriptions.retrieve(session.subscription)
        await upsertSubscription(supabase, userId, sub, session.customer)
        break
      }
      case 'customer.subscription.updated':
      case 'invoice.payment_succeeded': {
        const obj = stripeEvent.data.object
        const subId = obj.subscription || obj.id
        const sub = await stripe.subscriptions.retrieve(subId)
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (userId) await upsertSubscription(supabase, userId, sub, sub.customer)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (!userId) break
        const periodEnd = new Date(sub.current_period_end * 1000)
        const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          status: 'canceled',
          current_period_end: periodEnd.toISOString(),
          grace_until: graceUntil.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (!userId) break
        const periodEnd = new Date(sub.current_period_end * 1000)
        const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          status: 'past_due',
          current_period_end: periodEnd.toISOString(),
          grace_until: graceUntil.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        break
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err)
    return { statusCode: 500, body: 'Internal error' }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
