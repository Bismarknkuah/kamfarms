'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, ChevronDown, MapPin, RotateCcw, SendHorizontal, Sparkles } from 'lucide-react';
import { ApiError, aiApi, type AssistantAnswer } from '@/lib/api-client';

const SUGGESTED = [
  'What does 1 kWh of power produce?',
  'How is each milling center doing against what was expected?',
  'How much rice did we produce last week?',
  'What is the current paddy stock?',
  'What is waiting for approval?',
  'Which customers owe us money?',
  'How does the AI learn?',
  'How do I record a milling run?',
];

interface Msg { id: number; role: 'user' | 'assistant'; text: string; answer?: AssistantAnswer; error?: boolean }

function AnswerCard({ a }: { a: AssistantAnswer }) {
  const pct = Math.max(0, Math.min(100, a.confidencePercent));
  const claude = a.engine === 'claude';
  return (
    <div data-testid="assistant-answer" className="rounded-2xl border border-paddy-100 bg-rice-50 p-5">
      <p className="font-display text-xl leading-snug text-paddy-900" data-testid="assistant-answer-text">{a.answer}</p>
      {a.toolsUsed && a.toolsUsed.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-700">
          <span className="font-semibold">Looked up:</span>
          {a.toolsUsed.map((t, i) => <span key={`${t.name}-${i}`} data-testid="assistant-tool" className="rounded-full bg-white px-2.5 py-1 font-medium">{t.label}{t.period && t.period !== 'N/A' ? ` · ${t.period}` : ''}</span>)}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-700">
        {a.engine && <span data-testid="assistant-engine" className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${claude ? 'bg-paddy-900 text-rice-50' : 'bg-white'}`}>{claude ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : <Bot className="h-3.5 w-3.5" aria-hidden="true" />}{claude ? 'Answered by Claude' : 'Built-in answer'}</span>}
        {a.jurisdiction && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium" data-testid="assistant-jurisdiction"><MapPin className="h-3.5 w-3.5 text-paddy-700" aria-hidden="true" /> Covers: {a.jurisdiction}</span>}
        <span className="inline-flex items-center gap-2" data-testid="assistant-confidence">
          Confidence
          <span className="h-2 w-28 overflow-hidden rounded-full bg-ink-500/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-paddy-700" style={{ width: `${pct}%` }} /></span>
          <strong className="text-paddy-900">{pct}%</strong>
        </span>
      </div>
      <details className="group mt-4 rounded-xl bg-white px-4 py-3 text-sm" data-testid="assistant-basis">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-paddy-900">What this is based on <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
        <dl className="mt-3 space-y-2 text-ink-700">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Source</dt><dd>{a.sourceData}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Period</dt><dd>{a.dateRange}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Assumptions</dt><dd>{a.assumptions}</dd></div>
        </dl>
      </details>
    </div>
  );
}

/**
 * The question box, as a conversation. Follow-up questions make sense ("and last month?"), every answer says who worked it
 * out (Claude when it is connected, otherwise the built-in answerer), whose activities it covers, which lookups it used and
 * how far to trust it.
 */
export function AssistantPanel({ accessToken }: { accessToken: string }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [asking, setAsking] = useState(false);
  const next = useRef(1);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [messages, asking]);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || asking) return;
    const history = messages.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { id: next.current++, role: 'user', text }]);
    setQuestion('');
    setAsking(true);
    try {
      const a = await aiApi.ask(accessToken, text, history);
      setMessages((m) => [...m, { id: next.current++, role: 'assistant', text: a.answer, answer: a }]);
    } catch (err) {
      setMessages((m) => [...m, { id: next.current++, role: 'assistant', error: true, text: err instanceof ApiError ? err.message : 'Could not get an answer. Please try again.' }]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <section data-testid="assistant" className="rounded-3xl border border-paddy-100 bg-white p-5 shadow-sm sm:p-7" aria-label="Ask a question">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paddy-900 text-husk-300"><Bot className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="font-display text-2xl font-medium text-paddy-900">Ask a question</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Ask about your activities, your stock, production and sales, or how to do something in the system. Answers come from the real figures, only within your own places, and say what they are based on.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" data-testid="assistant-clear" onClick={() => setMessages([])} className="inline-flex items-center gap-1.5 rounded-full border border-paddy-100 px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:border-paddy-500">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Start again
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
        {SUGGESTED.map((s) => (
          <button key={s} type="button" data-testid="assistant-chip" onClick={() => ask(s)} disabled={asking}
            className="rounded-full border border-husk-500/60 bg-husk-100/30 px-3.5 py-1.5 text-sm text-soil-700 transition hover:bg-husk-100 disabled:opacity-50">{s}</button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="mt-5 space-y-4" data-testid="assistant-thread" aria-live="polite">
          {messages.map((m) => m.role === 'user' ? (
            <div key={m.id} className="flex justify-end"><p data-testid="assistant-question" className="max-w-[85%] rounded-2xl rounded-br-sm bg-paddy-900 px-4 py-2.5 text-sm text-rice-50">{m.text}</p></div>
          ) : m.error ? (
            <p key={m.id} role="alert" data-testid="assistant-error" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{m.text}</p>
          ) : m.answer ? <AnswerCard key={m.id} a={m.answer} /> : null)}
          {asking && <div className="h-20 animate-pulse rounded-2xl bg-rice-50" aria-hidden="true" data-testid="assistant-thinking" />}
          <div ref={end} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input data-testid="assistant-input" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={messages.length ? 'Ask a follow-up…' : 'Ask a question…'} aria-label="Your question" maxLength={600} className="min-w-0 flex-1 rounded-full border-2 border-paddy-100 bg-white px-5 py-3 text-sm outline-none focus:border-paddy-500" />
        <button type="button" data-testid="assistant-ask" onClick={() => ask()} disabled={asking || !question.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-paddy-900 px-5 py-3 text-sm font-semibold text-rice-50 transition hover:bg-paddy-700 disabled:cursor-not-allowed disabled:bg-ink-500/40">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" /> {asking ? 'Asking…' : 'Ask'}
        </button>
      </div>
    </section>
  );
}
