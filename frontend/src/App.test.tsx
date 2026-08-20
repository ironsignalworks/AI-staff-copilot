import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const checkoutPayload = {
  title: 'POLICY FOUND',
  response: 'Standard checkout is 11:00.',
  source: 'late_checkout_policy.md',
  context_doc: 'late_checkout_policy.md',
  context_sections: ['Standard checkout time is 11:00.'],
  request_id: 'req-test',
  timestamp: '2026-08-19T18:00:00.000Z',
  receipt: {
    request_id: 'req-test',
    timestamp: '2026-08-19T18:00:00.000Z',
    policy_found: true,
    source: 'late_checkout_policy.md',
    retrieved_documents: [
      { document: 'late_checkout_policy.md', resource: 'sop://late_checkout_policy', score: 14 },
    ],
    tracing: 'local',
  },
  pipeline: [{ label: 'MCP RETRIEVAL', detail: '1 document(s) found', status: 'ok' }],
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/health')) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              tracing: 'local',
              services: { api: 'ok', mcp: 'ok', sop_index: 'ready', tracing: 'local' },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }
        if (url.includes('/assistant/query')) {
          return new Response(JSON.stringify(checkoutPayload), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )
  })

  it('pairs the query field with a visible label inside a form', () => {
    window.history.pushState({}, '', '/')
    render(<App />)

    const field = screen.getByLabelText(/front desk query/i)
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.closest('form')).not.toBeNull()
    expect(screen.getByRole('button', { name: /ask copilot/i })).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('heading', { level: 1, name: /ai staff copilot/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /front desk query/i })).toBeInTheDocument()
  })

  it('renders a custom 404 for unknown routes', () => {
    window.history.pushState({}, '', '/no-such-room')
    render(<App />)

    expect(screen.getByRole('heading', { name: /room not found/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /return to operations/i })).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('shows a request receipt after a demo question hits the API', async () => {
    window.history.pushState({}, '', '/')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'What is the latest checkout time?' }))

    expect(await screen.findByText(/Standard checkout is 11:00/)).toBeInTheDocument()
    expect(screen.getByText('ANSWER RECEIPT')).toBeInTheDocument()
    expect(screen.getByText('Request ID')).toBeInTheDocument()
    expect(screen.getByText('Architecture execution')).toBeInTheDocument()
  })
})
