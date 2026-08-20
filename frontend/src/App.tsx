import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  HiOutlineBookOpen,
  HiOutlineChartBar,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineXMark,
} from 'react-icons/hi2'
import {
  callAssistantApi,
  callSopDocumentApi,
  DEMO_QUESTIONS,
  formatTimestamp,
  getApiBaseUrl,
  type AssistantResult,
  type HealthResponse,
  type PipelineStep,
} from './assistant'
import './App.css'

type Screen = 'assistant' | 'sop' | 'monitor'

const SOP_DOCUMENTS = [
  {
    name: 'late_checkout_policy.md',
    summary:
      'Checkout until 13:00 may be granted by front desk. 13:00 to 15:00 requires duty manager approval and may incur a half-day charge.',
  },
  {
    name: 'vip_guest_protocols.md',
    summary:
      'VIP guests receive priority handling, personalized greeting, and escalation path for room or service recovery.',
  },
  {
    name: 'lost_and_found.md',
    summary:
      'Items are tagged, logged, and secured at front desk. Government IDs and passports require immediate manager notification.',
  },
  {
    name: 'room_upgrade_policy.md',
    summary:
      'Upgrades depend on occupancy, guest tier, and revenue controls. Complimentary upgrades require supervisor approval.',
  },
]

function PipelineList({ steps }: { steps: PipelineStep[] }) {
  return (
    <ol className="pipeline">
      {steps.map((step) => (
        <li className="pipeline-step" key={step.label}>
          <div className={`step-status ${step.status}`}>
            {step.status === 'ok' ? (
              <HiOutlineCheck />
            ) : step.status === 'warn' ? (
              <HiOutlineExclamationTriangle />
            ) : (
              <HiOutlineXMark />
            )}
          </div>
          <div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
          <span className={`status-text ${step.status}`}>
            {step.status === 'ok' ? 'OK' : step.status === 'warn' ? 'CHECK' : 'SKIP'}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <article className={`panel ${className}`.trim()}>
      <h3 className="panel-title">{title}</h3>
      <div className="panel-body">{children}</div>
    </article>
  )
}

function App() {
  const routePath = window.location.pathname
  const isKnownRoute = routePath === '/' || routePath === '/index.html'
  const [screen, setScreen] = useState<Screen>('assistant')
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [assistantResult, setAssistantResult] = useState<AssistantResult | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [selectedSopName, setSelectedSopName] = useState('')
  const [selectedSopContent, setSelectedSopContent] = useState('')
  const [isSopLoading, setIsSopLoading] = useState(false)
  const [sopError, setSopError] = useState('')
  const queryRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        queryRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    let cancelled = false

    const readHealth = async () => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 2500)

      try {
        const response = await fetch(`${getApiBaseUrl()}/health`, { signal: controller.signal })
        if (cancelled) return
        if (!response.ok) {
          setHealth(null)
          return
        }
        const data = (await response.json()) as HealthResponse
        if (!cancelled) setHealth(data)
      } catch {
        if (!cancelled) setHealth(null)
      } finally {
        window.clearTimeout(timeoutId)
      }
    }

    void readHealth()
    const timer = window.setInterval(() => {
      void readHealth()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const runAssistantQuery = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || isLoading) return

    setIsLoading(true)
    setRequestError('')

    try {
      const result = await callAssistantApi(trimmed)
      setAssistantResult(result)
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? `${error.message} Start backend with: uvicorn main:app --host 127.0.0.1 --port 8000`
          : 'Backend request failed.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleAskAssistant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runAssistantQuery(query)
  }

  const handleDemoQuestion = (question: string) => {
    setQuery(question)
    void runAssistantQuery(question)
  }

  const handleOpenSopDocument = async (documentName: string) => {
    if (selectedSopName === documentName && selectedSopContent && !isSopLoading) {
      setSelectedSopName('')
      setSelectedSopContent('')
      setSopError('')
      return
    }

    setSelectedSopName(documentName)
    setIsSopLoading(true)
    setSopError('')

    try {
      const result = await callSopDocumentApi(documentName)
      setSelectedSopContent(result.content)
    } catch (error) {
      setSelectedSopContent('')
      setSopError(error instanceof Error ? error.message : 'SOP document request failed.')
    } finally {
      setIsSopLoading(false)
    }
  }

  if (!isKnownRoute) {
    return (
      <main className="app-shell not-found-shell">
        <section className="not-found-panel">
          <p className="not-found-code">404</p>
          <h1>ROOM NOT FOUND</h1>
          <p>The requested operational screen does not exist.</p>
          <button className="action-btn" type="button" onClick={() => (window.location.href = '/')}>
            Return to Operations
          </button>
        </section>
      </main>
    )
  }

  const isPolicyMissing = assistantResult?.title === 'POLICY NOT FOUND'
  const apiOnline = health?.services.api === 'ok'
  const mcpOnline = health?.services.mcp === 'ok'
  const sopReady = health?.services.sop_index === 'ready'
  const tracingOnline = health?.services.tracing === 'ready' || health?.services.tracing === 'local'
  const tracingLabel = health?.tracing === 'langsmith' || health?.services.tracing === 'ready' ? 'LangSmith' : 'Local'
  const healthRows: [string, string][] = [
    ['MCP', mcpOnline ? 'ok' : 'warn'],
    ['LangGraph', apiOnline ? 'ok' : 'warn'],
    ['Guardrails', apiOnline ? 'ok' : 'warn'],
    ['API', apiOnline ? 'ok' : 'warn'],
    ['SOP Index', sopReady ? 'ok' : 'warn'],
    ['Tracing', tracingOnline ? 'ok' : 'warn'],
  ]
  const screens = [
    ['assistant', HiOutlineSparkles, 'Assistant'],
    ['sop', HiOutlineBookOpen, 'SOP Manual'],
    ['monitor', HiOutlineCpuChip, 'System Monitor'],
  ] as const

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark">MH</span>
          <span>
            MY HOTEL <i>//</i> OPERATIONS
          </span>
        </div>
        <div className="system-status">
          <span className={`dot ${health?.status === 'ok' ? '' : 'amber'}`} />
          SYSTEM {health?.status === 'ok' ? 'ONLINE' : 'DEGRADED'}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="nav-heading">OPERATIONS</div>
          {screens.map(([id, Icon, label]) => (
            <button
              className={screen === id ? 'nav-button active' : 'nav-button'}
              key={id}
              onClick={() => setScreen(id)}
              type="button"
            >
              <Icon />
              {label}
            </button>
          ))}
          <div className="health">
            <div className="nav-heading">SYSTEM HEALTH</div>
            {healthRows.map(([label, status]) => (
              <div className="health-row" key={label}>
                <span>{label}</span>
                <span>
                  <b className={`dot ${status === 'warn' ? 'amber' : ''}`} />
                  {status}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <main className="content">
          {screen === 'assistant' ? (
            <>
              <h1>AI HOSPITALITY ASSISTANT</h1>
              <div className="two-col">
                <Panel title="FRONT DESK QUERY">
                  <p className="philosophy">
                    Ground every answer in the approved hotel SOPs. If a policy is missing, escalate rather than
                    improvise.
                  </p>
                  <form onSubmit={handleAskAssistant}>
                    <label className="field-label" htmlFor="front-desk-query">
                      Front desk query
                      <kbd>Ctrl K</kbd>
                    </label>
                    <textarea
                      id="front-desk-query"
                      name="query"
                      ref={queryRef}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ask about a hotel operations policy..."
                      rows={4}
                    />
                    <div className="try-asking">
                      <span>TRY ASKING</span>
                      <div>
                        {DEMO_QUESTIONS.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => handleDemoQuestion(question)}
                            disabled={isLoading}
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="primary-button" type="submit" disabled={!query.trim() || isLoading}>
                      <HiOutlinePaperAirplane />
                      {isLoading ? 'Asking...' : 'Ask Assistant'}
                    </button>
                  </form>
                  {requestError ? <p className="error-text">{requestError}</p> : null}
                </Panel>

                <Panel title="ASSISTANT RESPONSE">
                  {assistantResult ? (
                    <div>
                      <div className="result-heading">
                        <span className={isPolicyMissing ? 'warn-label' : 'ok-label'}>
                          {isPolicyMissing ? <HiOutlineXMark /> : <HiOutlineCheck />}
                          {assistantResult.title}
                        </span>
                      </div>
                      {assistantResult.response.split('\n\n').map((paragraph) => (
                        <p className="response-copy" key={paragraph}>
                          {paragraph}
                        </p>
                      ))}
                      <p className="source">
                        <HiOutlineDocumentText />
                        Source: <strong>{assistantResult.source}</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <HiOutlineSparkles />
                      <p>Ask your first question to retrieve a grounded answer.</p>
                      <span>POPULAR QUERIES</span>
                      <div className="chips">
                        {['Late checkout', 'VIP arrival', 'Lost passport', 'Room upgrade'].map((item) => (
                          <button key={item} type="button" onClick={() => setQuery(item)}>
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              </div>

              <Panel title="SOP CONTEXT" className="full-panel">
                {assistantResult ? (
                  <div>
                    <p className="doc-name">
                      <HiOutlineDocumentText />
                      {assistantResult.contextDoc}
                    </p>
                    {assistantResult.contextSections.map((section) => (
                      <p className="response-copy" key={section}>
                        {section}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="muted-line">Submit a question to load the relevant policy context.</p>
                )}
              </Panel>

              {assistantResult ? (
                <Panel title="ANSWER RECEIPT" className="full-panel">
                  <dl className="receipt-grid">
                    <div>
                      <dt>Request ID</dt>
                      <dd className="mono">{assistantResult.requestId}</dd>
                    </div>
                    <div>
                      <dt>Answered at</dt>
                      <dd>{formatTimestamp(assistantResult.timestamp)}</dd>
                    </div>
                    <div>
                      <dt>Policy found</dt>
                      <dd>{assistantResult.receipt.policyFound ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt>Tracing</dt>
                      <dd>{assistantResult.receipt.tracing}</dd>
                    </div>
                  </dl>
                  <div className="retrieved">
                    <span className="eyebrow">Retrieved documents</span>
                    {assistantResult.receipt.retrievedDocuments.length > 0 ? (
                      assistantResult.receipt.retrievedDocuments.map((doc) => (
                        <div className="retrieved-row" key={doc.document}>
                          <strong>{doc.document}</strong>
                          <span>
                            {doc.resource} · score {doc.score}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="muted-line">No SOP documents were retrieved for this request.</p>
                    )}
                  </div>
                  <details className="execution-drawer">
                    <summary>
                      Architecture execution
                      <HiOutlineChevronRight />
                    </summary>
                    <PipelineList steps={assistantResult.pipeline} />
                  </details>
                </Panel>
              ) : null}
            </>
          ) : null}

          {screen === 'sop' ? (
            <>
              <h1>SOP MANUAL</h1>
              <Panel title="AVAILABLE POLICIES">
                <div className="policy-list">
                  {SOP_DOCUMENTS.map((doc) => (
                    <section className="policy-card" key={doc.name}>
                      <div className="policy-header">
                        <div>
                          <strong>{doc.name}</strong>
                          <p>{doc.summary}</p>
                        </div>
                        <button type="button" onClick={() => void handleOpenSopDocument(doc.name)}>
                          {selectedSopName === doc.name && selectedSopContent && !isSopLoading
                            ? 'Hide Full Policy'
                            : 'View Full Policy'}
                          <HiOutlineChevronDown />
                        </button>
                      </div>
                      {selectedSopName === doc.name ? (
                        <pre className="sop-content">
                          {isSopLoading ? 'Loading full policy document...' : null}
                          {sopError || (!isSopLoading ? selectedSopContent : '')}
                        </pre>
                      ) : null}
                    </section>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}

          {screen === 'monitor' ? (
            <>
              <h1>SYSTEM MONITOR</h1>
              <Panel title="PIPELINE EXECUTION">
                {assistantResult ? (
                  <>
                    <p className="monitor-meta">
                      Request <strong>{assistantResult.requestId}</strong> · {tracingLabel} tracing
                    </p>
                    <PipelineList steps={assistantResult.pipeline} />
                  </>
                ) : (
                  <div className="empty-state">
                    <HiOutlineChartBar />
                    <p>Submit a front-desk question to inspect the per-request architecture execution.</p>
                  </div>
                )}
              </Panel>
            </>
          ) : null}
        </main>
      </div>

      <footer className="health-bar">
        {healthRows.map(([label, status]) => (
          <span key={label}>
            <b className={`dot ${status === 'warn' ? 'amber' : ''}`} />
            {label} {status}
          </span>
        ))}
      </footer>
    </div>
  )
}

export default App
