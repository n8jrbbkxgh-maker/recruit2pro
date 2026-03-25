import { describe, test, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getProfile, upsertProfile, getEmails, insertEmail, pruneEmails } from '../../js/db.js'

// Use local Supabase service role for test setup (bypasses RLS)
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

// Two test user IDs — must exist in auth.users or be seeded
const TEST_USER_A = '00000000-0000-0000-0000-000000000001'
const TEST_USER_B = '00000000-0000-0000-0000-000000000002'

async function seedTestUsers(admin) {
  for (const id of [TEST_USER_A, TEST_USER_B]) {
    await admin.auth.admin.createUser({
      user_id: id,
      email: `test-${id}@test.com`,
      password: 'password123',
      email_confirm: true,
    }).catch(() => {}) // ignore if already exists
  }
}

async function getAuthenticatedClient(userId) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  await admin.auth.admin.getUserById(userId)
  // Sign in to get a session token
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: signIn } = await anonClient.auth.signInWithPassword({
    email: `test-${userId}@test.com`,
    password: 'password123',
  })
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } }
  })
}

let adminClient, clientA, clientB

beforeEach(async () => {
  adminClient = createClient(SUPABASE_URL, SERVICE_KEY)
  await seedTestUsers(adminClient)
  // Clean up test data
  await adminClient.from('profiles').delete().in('id', [TEST_USER_A, TEST_USER_B])
  await adminClient.from('emails').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
  clientA = await getAuthenticatedClient(TEST_USER_A)
  clientB = await getAuthenticatedClient(TEST_USER_B)
})

describe('profile', () => {
  test('upserts and retrieves profile', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith', pos: 'RHP' })
    const profile = await getProfile(clientA, TEST_USER_A)
    expect(profile.name).toBe('Jake Smith')
    expect(profile.pos).toBe('RHP')
  })

  test('updates existing profile on second upsert', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith' })
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Updated' })
    const profile = await getProfile(clientA, TEST_USER_A)
    expect(profile.name).toBe('Jake Updated')
  })

  test('RLS: user A cannot read user B profile', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith' })
    // clientB tries to read TEST_USER_A's profile
    const profile = await getProfile(clientB, TEST_USER_A)
    expect(profile).toBeNull()
  })
})

describe('emails', () => {
  const EMAIL = {
    school_id: 'fsu', school_name: 'Florida State',
    type: 'first', subject: 'Test Subject', body: 'Test Body'
  }

  test('inserts and retrieves email', async () => {
    await insertEmail(clientA, TEST_USER_A, EMAIL)
    const emails = await getEmails(clientA, TEST_USER_A)
    expect(emails.length).toBe(1)
    expect(emails[0].school_id).toBe('fsu')
  })

  test('RLS: user A cannot read user B emails', async () => {
    await insertEmail(clientA, TEST_USER_A, EMAIL)
    const emails = await getEmails(clientB, TEST_USER_A)
    expect(emails.length).toBe(0)
  })

  test('pruneEmails keeps only 100 most recent', async () => {
    // Insert 105 emails via admin (bypass RLS for speed)
    const batch = Array.from({ length: 105 }, (_, i) => ({
      user_id: TEST_USER_A,
      school_id: `school-${i}`,
      school_name: `School ${i}`,
      type: 'first',
      subject: `Sub ${i}`,
      body: `Body ${i}`,
      created_at: new Date(Date.now() + i * 1000).toISOString()
    }))
    await adminClient.from('emails').insert(batch)
    await pruneEmails(clientA, TEST_USER_A, 100)
    const emails = await getEmails(clientA, TEST_USER_A)
    expect(emails.length).toBe(100)
  })
})
