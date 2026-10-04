'use client';

import { useState } from 'react';
import { Bot, ChevronDown, MapPin, SendHorizontal } from 'lucide-react';
import { ApiError, aiApi, type AssistantAnswer } from '@/lib/api-client';

const SUGGESTED = [
  'What does 1 kWh of power produce?',
  'What is the current paddy stock?',
  'Which farm has the highest output?',
  'What is the recovery rate this period?',
  'Which customers owe us money?',
  'What is our sales performance this month?',
];

/** The question box. It answers a fixed set of questions from real data, says whose activities the answer covers, and shows what it rests on. */
export function AssistantPanel({ accessToken }: { accessToken: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ask = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || asking) return;
    setQuestion(text);
    setAsking(true);
    setProblem(null);
    try {
      setAnswer(await aiApi.ask(accessToken, text));
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not get an answer. Please try again.');
    } finally {
      setAsking(false);
    }
  };

  const pct = answer ? Math.max(0, Math.min(100, answer.confidencePercent)) : 0;
  return (
    <section data-testid="assistant" className="rounded-3xl border border-paddy-100 bg-white p-5 shadow-sm sm:p-7" aria-label="Ask a question">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paddy-900 text-husk-300"><Bot className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h2 className="font-display text-2xl font-medium text-paddy-900">Ask a question</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-500">Answers a fixed set of questions from real data. It is not a general chatbot, and every answer shows what it is based on.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Suggested questions">
        {SUGGESTED.map((s) => (
          <button key={s} type="button" data-testid="assistant-chip" onClick={() => ask(s)} disabled={asking}
            className="rounded-full border border-husk-500/60 bg-husk-100/30 px-3.5 py-1.5 text-sm text-soil-700 transition hover:bg-husk-100 disabled:opacity-50">{s}</button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input data-testid="assistant-input" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="Ask a question…" aria-label="Your question" className="min-w-0 flex-1 rounded-full border-2 border-paddy-100 bg-white px-5 py-3 text-sm outline-none focus:border-paddy-500" />
        <button type="button" data-testid="assistant-ask" onClick={() => ask()} disabled={asking || !question.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-paddy-900 px-5 py-3 text-sm font-semibold text-rice-50 transition hover:bg-paddy-700 disabled:cursor-not-allowed disabled:bg-ink-500/40">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" /> {asking ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {problem && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="assistant-error">{problem}</p>}
      {asking && <div className="mt-4 h-24 animate-pulse rounded-2xl bg-rice-50" aria-hidden="true" />}

      {answer && !asking && (
        <div data-testid="assistant-answer" className="mt-5 rounded-2xl border border-paddy-100 bg-rice-50 p-5">
          <p className="font-display text-xl leading-snug text-paddy-900" data-testid="assistant-answer-text">{answer.answer}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-700">
            {answer.jurisdiction && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium" data-testid="assistant-jurisdiction"><MapPin className="h-3.5 w-3.5 text-paddy-700" aria-hidden="true" /> Covers: {answer.jurisdiction}</span>}
            <span className="inline-flex items-center gap-2" data-testid="assistant-confidence">
              Confidence
              <span className="h-2 w-28 overflow-hidden rounded-full bg-ink-500/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-paddy-700" style={{ width: `${pct}%` }} /></span>
              <strong className="text-paddy-900">{pct}%</strong>
            </span>
          </div>
          <details className="group mt-4 rounded-xl bg-white px-4 py-3 text-sm" data-testid="assistant-basis">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-paddy-900">What this is based on <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" /></summary>
            <dl className="mt-3 space-y-2 text-ink-700">
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Source</dt><dd>{answer.sourceData}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Period</dt><dd>{answer.dateRange}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">Assumptions</dt><dd>{answer.assumptions}</dd></div>
            </dl>
          </details>
        </div>
      )}
    </section>
  );
}
