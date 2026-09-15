import Link from 'next/link';
import Image from 'next/image';
import { SiteNav } from '@/components/SiteNav';

const CHAIN = [
  {
    step: '01',
    title: 'Farm',
    body: "Farm managers log every paddy delivery - grade, bags, moisture, harvest date. Farm Supervisors approve it before it ever counts as stock.",
  },
  {
    step: '02',
    title: 'Delivery',
    body: "Approved paddy moves to a warehouse by truck. It's tracked as in-transit the whole way - never counted as available stock until it actually arrives.",
  },
  {
    step: '03',
    title: 'Warehouse',
    body: "The receiving warehouse manager logs the actual quantity that arrived. Any shortfall against what was expected is flagged, not quietly absorbed.",
  },
  {
    step: '04',
    title: 'Milling',
    body: "Paddy becomes rice, broken rice, and hull. The mass balance is checked automatically - output can never exceed input.",
  },
  {
    step: '05',
    title: 'Packaging',
    body: "Recovered rice is bagged into 1, 2, 5, 10, 25, and 50 KG sizes as Pectra Rice, ready for the warehouse floor.",
  },
  {
    step: '06',
    title: 'Sale',
    body: "A sales officer reserves stock the moment an order is approved, so two customers can never be promised the same bag.",
  },
];

const ROLES = [
  {
    name: 'Farm Manager',
    does: "Logs paddy intake by grade and weight, prepares delivery reports, tracks the farm's own stock in real time.",
  },
  {
    name: 'Warehouse Manager',
    does: "Receives incoming shipments, reconciles variance against what was expected, watches finished-goods stock by package size.",
  },
  {
    name: 'Operations Officer',
    does: "Records daily milling runs, machine meter readings, and quality inspections - with abnormal mass balance flagged automatically.",
  },
  {
    name: 'Sales Officer',
    does: "Builds customer orders against live, reserved stock - never a number that's already promised to someone else.",
  },
  {
    name: 'Finance Officer',
    does: "Verifies payments before they count toward any customer balance, and tracks receivables aging without a spreadsheet.",
  },
  {
    name: 'Managing Director',
    does: "One dashboard: paddy on hand, rice in the mill, cash outstanding, and where the bottleneck is today.",
  },
];

