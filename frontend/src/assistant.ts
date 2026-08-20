export type PipelineStatus = 'ok' | 'warn' | 'skip'

export type PipelineStep = {
  label: string
  detail: string
  status: PipelineStatus
}

export type RetrievedDocument = {
  document: string
  resource: string
  score: number
}

export type AnswerReceipt = {
  requestId: string
  timestamp: string
  policyFound: boolean
  source: string
  retrievedDocuments: RetrievedDocument[]
  tracing: string
}

export type AssistantResult = {
  title: string
  response: string
  source: string
  contextDoc: string
  contextSections: string[]
  requestId: string
  timestamp: string
  receipt: AnswerReceipt
  pipeline: PipelineStep[]
}

export type SopDocumentResult = {
  document: string
  content: string
}

export type HealthResponse = {
  status: string
  tracing?: string
  services: {
    api: string
    mcp: string
    sop_index: string
    tracing?: string
  }
}

const POLICY_PIPELINE: PipelineStep[] = [
  { label: 'PII MASKING', detail: 'No personal identifiers detected', status: 'ok' },
  { label: 'INTENT ROUTER', detail: 'Policy question detected', status: 'ok' },
  { label: 'MCP RETRIEVAL', detail: '1 document found', status: 'ok' },
  { label: 'POLICY CONTEXT', detail: 'Relevant sections extracted', status: 'ok' },
  { label: 'ANSWER GENERATION', detail: 'Grounded response drafted', status: 'ok' },
  { label: 'GUARDRAILS', detail: 'Policy-safe output verified', status: 'ok' },
]

export const DEMO_QUESTIONS = [
  'What is the latest checkout time?',
  'How should I handle a VIP complaint?',
  'What should I do if I find a passport?',
  'Can I give a VIP guest a room upgrade?',
  'Can guests bring llamas into the presidential suite?',
]

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase()
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req-${Date.now().toString(16)}`
}

export const DEFAULT_ASSISTANT_RESULT: AssistantResult = {
  title: 'POLICY FOUND',
  response:
    'A 3pm checkout may be possible, but it falls within the extended checkout window and may incur a half-day charge. Availability must be confirmed first.',
  source: 'late_checkout_policy.md',
  contextDoc: 'late_checkout_policy.md',
  contextSections: [
    'VIP guests should receive priority when available rooms allow flexibility.',
    'Checkout until 13:00 may be granted. 13:00 to 15:00 may require manager approval.',
  ],
  requestId: newRequestId(),
  timestamp: new Date().toISOString(),
  receipt: {
    requestId: 'pending',
    timestamp: new Date().toISOString(),
    policyFound: true,
    source: 'late_checkout_policy.md',
    retrievedDocuments: [
      { document: 'late_checkout_policy.md', resource: 'sop://late_checkout_policy', score: 9 },
    ],
    tracing: 'local',
  },
  pipeline: POLICY_PIPELINE,
}

const RENDER_API_URL = 'https://ai-staff-copilot.onrender.com'

export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  if (configured) return configured

  // Retain the Vite local proxy for uvicorn debugging.
  if (import.meta.env.DEV) return ''

  return RENDER_API_URL
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parsePipeline(value: unknown): PipelineStep[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as { label?: unknown }).label !== 'string' ||
      typeof (item as { detail?: unknown }).detail !== 'string'
    ) {
      return []
    }
    const status = (item as { status?: unknown }).status
    return [
      {
        label: (item as { label: string }).label,
        detail: (item as { detail: string }).detail,
        status: status === 'warn' || status === 'skip' ? status : 'ok',
      },
    ]
  })
}

function parseRetrievedDocuments(value: unknown): RetrievedDocument[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as { document?: unknown }).document !== 'string' ||
      typeof (item as { resource?: unknown }).resource !== 'string' ||
      typeof (item as { score?: unknown }).score !== 'number'
    ) {
      return []
    }
    return [
      {
        document: (item as { document: string }).document,
        resource: (item as { resource: string }).resource,
        score: (item as { score: number }).score,
      },
    ]
  })
}

export function parseAssistantResponse(data: unknown): AssistantResult {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backend response shape.')
  }

  const record = data as Record<string, unknown>
  if (
    typeof record.title !== 'string' ||
    typeof record.response !== 'string' ||
    typeof record.source !== 'string' ||
    typeof record.context_doc !== 'string' ||
    !isStringArray(record.context_sections)
  ) {
    throw new Error('Invalid backend response shape.')
  }

  const requestId = typeof record.request_id === 'string' ? record.request_id : newRequestId()
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString()
  const receiptRecord =
    record.receipt && typeof record.receipt === 'object' ? (record.receipt as Record<string, unknown>) : {}
  const retrievedDocuments = parseRetrievedDocuments(receiptRecord.retrieved_documents)
  const pipeline = parsePipeline(record.pipeline)

  return {
    title: record.title,
    response: record.response,
    source: record.source,
    contextDoc: record.context_doc,
    contextSections: record.context_sections,
    requestId,
    timestamp,
    receipt: {
      requestId:
        typeof receiptRecord.request_id === 'string' ? receiptRecord.request_id : requestId,
      timestamp: typeof receiptRecord.timestamp === 'string' ? receiptRecord.timestamp : timestamp,
      policyFound:
        typeof receiptRecord.policy_found === 'boolean'
          ? receiptRecord.policy_found
          : record.title === 'POLICY FOUND',
      source: typeof receiptRecord.source === 'string' ? receiptRecord.source : record.source,
      retrievedDocuments,
      tracing: typeof receiptRecord.tracing === 'string' ? receiptRecord.tracing : 'local',
    },
    pipeline,
  }
}

export async function callAssistantApi(query: string): Promise<AssistantResult> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(`${baseUrl}/assistant/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`)
  }

  return parseAssistantResponse(await response.json())
}

export async function callSopDocumentApi(documentName: string): Promise<SopDocumentResult> {
  const baseUrl = getApiBaseUrl()
  const response = await fetch(`${baseUrl}/sop/${encodeURIComponent(documentName)}`)

  if (!response.ok) {
    throw new Error(`Unable to load SOP: ${response.status}`)
  }

  const data = (await response.json()) as {
    document?: unknown
    content?: unknown
  }

  if (typeof data.document !== 'string' || typeof data.content !== 'string') {
    throw new Error('Invalid SOP response shape.')
  }

  return {
    document: data.document,
    content: data.content,
  }
}

export function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
