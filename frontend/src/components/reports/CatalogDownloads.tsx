'use client';

import { useEffect, useState } from 'react';
import { ApiError, type CatalogReport, reportCatalogApi } from '@/lib/api-client';

const FORMATS = [{ value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'Excel' }, { value: 'pdf', label: 'PDF' }] as const;

/**
 * Every other report this person's role may download, each limited to their own farms, warehouses and milling
 * centers by the server. The list comes from the server too, so a role is only ever shown what it can really get.
 */
export function CatalogDownloads({ accessToken, from, to }: { accessToken: string; from: string; to: string }) {
  const [reports, setReports] = useState<CatalogReport[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    reportCatalogApi.list(accessToken).then(setReports).catch((e: unknown) => {
      setReports([]);
      if (!(e instanceof ApiError && e.status === 404)) setProblem('The list of more reports could not be loaded just now.');
    });
  }, [accessToken]);

  if (reports === null) return null;
  if (reports.length === 0 && !problem) return null;
  const groups = Array.from(new Set(reports.map((r) => r.group)));

  const download = async (r: CatalogReport, format: 'csv' | 'xlsx' | 'pdf') => {
    setBusy(`${r.id}:${format}`);
    setErrors((e) => ({ ...e, [r.id]: '' }));
    try {
      await reportCatalogApi.download(accessToken, r.id, { format, from: r.dated ? from : undefined, to: r.dated ? to : undefined });
    } catch (err) {
      setErrors((e) => ({ ...e, [r.id]: err instanceof ApiError ? err.message : 'Failed to download.' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10" data-testid="report-catalog" aria-labelledby="more-reports">
      <h2 id="more-reports" className="font-display text-xl font-medium text-paddy-900">More reports for your role</h2>
      <p className="mt-1 text-sm text-ink-500">Each report contains only what is in your own jurisdiction, as shown on its card. The period above applies to reports that have dates.</p>
      {problem && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
      {groups.map((g) => (
        <div key={g} className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{g}</h3>
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            {reports.filter((r) => r.group === g).map((r) => (
              <div key={r.id} data-testid="catalog-report" data-id={r.id} className="rounded-2xl border border-paddy-100 bg-white p-5">
                <h4 className="font-display text-lg font-medium text-paddy-900">{r.title}</h4>
                <p className="mt-1 text-sm text-ink-500">{r.description}</p>
                <p className="mt-2 inline-block rounded-full bg-paddy-50 px-3 py-1 text-xs font-medium text-paddy-900" data-testid="jurisdiction">{r.jurisdiction}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {FORMATS.map((f) => (
                    <button key={f.value} type="button" disabled={busy !== null} onClick={() => void download(r, f.value)} className="rounded-full border border-paddy-100 px-4 py-1.5 text-sm font-medium text-paddy-900 transition hover:bg-paddy-50 disabled:opacity-50">
                      {busy === `${r.id}:${f.value}` ? 'Downloading…' : f.label}
                    </button>
                  ))}
                </div>
                {errors[r.id] && <p role="alert" className="mt-2 text-sm text-red-600">{errors[r.id]}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
