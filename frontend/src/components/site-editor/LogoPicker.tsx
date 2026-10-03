'use client';

import { useId, useState } from 'react';
import { Upload } from 'lucide-react';
import { ApiError, type SiteMediaItem, siteApi, siteMediaUrl } from '@/lib/api-client';
import { prepareImage } from './SlideshowEditor';
import { smallButton } from './fields';

const LIMIT = 4 * 1024 * 1024;

/** Choose the logo shown in the website's top bar and on the sign-in page: upload one, pick a picture already uploaded, or use the default wheat icon. */
export function LogoPicker({ logoMediaId, onChange, media, accessToken, onMediaChanged }: { logoMediaId: string | null; onChange: (id: string | null) => void; media: SiteMediaItem[]; accessToken: string; onMediaChanged: () => Promise<void> }) {
  const fileId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pictures = media.filter((m) => m.kind === 'IMAGE');

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setProblem(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setProblem('A logo must be a JPEG, PNG or WebP picture.'); return; }
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      if (prepared.blob.size > LIMIT) { setProblem('That picture is too large. A logo can be at most 4 MB.'); return; }
      const item = await siteApi.uploadMedia(accessToken, prepared.blob, prepared.name);
      onChange(item.id);
      await onMediaChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'The logo could not be uploaded. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="logo-picker">
      <p className="text-sm font-medium text-ink-700">Logo</p>
      <div className="flex flex-wrap items-center gap-4">
        {logoMediaId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={siteMediaUrl(logoMediaId)} alt="Current logo" className="h-16 w-16 rounded-full border border-paddy-100 bg-white object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-husk-500 text-xs font-medium text-paddy-900">Wheat icon</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={fileId} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-paddy-900 px-4 py-2 text-sm font-medium text-rice-50 hover:bg-paddy-700"><Upload className="h-4 w-4" aria-hidden="true" /> Upload a logo</label>
          <input id={fileId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          {logoMediaId && <button type="button" className={smallButton} onClick={() => onChange(null)}>Use the wheat icon instead</button>}
        </div>
      </div>
      {busy && <p role="status" className="text-sm text-paddy-700">Uploading…</p>}
      {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}
      {pictures.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-ink-700">Or choose one you have already uploaded</summary>
          <ul className="mt-2 flex flex-wrap gap-2">
            {pictures.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onChange(m.id)} aria-pressed={m.id === logoMediaId} aria-label={`Use ${m.fileName} as the logo`} className={`rounded-full border-2 p-0.5 ${m.id === logoMediaId ? 'border-paddy-900' : 'border-transparent hover:border-paddy-300'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={siteMediaUrl(m.id)} alt="" className="h-12 w-12 rounded-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-ink-500">A square picture works best. It is shown as a circle.</p>
    </div>
  );
}