export default function HomePage() {
  return (
    <main className="bg-rice-50">
      <SiteNav />

      {/* Full-bleed photographic hero - the real product, not stock
          imagery. Copy fades up line by line. */}
      <section className="relative flex min-h-[92vh] items-end overflow-hidden bg-paddy-900">
        <Image src="/pectra-rice.jpg" alt="Pectra Rice - Superfine Perfumed Rice" fill priority className="object-cover object-center opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-paddy-900 via-paddy-900/70 to-paddy-900/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-paddy-900/60 to-transparent" />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-40">
          <p className="reveal font-display text-lg italic text-husk-300" style={{ ['--reveal-delay' as string]: '0ms' }}>KAM Trading and Farms Limited</p>
          <h1 className="reveal mt-4 max-w-3xl font-display text-5xl font-medium leading-[1.05] text-rice-50 md:text-7xl" style={{ ['--reveal-delay' as string]: '120ms' }}>
            Every bag of Pectra Rice, traced from the field it grew in.
          </h1>
          <p className="reveal mt-7 max-w-2xl text-lg leading-relaxed text-paddy-100" style={{ ['--reveal-delay' as string]: '240ms' }}>
            KAM-ROMS runs the company end to end: six farms, three warehouses, a milling operation at
            Sefwi Kanchabio, and every sale out of Adenta - all on one ledger that can&rsquo;t drift out of
            sync with what actually happened.
          </p>
          <div className="reveal mt-10 flex flex-wrap items-center gap-4" style={{ ['--reveal-delay' as string]: '360ms' }}>
            <Link href="/login" className="rounded-full bg-husk-500 px-8 py-3.5 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
              Sign in to KAM-ROMS
            </Link>
            <a href="#chain" className="text-sm font-medium text-rice-50 underline underline-offset-4 hover:text-husk-300">
              See how a bag gets made
            </a>
          </div>
        </div>
      </section>

      {/* By the numbers - a quiet strip, not a shouting one */}
      <section className="border-b border-paddy-100 bg-rice-50">
        <div className="mx-auto grid max-w-6xl grid-cols-3 divide-x divide-paddy-100 px-6">
          {[['6', 'farms', 'logging paddy intake by grade and bag count'], ['3', 'warehouses', 'each with its own milling center, Sefwi Kanchabio'], ['1', 'product line', 'Pectra Rice, Superfine Perfumed Rice, from Adenta']].map(([n, l, sub]) => (
            <div key={l} className="px-6 py-10 text-center first:pl-0 last:pr-0">
              <p className="font-display text-5xl text-paddy-900">{n}</p>
              <p className="mt-1 font-display text-lg italic text-soil-500">{l}</p>
              <p className="mt-1 text-xs text-ink-500">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The chain - editorial numbered steps on deep green */}
      <section id="chain" className="bg-paddy-900 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <p className="font-display text-lg italic text-husk-300">The chain</p>
          <h2 className="mt-2 max-w-2xl font-display text-4xl font-medium leading-tight text-rice-50 md:text-5xl">
            Six handoffs, each approved before it counts.
          </h2>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-paddy-700/40 sm:grid-cols-2 lg:grid-cols-3">
            {CHAIN.map((item) => (
              <div key={item.step} className="group bg-paddy-900 p-8 transition hover:bg-paddy-700/60">
                <span className="font-display text-3xl italic text-husk-300">{item.step}</span>
                <h3 className="mt-3 font-display text-2xl text-rice-50">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-paddy-100">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles - hover-lift cards */}
      <section id="roles" className="mx-auto max-w-6xl px-6 py-24">
        <p className="font-display text-lg italic text-soil-500">Who uses it</p>
        <h2 className="mt-2 max-w-2xl font-display text-4xl font-medium leading-tight text-paddy-900 md:text-5xl">
          Thirteen roles. Each sees exactly its own work.
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role.name} className="rounded-2xl border border-paddy-100 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-husk-300 hover:shadow-xl">
              <h3 className="font-display text-2xl text-paddy-900">{role.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">{role.does}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principles - split image / story */}
      <section id="principles" className="bg-soil-100">
        <div className="mx-auto grid max-w-6xl md:grid-cols-2">
          <div className="relative min-h-[26rem]">
            <Image src="/pectra-rice.jpg" alt="Pectra Rice bags" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-soil-700/70 to-transparent" />
            <p className="absolute bottom-8 left-8 right-8 font-display text-3xl italic text-rice-50">Nothing edits history.</p>
          </div>
          <div className="flex flex-col justify-center px-6 py-16 md:px-14">
            <p className="font-display text-lg italic text-soil-500">Principles</p>
            <h2 className="mt-2 font-display text-4xl font-medium leading-tight text-paddy-900">
              Stock numbers you can trust, because nothing edits history.
            </h2>
            <div className="mt-6 space-y-4 text-ink-700">
              <p>
                Most systems store &ldquo;current stock&rdquo; as a single number someone can quietly change.
                KAM-ROMS never does. Every movement - paddy approved, a truck departing, a shortfall on
                arrival, rice coming out of the mill - is its own permanent record. The stock figure you
                see is always the sum of everything that actually happened.
              </p>
              <p>Get something wrong? It&rsquo;s fixed with a new, explained correction - never a silent edit to the past.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA - full bleed */}
      <section className="relative overflow-hidden bg-paddy-900 py-28">
        <Image src="/pectra-rice.jpg" alt="" fill aria-hidden className="object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-paddy-900/80 to-paddy-900" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-4xl font-medium text-rice-50 md:text-5xl">Ready to get to work?</h2>
          <p className="mt-4 text-paddy-100">Sign in with your role. You&rsquo;ll see only what&rsquo;s yours to do today.</p>
          <Link href="/login" className="mt-8 inline-block rounded-full bg-husk-500 px-8 py-3.5 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
            Sign in to KAM-ROMS
          </Link>
          <p className="mt-10 text-xs text-paddy-300">KAM Trading and Farms Limited &middot; Adenta, Accra</p>
        </div>
      </section>
    </main>
  );
}
