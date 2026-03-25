import { describe, test, expect } from 'vitest'
import { getAccessStatus } from '../../js/auth.js'

const future = new Date(Date.now() + 86400 * 1000).toISOString()
const past = new Date(Date.now() - 86400 * 1000).toISOString()

describe('getAccessStatus', () => {
  test('returns blocked when subscription is null', () => {
    expect(getAccessStatus(null)).toBe('blocked')
  })
  test('returns blocked when subscription is undefined', () => {
    expect(getAccessStatus(undefined)).toBe('blocked')
  })
  test('returns active when status is active', () => {
    expect(getAccessStatus({ status: 'active', grace_until: future })).toBe('active')
  })
  test('returns active even if grace_until is past (status is authoritative when active)', () => {
    expect(getAccessStatus({ status: 'active', grace_until: past })).toBe('active')
  })
  test('returns grace when status is past_due but grace_until is future', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: future })).toBe('grace')
  })
  test('returns blocked when status is past_due and grace_until is past', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: past })).toBe('blocked')
  })
  test('returns grace when status is canceled but grace_until is future', () => {
    expect(getAccessStatus({ status: 'canceled', grace_until: future })).toBe('grace')
  })
  test('returns blocked when status is canceled and grace_until is past', () => {
    expect(getAccessStatus({ status: 'canceled', grace_until: past })).toBe('blocked')
  })
  test('returns blocked when grace_until is missing', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: null })).toBe('blocked')
  })
})
