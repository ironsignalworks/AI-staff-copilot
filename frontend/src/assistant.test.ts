import { describe, expect, it } from 'vitest'
import { getApiBaseUrl, normalizeQuery, parseAssistantResponse } from './assistant'

describe('getApiBaseUrl', () => {
  it('keeps the Vite proxy in local development when VITE_API_URL is unset', () => {
    expect(getApiBaseUrl()).toBe('')
  })
})

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  Late   checkout ')).toBe('late checkout')
  })
})

describe('parseAssistantResponse', () => {
  it('maps provenance fields from the backend payload', () => {
    const result = parseAssistantResponse({
      title: 'POLICY FOUND',
      response: 'Late checkout may be granted.',
      source: 'late_checkout_policy.md',
      context_doc: 'late_checkout_policy.md',
      context_sections: ['Standard checkout time is 11:00.'],
      request_id: 'req-123',
      timestamp: '2026-08-19T18:00:00.000Z',
      receipt: {
        request_id: 'req-123',
        timestamp: '2026-08-19T18:00:00.000Z',
        policy_found: true,
        source: 'late_checkout_policy.md',
        retrieved_documents: [
          { document: 'late_checkout_policy.md', resource: 'sop://late_checkout_policy', score: 14 },
        ],
        tracing: 'local',
      },
      pipeline: [{ label: 'MCP RETRIEVAL', detail: '1 document(s) found', status: 'ok' }],
    })

    expect(result.requestId).toBe('req-123')
    expect(result.receipt.retrievedDocuments).toEqual([
      { document: 'late_checkout_policy.md', resource: 'sop://late_checkout_policy', score: 14 },
    ])
    expect(result.pipeline[0]).toEqual({
      label: 'MCP RETRIEVAL',
      detail: '1 document(s) found',
      status: 'ok',
    })
  })

  it('rejects an invalid payload', () => {
    expect(() => parseAssistantResponse({ title: 'nope' })).toThrow(/Invalid backend response shape/)
  })
})
