'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { DashboardShell } from '@/components/DashboardShell';
import { ApiError, type SiteMediaItem, siteApi } from '@/lib/api-client';
import { type SiteContent, cleanSiteContentForSave, mergeSiteContent, newEntryId } from '@/lib/site-content';
import { AddButton, Panel, RowButtons, StringList, TextField, move, smallButton } from '@/components/site-editor/fields';
import { SlideshowEditor } from '@/components/site-editor/SlideshowEditor';
import { LogoPicker } from '@/components/site-editor/LogoPicker';

const SECTIONS = [
  ['slideshow', 'Slideshow'], ['brand', 'Brand and logo'], ['hero', 'Top of the page'], ['numbers', 'Numbers'], ['about', 'About us'],
  ['operations', 'What we do'], ['product', 'Product'], ['contact-details', 'Contact details'], ['locations', 'Sales points'], ['signin', 'Sign-in page'], ['footer', 'Footer'],
] as const;

const card = 'rounded-xl border border-paddy-100 p-4';

export default function SiteEditorPage() {
  const { me, accessToken, loading, error, hasPermission } = useCurrentUser();
  const canEdit = !!me && hasPermission('site.manage');

  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [saved, setSaved] = useState('');
  const [meta, setMeta] = useState<{ version: number; updatedAt: string | null; by: string | null }>({ version: 0, updatedAt: null, by: null });
  const [media, setMedia] = useState<SiteMediaItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const applySaved = useCallback((res: { content: SiteContent | null; version: number; updatedAt: string | null; updatedBy?: { firstName: string; lastName: string } | null }) => {
    const merged = mergeSiteContent(res.content);
    setDraft(merged);
    setSaved(JSON.stringify(merged));
    setMeta({ version: res.version, updatedAt: res.updatedAt, by: res.updatedBy ? `${res.updatedBy.firstName} ${res.updatedBy.lastName}` : null });
  }, []);

  const refreshMedia = useCallback(async () => {
    if (accessToken) setMedia(await siteApi.listMedia(accessToken));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !canEdit) return;
    Promise.all([siteApi.getAdminContent(accessToken), siteApi.listMedia(accessToken)])
      .then(([res, files]) => {
        applySaved(res);
        setMedia(files);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError && err.status === 404 ? 'Your server does not have the homepage editor yet. Update the server (API) first: the Overview page explains how.' : err instanceof ApiError ? err.message : 'Could not load the homepage content.'));
  }, [accessToken, canEdit, applySaved]);

  const dirty = draft !== null && JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-ink-500">Loading…</p></main>;
  if (error || !me) return <main className="flex min-h-screen items-center justify-center bg-rice-50"><p className="text-sm text-red-600">{error}</p></main>;

  if (!canEdit) {
    return (
      <DashboardShell me={me}>
        <h1 className="font-display text-2xl font-medium text-paddy-900">Homepage</h1>
        <p className="mt-3 rounded-xl bg-husk-100/50 px-4 py-3 text-sm text-soil-700">Only the System Administrator can edit the public homepage.</p>
      </DashboardShell>
    );
  }

  const update = (fn: (d: SiteContent) => SiteContent) => {
    setStatus(null); // an edit makes the last message ("Saved", or an error) stale
    setDraft((d) => (d ? fn(d) : d));
  };
  const setHero = (p: Partial<SiteContent['hero']>) => update((d) => ({ ...d, hero: { ...d.hero, ...p } }));
  const setAbout = (p: Partial<SiteContent['about']>) => update((d) => ({ ...d, about: { ...d.about, ...p } }));
  const setOperations = (p: Partial<SiteContent['operations']>) => update((d) => ({ ...d, operations: { ...d.operations, ...p } }));
  const setProducts = (p: Partial<SiteContent['products']>) => update((d) => ({ ...d, products: { ...d.products, ...p } }));
  const setContact = (p: Partial<SiteContent['contact']>) => update((d) => ({ ...d, contact: { ...d.contact, ...p } }));
  const setBrand = (p: Partial<SiteContent['brand']>) => update((d) => ({ ...d, brand: { ...d.brand, ...p } }));
  const setSignin = (p: Partial<SiteContent['signin']>) => update((d) => ({ ...d, signin: { ...d.signin, ...p } }));
  const setFooter = (p: Partial<SiteContent['footer']>) => update((d) => ({ ...d, footer: { ...d.footer, ...p } }));

  const save = async () => {
    if (!draft || !accessToken) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await siteApi.saveContent(accessToken, cleanSiteContentForSave(draft));
      applySaved(res);
      await refreshMedia();
      setStatus({ kind: 'ok', text: 'Saved. The homepage shows your changes straight away.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft(JSON.parse(saved) as SiteContent);
    setStatus(null);
  };

  const reset = async () => {
    if (!accessToken) return;
    setConfirmReset(false);
    setStatus(null);
    try {
      applySaved(await siteApi.resetContent(accessToken));
      setStatus({ kind: 'ok', text: 'The homepage is back to its original text, with no slideshow. Your uploaded files are kept.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not reset. Please try again.' });
    }
  };

  const metaLine = meta.updatedAt
    ? `Last saved ${new Date(meta.updatedAt).toLocaleString()}${meta.by ? ` by ${meta.by}` : ''}`
    : 'Showing the original text. Nothing has been changed yet.';

  return (
    <DashboardShell me={me}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium text-paddy-900">Homepage</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">Change what visitors see on the public homepage: the words, the sales points, and the pictures and videos that rotate across the top. Nothing goes live until you press Save.</p>
        </div>
        <a href="/" target="_blank" rel="noreferrer" className={smallButton}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> View the homepage</a>
      </div>

      {loadError && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}
      {!draft && !loadError && <p className="mt-6 text-sm text-ink-500">Loading the homepage content…</p>}

      {draft && (
        <>
          <nav aria-label="Sections of the editor" className="mt-5 flex flex-wrap gap-2">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className={smallButton}>{label}</a>)}
          </nav>

          <div className="mt-6 max-w-5xl space-y-6">
            <Panel id="slideshow" title="Slideshow" hint="Pictures and short videos that rotate full-screen behind the top of the homepage, and behind the sign-in page (pictures only).">
              <SlideshowEditor value={draft.slideshow} onChange={(slideshow) => update((d) => ({ ...d, slideshow }))} media={media} accessToken={accessToken as string} onMediaChanged={refreshMedia} alsoUsed={draft.brand.logoMediaId ? [draft.brand.logoMediaId] : []} />
            </Panel>

            <Panel id="brand" title="Brand and logo" hint="The name and logo in the website's top bar and on the sign-in page.">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Name" value={draft.brand.name} max={30} onChange={(v) => setBrand({ name: v })} />
                <TextField label="Line under the name" value={draft.brand.subtitle} max={60} onChange={(v) => setBrand({ subtitle: v })} />
              </div>
              <LogoPicker logoMediaId={draft.brand.logoMediaId} onChange={(id) => setBrand({ logoMediaId: id })} media={media} accessToken={accessToken as string} onMediaChanged={refreshMedia} />
            </Panel>

            <Panel id="hero" title="Top of the page">
              <TextField label="Small line above the heading" value={draft.hero.eyebrow} max={60} onChange={(v) => setHero({ eyebrow: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Heading, highlighted part" value={draft.hero.headlineAccent} max={60} onChange={(v) => setHero({ headlineAccent: v })} help="Shown in gold, before the rest of the heading." />
                <TextField label="Heading" value={draft.hero.headline} max={120} onChange={(v) => setHero({ headline: v })} />
              </div>
              <TextField label="Introduction" value={draft.hero.subheadline} max={400} rows={3} onChange={(v) => setHero({ subheadline: v })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="First button" value={draft.hero.primaryLabel} max={40} onChange={(v) => setHero({ primaryLabel: v })} />
                <TextField label="First button goes to" value={draft.hero.primaryHref} max={300} placeholder="#products" onChange={(v) => setHero({ primaryHref: v })} help="#products, #about, #contact, /login or a full https:// address." />
                <TextField label="Second button" value={draft.hero.secondaryLabel} max={40} onChange={(v) => setHero({ secondaryLabel: v })} />
                <TextField label="Second button goes to" value={draft.hero.secondaryHref} max={300} placeholder="#about" onChange={(v) => setHero({ secondaryHref: v })} />
              </div>
              <StringList label="Tick-list under the buttons" items={draft.hero.checklist} onChange={(checklist) => setHero({ checklist })} max={6} maxLen={100} addLabel="Add a line" />
            </Panel>

            <Panel id="numbers" title="Numbers" hint="The strip of up to four figures just below the top of the page.">
              {draft.stats.map((s, i) => (
                <div key={s.id} className={card} data-testid="stat-row">
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
                      <TextField label="Figure" value={s.value} max={24} placeholder="6" onChange={(v) => update((d) => ({ ...d, stats: d.stats.map((x, j) => (j === i ? { ...x, value: v } : x)) }))} />
                      <TextField label="Name" value={s.label} max={40} placeholder="Farms" onChange={(v) => update((d) => ({ ...d, stats: d.stats.map((x, j) => (j === i ? { ...x, label: v } : x)) }))} />
                      <TextField label="Small note" value={s.sub} max={80} onChange={(v) => update((d) => ({ ...d, stats: d.stats.map((x, j) => (j === i ? { ...x, sub: v } : x)) }))} />
                    </div>
                    <RowButtons what={`figure ${i + 1}`} first={i === 0} last={i === draft.stats.length - 1} onUp={() => update((d) => ({ ...d, stats: move(d.stats, i, -1) }))} onDown={() => update((d) => ({ ...d, stats: move(d.stats, i, 1) }))} onRemove={() => update((d) => ({ ...d, stats: d.stats.filter((_, j) => j !== i) }))} />
                  </div>
                </div>
              ))}
              {draft.stats.length < 4 && <AddButton onClick={() => update((d) => ({ ...d, stats: [...d.stats, { id: newEntryId(), label: '', value: '', sub: '' }] }))}>Add a figure</AddButton>}
            </Panel>

            <Panel id="about" title="About us">
              <TextField label="Small line above the heading" value={draft.about.eyebrow} max={60} onChange={(v) => setAbout({ eyebrow: v })} />
              <TextField label="Heading" value={draft.about.heading} max={120} onChange={(v) => setAbout({ heading: v })} />
              <StringList label="Paragraph" items={draft.about.paragraphs} onChange={(paragraphs) => setAbout({ paragraphs })} max={6} maxLen={1200} addLabel="Add a paragraph" />
              <StringList label="Tick-list" items={draft.about.highlights} onChange={(highlights) => setAbout({ highlights })} max={8} maxLen={120} addLabel="Add a line" />
              <TextField label="Heading of the places box" value={draft.about.workHeading} max={60} onChange={(v) => setAbout({ workHeading: v })} />
              {draft.about.work.map((w, i) => (
                <div key={w.id} className={card} data-testid="work-row">
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                      <TextField label="Place or activity" value={w.label} max={60} placeholder="Milling" onChange={(v) => setAbout({ work: draft.about.work.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                      <TextField label="Where or what" value={w.detail} max={200} placeholder="Sefwi Kanchabio" onChange={(v) => setAbout({ work: draft.about.work.map((x, j) => (j === i ? { ...x, detail: v } : x)) })} />
                    </div>
                    <RowButtons what={`place ${i + 1}`} first={i === 0} last={i === draft.about.work.length - 1} onUp={() => setAbout({ work: move(draft.about.work, i, -1) })} onDown={() => setAbout({ work: move(draft.about.work, i, 1) })} onRemove={() => setAbout({ work: draft.about.work.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              ))}
              {draft.about.work.length < 12 && <AddButton onClick={() => setAbout({ work: [...draft.about.work, { id: newEntryId(), label: '', detail: '' }] })}>Add a place to "Where we work"</AddButton>}
            </Panel>

            <Panel id="operations" title="What we do" hint="The cards under &quot;Our Core Operations&quot; (up to six).">
              <TextField label="Small line above the heading" value={draft.operations.eyebrow} max={60} onChange={(v) => setOperations({ eyebrow: v })} />
              <TextField label="Heading" value={draft.operations.heading} max={120} onChange={(v) => setOperations({ heading: v })} />
              <TextField label="Introduction" value={draft.operations.intro} max={400} rows={2} onChange={(v) => setOperations({ intro: v })} />
              {draft.operations.items.map((o, i) => (
                <div key={o.id} className={card} data-testid="operation-row">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-3">
                      <TextField label="Title" value={o.title} max={60} onChange={(v) => setOperations({ items: draft.operations.items.map((x, j) => (j === i ? { ...x, title: v } : x)) })} />
                      <TextField label="Description" value={o.body} max={300} rows={2} onChange={(v) => setOperations({ items: draft.operations.items.map((x, j) => (j === i ? { ...x, body: v } : x)) })} />
                    </div>
                    <RowButtons what={`card ${i + 1}`} first={i === 0} last={i === draft.operations.items.length - 1} onUp={() => setOperations({ items: move(draft.operations.items, i, -1) })} onDown={() => setOperations({ items: move(draft.operations.items, i, 1) })} onRemove={() => setOperations({ items: draft.operations.items.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              ))}
              {draft.operations.items.length < 6 && <AddButton onClick={() => setOperations({ items: [...draft.operations.items, { id: newEntryId(), title: '', body: '' }] })}>Add a card</AddButton>}
            </Panel>

            <Panel id="product" title="Product">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Small line above the name" value={draft.products.eyebrow} max={60} onChange={(v) => setProducts({ eyebrow: v })} />
                <TextField label="Product name" value={draft.products.name} max={80} onChange={(v) => setProducts({ name: v })} />
              </div>
              <TextField label="Tagline" value={draft.products.tagline} max={120} onChange={(v) => setProducts({ tagline: v })} />
              <TextField label="Description" value={draft.products.description} max={600} rows={3} onChange={(v) => setProducts({ description: v })} />
              <TextField label="Heading above the bag sizes" value={draft.products.sizesHeading} max={60} onChange={(v) => setProducts({ sizesHeading: v })} />
              <StringList label="Bag size" items={draft.products.sizes} onChange={(sizes) => setProducts({ sizes })} max={12} maxLen={24} addLabel="Add a size" placeholder="25 kg" />
              <StringList label="Selling point" items={draft.products.highlights} onChange={(highlights) => setProducts({ highlights })} max={8} maxLen={120} addLabel="Add a selling point" />
              <TextField label="Button text" value={draft.products.ctaLabel} max={40} onChange={(v) => setProducts({ ctaLabel: v })} />
              <p className="text-xs text-ink-500">The product poster picture itself is a fixed image. Ask your developer to replace it if the packaging changes.</p>
            </Panel>

            <Panel id="contact-details" title="Contact details" hint="The company's own address, phone numbers, email, WhatsApp and links, shown as tap-to-use cards above the sales points.">
              {draft.contact.details.map((d, i) => (
                <div key={d.id} className={card} data-testid="detail-row">
                  <div className="flex items-start gap-3">
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[10rem_1fr_1fr]">
                      <div>
                        <label className="text-sm font-medium text-ink-700" htmlFor={`kind-${d.id}`}>Kind</label>
                        <select id={`kind-${d.id}`} value={d.kind} onChange={(e) => setContact({ details: draft.contact.details.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof d.kind } : x)) })} className="mt-1 w-full rounded-lg border border-paddy-100 bg-white px-3 py-2 text-sm">
                          <option value="text">Text (an address)</option>
                          <option value="phone">Phone number</option>
                          <option value="whatsapp">WhatsApp number</option>
                          <option value="email">Email address</option>
                          <option value="link">Web link</option>
                        </select>
                      </div>
                      <TextField label="Label" value={d.label} max={40} placeholder="Head office" onChange={(v) => setContact({ details: draft.contact.details.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
                      <TextField label="Value" value={d.value} max={200} placeholder={d.kind === 'email' ? 'sales@example.com' : d.kind === 'link' ? 'https://facebook.com/...' : d.kind === 'text' ? 'Adenta, Accra' : '0241234567'} onChange={(v) => setContact({ details: draft.contact.details.map((x, j) => (j === i ? { ...x, value: v } : x)) })} />
                    </div>
                    <RowButtons what={`contact line ${i + 1}`} first={i === 0} last={i === draft.contact.details.length - 1} onUp={() => setContact({ details: move(draft.contact.details, i, -1) })} onDown={() => setContact({ details: move(draft.contact.details, i, 1) })} onRemove={() => setContact({ details: draft.contact.details.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              ))}
              {draft.contact.details.length < 12 && <AddButton onClick={() => setContact({ details: [...draft.contact.details, { id: newEntryId(), label: '', value: '', kind: 'text' }] })}>Add a contact line</AddButton>}
            </Panel>

            <Panel id="locations" title="Sales points" hint="The places customers can buy from, shown as cards with tap-to-call phone numbers. Add a new place, or change a number, here.">
              <TextField label="Small line above the heading" value={draft.contact.eyebrow} max={60} onChange={(v) => setContact({ eyebrow: v })} />
              <TextField label="Heading" value={draft.contact.heading} max={120} onChange={(v) => setContact({ heading: v })} />
              <TextField label="Introduction" value={draft.contact.intro} max={400} onChange={(v) => setContact({ intro: v })} />
              <ul className="space-y-3">
                {draft.contact.locations.map((loc, i) => (
                  <li key={loc.id} className={card} data-testid="location-row">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <TextField label="Place" value={loc.name} max={100} placeholder="Kumasi, Adum" onChange={(v) => setContact({ locations: draft.contact.locations.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
                        <StringList label="Phone number" items={loc.phones} onChange={(phones) => setContact({ locations: draft.contact.locations.map((x, j) => (j === i ? { ...x, phones } : x)) })} max={4} maxLen={24} addLabel="Add a phone number" placeholder="0541234567" />
                      </div>
                      <RowButtons what={`place ${i + 1}`} first={i === 0} last={i === draft.contact.locations.length - 1} onUp={() => setContact({ locations: move(draft.contact.locations, i, -1) })} onDown={() => setContact({ locations: move(draft.contact.locations, i, 1) })} onRemove={() => setContact({ locations: draft.contact.locations.filter((_, j) => j !== i) })} />
                    </div>
                  </li>
                ))}
              </ul>
              {draft.contact.locations.length < 40 && <AddButton onClick={() => setContact({ locations: [...draft.contact.locations, { id: newEntryId(), name: '', phones: [''] }] })}>Add a sales point</AddButton>}
            </Panel>

            <Panel id="signin" title="Sign-in page" hint="What people see when they sign in to the system.">
              <TextField label="Notice above the form (optional)" value={draft.signin.notice} max={300} rows={2} onChange={(v) => setSignin({ notice: v })} help="For example: the system will be unavailable on Sunday from 6 to 8 pm. Leave empty to show nothing." />
              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-ink-700">
                <input type="checkbox" checked={draft.signin.showDemoAccounts} onChange={(e) => setSignin({ showDemoAccounts: e.target.checked })} className="mt-1 h-4 w-4 rounded border-paddy-100" />
                <span><span className="font-medium text-ink-900">Show the demo account buttons</span><span className="mt-0.5 block text-ink-500">Lets anyone who opens the sign-in page sign in as a demo user without a password. It is on by default so you can test every role. Turn it OFF before real staff use the system. You can also switch it from your Administrator dashboard.</span></span>
              </label>
            </Panel>

            <Panel id="footer" title="Footer">
              <TextField label="Company name" value={draft.footer.company} max={80} onChange={(v) => setFooter({ company: v })} />
              <TextField label="Line under the name" value={draft.footer.tagline} max={200} onChange={(v) => setFooter({ tagline: v })} />
              <TextField label="Sign-in button text" value={draft.footer.signInLabel} max={60} onChange={(v) => setFooter({ signInLabel: v })} />
            </Panel>

            <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 sm:p-6">
              <h2 className="font-display text-lg font-medium text-red-800">Start again</h2>
              <p className="mt-1 text-sm text-ink-700">Put the homepage back to its original text and remove the slideshow. Files you have uploaded are kept.</p>
              {confirmReset ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-red-800">Reset the whole homepage?</span>
                  <button type="button" onClick={() => void reset()} className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white">Yes, reset it</button>
                  <button type="button" onClick={() => setConfirmReset(false)} className="text-xs text-ink-500">Keep my changes</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className={`${smallButton} mt-3 text-red-700`}>Reset to the original homepage</button>
              )}
            </section>
          </div>

          <div className="sticky bottom-4 z-20 mt-8 max-w-5xl rounded-2xl border border-paddy-100 bg-white/95 px-4 py-3 shadow-lg backdrop-blur" data-testid="save-bar">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 text-sm" aria-live="polite" role="status">
                {status ? (
                  <span className={status.kind === 'ok' ? 'text-paddy-700' : 'text-red-700'}>{status.text}</span>
                ) : dirty ? (
                  <span className="font-medium text-soil-700">You have unsaved changes</span>
                ) : (
                  <span className="text-ink-500">{metaLine}</span>
                )}
              </div>
              <button type="button" onClick={discard} disabled={!dirty || saving} className={smallButton}>Discard changes</button>
              <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-full bg-paddy-900 px-6 py-2 text-sm font-medium text-rice-50 transition hover:bg-paddy-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
