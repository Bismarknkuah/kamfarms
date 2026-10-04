'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Trash2, Upload, X } from 'lucide-react';
import { ApiError, SalesOrder, SalesReceiptInfo, salesOrdersApi } from '@/lib/api-client';

const MAX_SIDE = 1800;
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** A phone photo can be 5 to 10 MB. Shrunk to a clear 1800 px JPEG before it is sent, it is a few hundred KB: quick on mobile data,
 * still easy to read. A PDF, or a photo that is already small, goes as it is. If anything about shrinking fails, the original is sent. */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith('image/')) return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === 'image/jpeg') return { blob: file, name: file.name };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, name: file.name };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ? { blob, name: `${file.name.replace(/\.[A-Za-z0-9]+$/, '') || 'receipt'}.jpg` } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}

function ReceiptCard({ orderId, r, accessToken, canRemove, onRemove }: { orderId: string; r: SalesReceiptInfo; accessToken: string; canRemove: boolean; onRemove: () => void }) {
  const isImage = r.mimeType.startsWith('image/');
  const [thumb, setThumb] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let live = true;
    let url: string | null = null;
    salesOrdersApi
      .receiptFile(accessToken, orderId, r.id)
      .then((b) => { if (live) { url = URL.createObjectURL(b); setThumb(url); } })
      .catch(() => { if (live) setError('This receipt could not be loaded.'); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [accessToken, orderId, r.id, isImage]);

  const openPdf = async () => {
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await salesOrdersApi.receiptFile(accessToken, orderId, r.id));
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) {
      w?.close();
      setError(messageOf(e, 'This receipt could not be opened.'));
    }
  };

  return (
    <li className="flex gap-3 rounded-xl border border-paddy-100 bg-white p-3" data-testid="receipt-card">
      {isImage ? (
        <button type="button" onClick={() => thumb && setZoom(true)} aria-label={`Open receipt ${r.fileName}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-rice-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb ? <img src={thumb} alt={`Receipt ${r.fileName}`} className="h-full w-full object-cover" /> : <span className="text-[10px] text-ink-500">...</span>}
        </button>
      ) : (
        <button type="button" onClick={openPdf} aria-label={`Open receipt ${r.fileName}`} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-rice-50 text-paddy-700">
          <FileText className="h-7 w-7" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0 flex-1 text-xs">
        <p className="truncate font-medium text-ink-900">{r.fileName}</p>
        <p className="text-ink-500">{size(r.sizeBytes)} &middot; added by {r.uploadedByName}, {when(r.createdAt)}</p>
        {r.note && <p className="mt-0.5 text-ink-700">{r.note}</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </div>
      {canRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove receipt ${r.fileName}`} className="self-start rounded-full p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-700">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {zoom && thumb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)} role="dialog" aria-modal="true" aria-label="Receipt">
          <button type="button" onClick={() => setZoom(false)} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/90 p-2"><X className="h-5 w-5" aria-hidden="true" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt={`Receipt ${r.fileName}`} className="max-h-full max-w-full rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </li>
  );
}

/**
 * The payment receipts kept with an order. The Sales Officer adds them by taking a photo with their phone or choosing a file
 * (photo or PDF) from the phone or computer: no links. Everyone who can see the order can open them, so the Finance Director and the
 * Managing Director can check the payment before they decide.
 */
export function ReceiptsPanel({ order, accessToken, canUpload, canRemove, onChanged }: { order: SalesOrder; accessToken: string; canUpload: boolean; canRemove: boolean; onChanged: () => void }) {
  const receipts = order.receipts ?? [];
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, name } = await prepareImage(file);
      await salesOrdersApi.uploadReceipt(accessToken, order.id, blob, name, note.trim() || undefined);
      setNote('');
      onChanged();
    } catch (e) {
      setError(messageOf(e, 'The receipt could not be uploaded. Please try again.'));
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (chooser.current) chooser.current.value = '';
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await salesOrdersApi.removeReceipt(accessToken, order.id, id);
      onChanged();
    } catch (e) {
      setError(messageOf(e, 'The receipt could not be removed.'));
    }
  };

  return (
    <div className="space-y-3" data-testid="receipts-panel">
      <p className="text-xs font-medium uppercase tracking-wide text-soil-500">Payment receipts{receipts.length > 0 ? ` (${receipts.length})` : ''}</p>

      {receipts.length > 0 && (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <ReceiptCard key={r.id} orderId={order.id} r={r} accessToken={accessToken} canRemove={canRemove} onRemove={() => remove(r.id)} />
          ))}
        </ul>
      )}
      {order.receiptUrl && (
        <p className="text-xs text-ink-500">
          An earlier receipt was added as a link: <a href={order.receiptUrl} target="_blank" rel="noreferrer" className="font-medium text-paddy-700 underline">open it</a>
        </p>
      )}
      {receipts.length === 0 && !order.receiptUrl && (
        <p className="rounded-lg bg-rice-50 px-3 py-2 text-xs text-ink-500">
          {canUpload ? 'No receipt yet. Add a photo or PDF of the payment so Finance can check it.' : 'No payment receipt has been uploaded for this order.'}
        </p>
      )}

      {canUpload && (
        <div className="space-y-2 rounded-xl border border-dashed border-paddy-100 p-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="What is it for? e.g. 50% deposit, mobile money (optional)"
            aria-label="What the receipt is for"
            className="w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {/* A phone opens its camera for the first, and its photos or files for the second; a computer opens a file chooser for both. */}
            <input ref={camera} data-testid="receipt-camera-input" type="file" accept="image/*" capture="environment" className="sr-only" id={`cam-${order.id}`} onChange={(e) => send(e.target.files?.[0])} />
            <label htmlFor={`cam-${order.id}`} className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-paddy-900 px-4 py-2 text-xs font-medium text-rice-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              <Camera className="h-4 w-4" aria-hidden="true" /> Take a photo
            </label>
            <input ref={chooser} data-testid="receipt-file-input" type="file" accept="image/*,application/pdf" className="sr-only" id={`file-${order.id}`} onChange={(e) => send(e.target.files?.[0])} />
            <label htmlFor={`file-${order.id}`} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-paddy-700 px-4 py-2 text-xs font-medium text-paddy-700 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              <Upload className="h-4 w-4" aria-hidden="true" /> Choose a photo or PDF
            </label>
          </div>
          {busy && <p role="status" className="text-xs text-ink-500">Uploading the receipt...</p>}
          <p className="text-xs text-ink-500">Photos are shrunk for you before sending. JPEG, PNG, WebP or PDF, up to 10 MB each.</p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
