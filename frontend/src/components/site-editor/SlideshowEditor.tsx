'use client';

import { useId, useState } from 'react';
import { Film, Link2, Upload } from 'lucide-react';
import { ApiError, type SiteMediaItem, siteApi, siteMediaUrl } from '@/lib/api-client';
import { type SiteContent, type SiteSlide, newEntryId, slideSrc } from '@/lib/site-content';
import { AddButton, RowButtons, TextField, inputClass, move, smallButton } from './fields';

type Slideshow = SiteContent['slideshow'];

const IMAGE_LIMIT = 4 * 1024 * 1024;
const VIDEO_LIMIT = 15 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/webm';
const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;

/**
 * A big phone photo is often 5 MB or more: slow for every visitor and heavy for the database. Anything over
 * about 900 KB is shrunk in the browser (longest side 2200 px, JPEG) before it is sent. Small files go as they are.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.size <= 900 * 1024) return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, name: file.name };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? { blob, name: file.name.replace(/\.\w+$/, '') + '.jpg' } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}

function Thumb({ slide }: { slide: Pick<SiteSlide, 'type' | 'mediaId' | 'url' | 'alt'> }) {
  const src = slideSrc(slide as SiteSlide);
  if (!src) return <div className="grid h-[68px] w-[120px] shrink-0 place-items-center rounded-lg bg-ink-500/10 text-xs text-ink-500">No file</div>;
  return slide.type === 'VIDEO' ? (
    <video src={src} muted playsInline preload="metadata" aria-label={slide.alt || 'Video preview'} className="h-[68px] w-[120px] shrink-0 rounded-lg bg-black object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={slide.alt || 'Picture preview'} className="h-[68px] w-[120px] shrink-0 rounded-lg bg-ink-500/10 object-cover" />
  );
}

export function SlideshowEditor({ value, onChange, media, accessToken, onMediaChanged, alsoUsed = [] }: { value: Slideshow; onChange: (next: Slideshow) => void; media: SiteMediaItem[]; accessToken: string; onMediaChanged: () => Promise<void>; alsoUsed?: string[] }) {
  const fileId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');

  const slides = value.slides;
  const setSlides = (next: SiteSlide[]) => onChange({ ...value, slides: next });
  const patch = (i: number, p: Partial<SiteSlide>) => setSlides(slides.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const usedInDraft = new Set([...slides.map((s) => s.mediaId).filter((x): x is string => !!x), ...alsoUsed]);
  const fileOf = (id: string | null) => (id ? media.find((m) => m.id === id) : undefined);

  const addUploaded = (m: SiteMediaItem) => setSlides([...slides, { id: newEntryId(), type: m.kind, mediaId: m.id, url: null, alt: '', caption: '', enabled: true }]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    const added: SiteSlide[] = [];
    for (const original of Array.from(files)) {
      const isImage = /^image\/(jpeg|png|webp)$/.test(original.type);
      const isVideo = /^video\/(mp4|webm)$/.test(original.type);
      if (!isImage && !isVideo) {
        setProblem(`"${original.name}" is not supported. Use a JPEG, PNG or WebP picture, or an MP4 or WebM video.`);
        continue;
      }
      if (isVideo && original.size > VIDEO_LIMIT) {
        setProblem(`"${original.name}" is ${mb(original.size)}. A video can be at most ${mb(VIDEO_LIMIT)}: use a short clip of 10 to 20 seconds.`);
        continue;
      }
      try {
        setBusy(`Uploading ${original.name} (${mb(original.size)})…`);
        const prepared = isImage ? await prepareImage(original) : { blob: original as Blob, name: original.name };
        if (isImage && prepared.blob.size > IMAGE_LIMIT) {
          setProblem(`"${original.name}" is still ${mb(prepared.blob.size)} after shrinking. A picture can be at most ${mb(IMAGE_LIMIT)}.`);
          continue;
        }
        const item = await siteApi.uploadMedia(accessToken, prepared.blob, prepared.name);
        added.push({ id: newEntryId(), type: item.kind, mediaId: item.id, url: null, alt: '', caption: '', enabled: true });
      } catch (err) {
        setProblem(err instanceof ApiError ? err.message : `"${original.name}" could not be uploaded. Please try again.`);
      }
    }
    setBusy(null);
    if (added.length > 0) {
      setSlides([...slides, ...added]);
      await onMediaChanged();
    }
  };

  const addLink = () => {
    setProblem(null);
    const url = linkUrl.trim();
    if (!/^https:\/\/[^\s<>"']{4,480}$/.test(url)) {
      setProblem('A link must start with https:// and be the direct address of a picture or video file.');
      return;
    }
    setSlides([...slides, { id: newEntryId(), type: linkType, mediaId: null, url, alt: '', caption: '', enabled: true }]);
    setLinkUrl('');
  };

  const removeFile = async (m: SiteMediaItem) => {
    setProblem(null);
    try {
      await siteApi.deleteMedia(accessToken, m.id);
      await onMediaChanged();
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That file could not be deleted.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <label htmlFor={`${fileId}-interval`} className="text-sm font-medium text-ink-700">Seconds each picture is shown</label>
        <input
          id={`${fileId}-interval`}
          type="number"
          min={3}
          max={30}
          value={value.intervalSeconds}
          onChange={(e) => onChange({ ...value, intervalSeconds: Math.round(Number(e.target.value)) || 6 })}
          className={`${inputClass} mt-1`}
        />
        <p className="mt-1 text-xs text-ink-500">From 3 to 30. A video plays to its end before the next slide.</p>
      </div>

      {slides.length === 0 ? (
        <p className="rounded-xl bg-rice-50 px-4 py-3 text-sm text-ink-500">No slideshow yet: visitors see the Pectra Rice photo. Add pictures or short videos below and they will rotate across the top of the homepage.</p>
      ) : (
        <ol className="space-y-3" aria-label="Slides, in the order they rotate">
          {slides.map((s, i) => {
            const f = fileOf(s.mediaId);
            return (
              <li key={s.id} data-testid="slide-row" className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row ${s.enabled ? 'border-paddy-100' : 'border-ink-500/15 bg-ink-500/5'}`}>
                <Thumb slide={s} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                    <span className="rounded-full bg-paddy-100 px-2 py-0.5 font-medium text-paddy-900">{s.type === 'VIDEO' ? 'Video' : 'Picture'}</span>
                    <span className="truncate">{f ? f.fileName : s.url ? new URL(s.url).host : 'Uploaded file'}</span>
                    {!s.enabled && <span className="font-medium text-soil-700">Hidden</span>}
                  </p>
                  <TextField label="Description (for people who cannot see it)" value={s.alt} max={160} onChange={(v) => patch(i, { alt: v })} />
                  <TextField label="Caption shown on the slide (optional)" value={s.caption} max={120} onChange={(v) => patch(i, { caption: v })} />
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" checked={s.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} className="h-4 w-4 rounded border-paddy-100" /> Show this slide
                  </label>
                </div>
                <RowButtons what={`slide ${i + 1}`} first={i === 0} last={i === slides.length - 1} onUp={() => setSlides(move(slides, i, -1))} onDown={() => setSlides(move(slides, i, 1))} onRemove={() => setSlides(slides.filter((_, j) => j !== i))} />
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={fileId} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-paddy-900 px-5 py-2.5 text-sm font-medium text-rice-50 transition hover:bg-paddy-700">
          <Upload className="h-4 w-4" aria-hidden="true" /> Upload pictures or videos
        </label>
        <input id={fileId} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        <span className="text-xs text-ink-500">Pictures: JPEG, PNG or WebP, up to 4 MB (large ones are shrunk for you). Videos: MP4 or WebM, up to 15 MB.</span>
      </div>
      {busy && <p role="status" className="text-sm text-paddy-700">{busy}</p>}
      {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{problem}</p>}

      <details className="rounded-xl border border-paddy-100 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700"><Link2 className="h-4 w-4" aria-hidden="true" /> Add one by link instead</summary>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label="Link to a picture or video" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com/farm.jpg" className={inputClass} />
          <select aria-label="Type of the linked file" value={linkType} onChange={(e) => setLinkType(e.target.value as 'IMAGE' | 'VIDEO')} className={`${inputClass} sm:w-36`}>
            <option value="IMAGE">Picture</option>
            <option value="VIDEO">Video</option>
          </select>
          <AddButton onClick={addLink}>Add</AddButton>
        </div>
        <p className="mt-2 text-xs text-ink-500">Use this for a large video hosted elsewhere. It must be the direct https:// address of the file, not a YouTube page.</p>
      </details>

      {media.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-paddy-900">Your uploaded files</h3>
          <ul className="mt-2 divide-y divide-paddy-100 rounded-xl border border-paddy-100">
            {media.map((m) => {
              const inDraft = usedInDraft.has(m.id);
              return (
                <li key={m.id} data-testid="library-row" className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  {m.kind === 'VIDEO' ? <span className="grid h-10 w-16 shrink-0 place-items-center rounded bg-black text-white"><Film className="h-4 w-4" aria-hidden="true" /></span> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={siteMediaUrl(m.id)} alt="" className="h-10 w-16 shrink-0 rounded bg-ink-500/10 object-cover" />
                  )}
                  <span className="min-w-0 flex-1 text-sm"><span className="block truncate font-medium text-ink-900">{m.fileName}</span><span className="text-xs text-ink-500">{m.kind === 'VIDEO' ? 'Video' : 'Picture'}, {mb(m.sizeBytes)}{inDraft || m.inUse ? ', in use' : ''}</span></span>
                  {!inDraft && <button type="button" className={smallButton} onClick={() => addUploaded(m)}>Add to slideshow</button>}
                  <button type="button" className={`${smallButton} text-red-700`} disabled={inDraft || m.inUse} title={inDraft || m.inUse ? 'Stop using it on the homepage (and save) first' : undefined} onClick={() => void removeFile(m)}>Delete</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
