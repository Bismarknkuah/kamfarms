'use client';

import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { tasksApi, Task, ApiError } from '@/lib/api-client';

const STATUS_STYLES: Record<string, string> = {
  TODO: 'bg-ink-500/10 text-ink-700',
  IN_PROGRESS: 'bg-husk-300 text-soil-700',
  BLOCKED: 'bg-red-100 text-red-700',
  SUBMITTED: 'bg-paddy-100 text-paddy-700',
  REVIEW: 'bg-paddy-100 text-paddy-700',
  COMPLETED: 'bg-paddy-700 text-rice-50',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

export default function TasksPage() {
  const { me, accessToken, loading, error } = useCurrentUser();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');

  const loadTasks = (token: string) => {
    tasksApi
      .listMine(token)
      .then(setTasks)
      .catch((err: unknown) => setTasksError(err instanceof ApiError ? err.message : 'Failed to load tasks.'));
  };

  useEffect(() => {
    if (accessToken) loadTasks(accessToken);
  }, [accessToken]);

  const onComplete = async (taskId: string) => {
    if (!accessToken || !evidence.trim()) return;
    try {
      await tasksApi.updateStatus(accessToken, taskId, 'COMPLETED', evidence);
      setCompletingId(null);
      setEvidence('');
      loadTasks(accessToken);
    } catch (err) {
      setTasksError(err instanceof ApiError ? err.message : 'Failed to complete task.');
    }
  };

  const onStart = async (taskId: string) => {
    if (!accessToken) return;
    try {
      await tasksApi.updateStatus(accessToken, taskId, 'IN_PROGRESS');
      loadTasks(accessToken);
    } catch (err) {
      setTasksError(err instanceof ApiError ? err.message : 'Failed to update task.');
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  return (
    <DashboardShell me={me}>
      <h1 className="font-display text-2xl font-medium text-paddy-900">My tasks</h1>
      <p className="mt-1 text-sm text-ink-500">
        {tasks ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} assigned to you` : 'Loading…'}
      </p>

      {tasksError && <p className="mt-4 text-sm text-red-600">{tasksError}</p>}

      {tasks && (
        <div className="mt-6 space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-ink-500">{task.taskNumber}</p>
                  <h3 className="mt-0.5 font-display text-lg text-paddy-900">{task.title}</h3>
                  {task.description && <p className="mt-1 text-sm text-ink-500">{task.description}</p>}
                  {task.dueDate && (
                    <p className="mt-2 text-xs text-ink-500">
                      Due {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[task.status] ?? 'bg-ink-500/10 text-ink-700'}`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>

              {!['COMPLETED', 'CANCELLED', 'REJECTED'].includes(task.status) && (
                <div className="mt-4 border-t border-paddy-100 pt-4">
                  {completingId === task.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        placeholder="Describe what was done to complete this task…"
                        className="w-full rounded-lg border border-paddy-100 px-3 py-2 text-sm outline-none focus:border-paddy-500 focus:ring-2 focus:ring-paddy-500/20"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onComplete(task.id)}
                          disabled={!evidence.trim()}
                          className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50 disabled:opacity-50"
                        >
                          Confirm complete
                        </button>
                        <button
                          type="button"
                          onClick={() => { setCompletingId(null); setEvidence(''); }}
                          className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {task.status === 'TODO' && (
                        <button
                          type="button"
                          onClick={() => onStart(task.id)}
                          className="rounded-full border border-paddy-100 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-paddy-50"
                        >
                          Start
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setCompletingId(task.id)}
                        className="rounded-full bg-paddy-900 px-4 py-1.5 text-xs font-medium text-rice-50"
                      >
                        Mark complete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="rounded-2xl border border-paddy-100 bg-white p-8 text-center text-sm text-ink-500">
              No tasks assigned to you right now.
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
