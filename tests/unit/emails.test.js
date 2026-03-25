import { describe, test, expect } from 'vitest'
import { buildEmailPrompt, parseEmailResult, capEmailHistory } from '../../js/emails.js'

const SCHOOL = {
  id: 'fsu', name: 'Florida State University', abbr: 'FSU',
  div: 'D1', conf: 'ACC', state: 'FL',
  notes: 'Strong ACC program. Active on Perfect Game circuit.',
  coaches: []
}
const HC = { role: 'Head Coach', name: 'Link Jarrett', email: 'ljarrett@fsu.edu' }
const PROFILE = {
  name: 'Jake Smith', pos: 'RHP', year: '2026',
  hometown: 'Tampa, FL', school: 'Plant High School',
  gpa: '3.5', stats: '90mph FB, 1.8 ERA', film: 'https://hudl.com/v/abc',
  email: 'jake@email.com'
}

describe('buildEmailPrompt', () => {
  test('includes coach last name', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('Jarrett')
  })
  test('includes school name', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('Florida State University')
  })
  test('includes conference', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('ACC')
  })
  test('includes player stats', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('90mph')
  })
  test('includes extra notes when provided', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, 'Met coach at Perfect Game')
    expect(prompt).toContain('Perfect Game')
  })
  test('handles null hc gracefully', () => {
    expect(() => buildEmailPrompt('first', SCHOOL, null, PROFILE, '')).not.toThrow()
  })
  test('handles missing profile fields gracefully', () => {
    expect(() => buildEmailPrompt('first', SCHOOL, HC, {}, '')).not.toThrow()
  })
  test('generates different prompts for each email type', () => {
    const first = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    const followup = buildEmailPrompt('followup', SCHOOL, HC, PROFILE, '')
    const thankyou = buildEmailPrompt('thankyou', SCHOOL, HC, PROFILE, '')
    const showcase = buildEmailPrompt('showcase', SCHOOL, HC, PROFILE, '')
    expect(first).not.toBe(followup)
    expect(followup).not.toBe(thankyou)
    expect(thankyou).not.toBe(showcase)
  })
})

describe('parseEmailResult', () => {
  test('extracts subject and body from well-formed response', () => {
    const text = 'SUBJECT: RHP — Jake Smith, Class of 2026 — FSU\nBODY:\nCoach Jarrett,\n\nI play at Plant HS.'
    const { subject, body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBe('RHP — Jake Smith, Class of 2026 — FSU')
    expect(body).toContain('Coach Jarrett')
  })
  test('falls back to generated subject when SUBJECT line missing', () => {
    const text = 'BODY:\nCoach Jarrett,\n\nSome email.'
    const { subject } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBeTruthy()
    expect(subject.length).toBeGreaterThan(5)
  })
  test('returns full text as body when BODY marker missing', () => {
    const text = 'SUBJECT: My Subject\nCoach Jarrett,\n\nSome email.'
    const { body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(body).toContain('Coach Jarrett')
  })
  test('trims whitespace from subject and body', () => {
    const text = 'SUBJECT:  My Subject  \nBODY:\n  Coach Jarrett,\n\nEmail.  '
    const { subject, body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBe('My Subject')
    expect(body).toBe('Coach Jarrett,\n\nEmail.')
  })
})

describe('capEmailHistory', () => {
  const makeEmails = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      created_at: new Date(i * 1000).toISOString()
    }))

  test('returns all emails when under cap', () => {
    expect(capEmailHistory(makeEmails(50), 100).length).toBe(50)
  })
  test('caps at limit, keeping most recent', () => {
    const emails = makeEmails(105)
    const capped = capEmailHistory(emails, 100)
    expect(capped.length).toBe(100)
    expect(capped.some(e => e.id === 'id-104')).toBe(true)
    expect(capped.some(e => e.id === 'id-0')).toBe(false)
  })
  test('returns empty array for empty input', () => {
    expect(capEmailHistory([], 100)).toEqual([])
  })
})
