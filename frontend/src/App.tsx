import { useEffect, useRef, useState, type FormEvent } from 'react'
import { HiOutlineBookOpen, HiOutlineCpuChip, HiOutlineSparkles } from 'react-icons/hi2'
import {
  callAssistantApi,
  callSopDocumentApi,
  DEFAULT_ASSISTANT_RESULT,
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
        <li key={step.label}>
          <div className="pipeline-row">
            <span className="pipeline-label">{step.label}</span>
            <span className={step.status === 'ok' ? 'pipeline-status' : 'pipeline-status warn'}>
              {step.status === 'ok' ? '✓ OK' : step.status === 'skip' ? 'SKIP' : '⚠ CHECK'}
            </span>
          </div>
          <p>{step.detail}</p>
        </li>
      ))}
    </ol>
  )
}

function App() {
  const routePath = window.location.pathname
  const isKnownRoute = routePath === '/' || routePath === '/index.html'
  const [screen, setScreen] = useState<Screen>('assistant')
  const [query, setQuery] = useState('Can room 302 have late checkout until 3pm?')
  const [isLoading, setIsLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [assistantResult, setAssistantResult] = useState<AssistantResult>(DEFAULT_ASSISTANT_RESULT)
  const [showDemoQuestions, setShowDemoQuestions] = useState(false)
  const [hasAskedFirstQuestion, setHasAskedFirstQuestion] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [selectedSopName, setSelectedSopName] = useState<string>('')
  const [selectedSopContent, setSelectedSopContent] = useState<string>('')
  const [isSopLoading, setIsSopLoading] = useState(false)
  const [sopError, setSopError] = useState('')
  const queryRef = useRef<HTMLTextAreaElement | null>(null)

  const focusQuery = () => {
    queryRef.current?.focus()
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        focusQuery()
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
    if (!trimmed) return

    setIsLoading(true)
    setRequestError('')
    setHasAskedFirstQuestion(true)

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

  const handleAskAssistant = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
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

  const isPolicyMissing = assistantResult.title === 'POLICY NOT FOUND'
  const apiOnline = health?.services.api === 'ok'
  const mcpOnline = health?.services.mcp === 'ok'
  const sopReady = health?.services.sop_index === 'ready'
  const tracingOnline = health?.services.tracing === 'ready' || health?.services.tracing === 'local'
  const tracingLabel = health?.tracing === 'langsmith' || health?.services.tracing === 'ready' ? 'LangSmith' : 'Local'

  const queryPanel = (
    <article className="panel">
      <h3>FRONT DESK QUERY</h3>
      <button className="demo-btn" type="button" onClick={() => setShowDemoQuestions((current) => !current)}>
        {showDemoQuestions ? 'Hide Demo' : 'Try Demo'}
      </button>
      {showDemoQuestions ? (
        <div className="demo-questions">
          <p className="demo-philosophy">
            Failure philosophy: if no hotel policy is found, the assistant says so rather than inventing one.
          </p>
          {DEMO_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              className="demo-question"
              onClick={() => handleDemoQuestion(question)}
              disabled={isLoading}
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
      <form className="query-form" onSubmit={handleAskAssistant}>
        <label className="ask-shortcut" htmlFor="front-desk-query">
          Front desk query
          <span>Ctrl K</span>
        </label>
        <textarea
          id="front-desk-query"
          name="query"
          ref={queryRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={4}
        />
        {!showDemoQuestions ? (
          <div className="example-questions">
            <p className="example-title">TRY ASKING</p>
            <div className="example-grid">
              {DEMO_QUESTIONS.map((question) => (
                <button
                  key={`example-${question}`}
                  type="button"
                  className="demo-question"
                  onClick={() => handleDemoQuestion(question)}
                  disabled={isLoading}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button className="action-btn" type="submit" disabled={isLoading}>
          {isLoading ? 'Asking...' : 'Ask Assistant'}
        </button>
      </form>
      {requestError ? <p className="error-text">{requestError}</p> : null}
    </article>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-title">MY HOTEL // OPERATIONS</div>
        <div className="status-pill">
          <span className={health?.status === 'ok' ? 'status-dot' : 'status-dot offline'} />
          {health?.status === 'ok' ? 'SYSTEM ONLINE' : 'SYSTEM DEGRADED'}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section>
            <h2 className="sidebar-heading">OPERATIONS</h2>
            <nav className="nav-list">
              <button
                className={screen === 'assistant' ? 'nav-item active' : 'nav-item'}
                onClick={() => setScreen('assistant')}
                type="button"
              >
                <span className="nav-item-content">
                  <span className="nav-icon" aria-hidden="true">
                    <HiOutlineSparkles />
                  </span>
                  <span>Assistant</span>
                </span>
              </button>
              <button
                className={screen === 'sop' ? 'nav-item active' : 'nav-item'}
                onClick={() => setScreen('sop')}
                type="button"
              >
                <span className="nav-item-content">
                  <span className="nav-icon" aria-hidden="true">
                    <HiOutlineBookOpen />
                  </span>
                  <span>SOP Manual</span>
                </span>
              </button>
              <button
                className={screen === 'monitor' ? 'nav-item active' : 'nav-item'}
                onClick={() => setScreen('monitor')}
                type="button"
              >
                <span className="nav-item-content">
                  <span className="nav-icon" aria-hidden="true">
                    <HiOutlineCpuChip />
                  </span>
                  <span>System Monitor</span>
                </span>
              </button>
            </nav>
          </section>

          <section className="system-block">
            <h2 className="sidebar-heading">SYSTEM</h2>
            <ul className="health-list">
              <li>
                MCP <span className={mcpOnline ? 'ok' : 'warn'}>●</span>
              </li>
              <li>
                LangGraph <span className={apiOnline ? 'ok' : 'warn'}>●</span>
              </li>
              <li>
                Guardrails <span className={apiOnline ? 'ok' : 'warn'}>●</span>
              </li>
              <li>
                API <span className={apiOnline ? 'ok' : 'warn'}>●</span>
              </li>
              <li>
                SOP Index <span className={sopReady ? 'ok' : 'warn'}>●</span>
              </li>
              <li>
                Tracing <span className={tracingOnline ? 'ok' : 'warn'}>●</span>
              </li>
            </ul>
          </section>
        </aside>

        <section className="content">
          {screen === 'assistant' ? (
            <>
              <h1>AI HOSPITALITY ASSISTANT</h1>
              <div className="assistant-top-grid">
                {queryPanel}
                <article className="panel">
                  <h3>ASSISTANT RESPONSE</h3>
                  {hasAskedFirstQuestion ? (
                    <div className={isPolicyMissing ? 'response-box missing' : 'response-box'}>
                      <p className={isPolicyMissing ? 'response-title missing' : 'response-title'}>
                        {isPolicyMissing ? assistantResult.title : `✓ ${assistantResult.title}`}
                      </p>
                      {assistantResult.response.split('\n\n').map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      <p className="response-source">Source: {assistantResult.source}</p>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <p>
                        Ask about hotel policy, procedures, VIP handling, checkout, room upgrades, or lost property.
                      </p>
                      <button className="action-btn" type="button" onClick={focusQuery}>
                        Ask your first question
                      </button>
                      <div className="popular-queries">
                        <p className="example-title">Popular queries</p>
                        <div className="popular-list">
                          {['Late checkout', 'VIP arrival', 'Lost passport', 'Room upgrade'].map((item) => (
                            <button key={item} type="button" className="demo-question" onClick={() => setQuery(item)}>
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              </div>

              <article className="panel">
                <h3>SOP CONTEXT</h3>
                {hasAskedFirstQuestion ? (
                  <div className={isPolicyMissing ? 'context-box missing' : 'context-box'}>
                    <p className="doc-title">{assistantResult.contextDoc}</p>
                    {assistantResult.contextSections.map((section) => (
                      <p key={section}>{section}</p>
                    ))}
                  </div>
                ) : (
                  <p>Submit a question to view retrieved SOP sections here.</p>
                )}
              </article>

              {hasAskedFirstQuestion ? (
                <article className="panel">
                  <h3>ANSWER RECEIPT</h3>
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
                  <p className="example-title">Retrieved documents</p>
                  {assistantResult.receipt.retrievedDocuments.length > 0 ? (
                    <ul className="receipt-docs">
                      {assistantResult.receipt.retrievedDocuments.map((doc) => (
                        <li key={doc.document}>
                          <span className="mono">{doc.document}</span>
                          <span>
                            {doc.resource} · score {doc.score}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No SOP documents were retrieved for this request.</p>
                  )}
                  <details className="execution-drawer">
                    <summary>Architecture execution</summary>
                    <PipelineList steps={assistantResult.pipeline} />
                  </details>
                </article>
              ) : null}
            </>
          ) : null}

          {screen === 'sop' ? (
            <>
              <h1>SOP MANUAL</h1>
              <article className="panel">
                <h3>AVAILABLE POLICIES</h3>
                <div className="sop-list">
                  {SOP_DOCUMENTS.map((doc) => (
                    <section key={doc.name} className="sop-item">
                      <p className="doc-title">{doc.name}</p>
                      <p>{doc.summary}</p>
                      <button className="action-btn" type="button" onClick={() => handleOpenSopDocument(doc.name)}>
                        {selectedSopName === doc.name && selectedSopContent && !isSopLoading
                          ? 'Hide Full Policy'
                          : 'View Full Policy'}
                      </button>
                      {selectedSopName === doc.name ? (
                        <div className="sop-full-doc">
                          {isSopLoading ? <p>Loading full policy document...</p> : null}
                          {sopError ? <p className="error-text">{sopError}</p> : null}
                          {!isSopLoading && !sopError && selectedSopContent ? (
                            <pre className="sop-content">{selectedSopContent}</pre>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              </article>
            </>
          ) : null}

          {screen === 'monitor' ? (
            <>
              <h1>SYSTEM MONITOR</h1>
              <article className="panel">
                <h3>PIPELINE EXECUTION</h3>
                {hasAskedFirstQuestion ? (
                  <>
                    <p className="monitor-meta">
                      Request <span className="mono">{assistantResult.requestId}</span> · {tracingLabel} tracing
                    </p>
                    <PipelineList steps={assistantResult.pipeline} />
                  </>
                ) : (
                  <p>Submit a front-desk question to inspect the per-request architecture execution.</p>
                )}
              </article>
            </>
          ) : null}
        </section>
      </div>
    </main>
  )
}

export default App
