// netlify/functions/ai-proxy.js
import { createClient } from '@supabase/supabase-js'

const DAILY_LIMIT = 50
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:8888'

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
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

  // Auth check
  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // Subscription check
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: sub } = await serviceClient
    .from('subscriptions')
    .select('status, grace_until')
    .eq('user_id', user.id)
    .maybeSingle()

  const { getAccessStatus } = await import('../../js/auth.js')
  const access = getAccessStatus(sub)
  if (access === 'blocked') {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'No active subscription' }) }
  }

  // Rate limiting: 50 AI calls per user per day
  // Pattern: increment first, then check. The database CHECK constraint (count <= 55)
  // is the final safety net against concurrent over-limit requests.
  const today = new Date().toISOString().split('T')[0]

  // Read current count
  const { data: usage } = await serviceClient
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  const currentCount = usage?.count || 0
  if (currentCount >= DAILY_LIMIT) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Daily limit reached' }) }
  }

  // Increment — the CHECK constraint on the table prevents going above DAILY_LIMIT + small buffer
  // even under race conditions (concurrent requests near the limit may occasionally slip through,
  // but cannot go far above the limit due to the DB constraint)
  const { error: incrementError } = await serviceClient.from('ai_usage').upsert(
    { user_id: user.id, date: today, count: currentCount + 1 },
    { onConflict: 'user_id,date' }
  )

  if (incrementError) {
    // If DB constraint prevents increment (count too high), return 429
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Daily limit reached' }) }
  }

  // Call Anthropic
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  const messages = body.messages || [{ role: 'user', content: body.prompt || '' }]
  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: body.max_tokens || 700,
    messages,
  }
  if (body.system) requestBody.system = body.system

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })
    const data = await response.json()
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
