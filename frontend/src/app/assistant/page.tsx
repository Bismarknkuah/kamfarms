'use client';

import { useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { aiApi, AssistantAnswer, ApiError } from '@/lib/api-client';

const SUGGESTED = [
  'What is the current paddy stock?',
  'Which farm has the highest output?',
  'Which customers owe us money?',
  'What is our sales performance this month?',
  'What is the recovery rate this period?',
];

export default function AssistantPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const onAsk = async (q?: string) => {
    const finalQuestion = q ?? question;
    if (!accessToken || !finalQuestion.trim()) return;
    setAsking(true);
    setAskError(null);
    try {
      const result = await aiApi.ask(accessToken, finalQuestion);
      setAnswer(result);
      setQuestion(finalQuestion);
    } catch (err) {
      setAskError(err instanceof ApiError ? err.message : 'Failed to get an answer.');
    } finally {
      setAsking(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">AI Assistant</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-500">
        Answers a small, fixed set of recognized questions using real data — not a general chatbot. Every
        answer shows exactly what it&rsquo;s based on, so you know when to trust it.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="rounded-full border border-husk-500 px-3 py-1.5 text-xs font-medium text-paddy-900 hover:bg-husk-500 hover:text-white"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAsk()}
          placeholder="Ask a question…"
          className="flex-1 rounded-lg border border-paddy-100 px-3 py-2.5 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
        />
        <button
          type="button"
          onClick={() => onAsk()}
          disabled={asking || !question.trim()}
          className="rounded-full bg-paddy-900 px-6 py-2.5 text-sm font-medium text-rice-50 disabled:opacity-50"
        >
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {askError && <p className="mt-4 text-sm text-red-600">{askError}</p>}

      {answer && (
        <div className="mt-6 rounded-2xl border border-paddy-100 bg-white p-6">
          <p className="text-base text-ink-900">{answer.answer}</p>
          <div className="mt-4 grid gap-3 border-t border-paddy-100 pt-4 text-xs text-ink-500 sm:grid-cols-3">
            <div>
              <p className="font-medium uppercase tracking-wide">Source</p>
              <p className="mt-0.5">{answer.sourceData}</p>
            </div>
            <div>
              <p className="font-medium uppercase tracking-wide">Date range</p>
              <p className="mt-0.5">{answer.dateRange}</p>
            </div>
            <div>
              <p className="font-medium uppercase tracking-wide">Confidence</p>
              <p className="mt-0.5">{answer.confidencePercent}%</p>
            </div>
          </div>
          {answer.assumptions && (
            <p className="mt-3 border-t border-paddy-100 pt-3 text-xs italic text-ink-500">{answer.assumptions}</p>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
