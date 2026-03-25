// js/db.js
// Supabase data layer. Import createClient from CDN in browser, from npm in tests.

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertProfile(supabase, userId, profile) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profile, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function getEmails(supabase, userId) {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function insertEmail(supabase, userId, email) {
  const { error } = await supabase
    .from('emails')
    .insert({ user_id: userId, ...email })
  if (error) throw error
  // Prune to 100 after insert
  await pruneEmails(supabase, userId, 100)
}

export async function pruneEmails(supabase, userId, cap = 100) {
  // Delete oldest emails beyond cap
  const { data } = await supabase
    .from('emails')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!data || data.length <= cap) return
  const toDelete = data.slice(cap).map(e => e.id)
  await supabase.from('emails').delete().in('id', toDelete)
}

export async function getSubscription(supabase, userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, grace_until, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}
