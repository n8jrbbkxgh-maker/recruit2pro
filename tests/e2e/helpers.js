// tests/e2e/helpers.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Create a test user with active subscription, return session token
export async function createSubscribedUser(email = `e2e-${Date.now()}@test.com`, password = 'TestPass123') {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Create user
  const { data: { user } } = await admin.auth.admin.createUser({
    email, password, email_confirm: true
  })

  // Insert active subscription
  const futureDate = new Date(Date.now() + 30 * 86400 * 1000).toISOString()
  await admin.from('subscriptions').upsert({
    user_id: user.id,
    status: 'active',
    current_period_end: futureDate,
    grace_until: futureDate,
  }, { onConflict: 'user_id' })

  return { email, password, userId: user.id }
}

export async function cleanupUser(userId) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  await admin.auth.admin.deleteUser(userId)
}
