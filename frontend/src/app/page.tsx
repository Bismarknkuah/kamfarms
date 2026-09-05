import Link from 'next/link';
import Image from 'next/image';

const CHAIN = [
  {
    step: '01',
    title: 'Farm',
    body: "Farm managers log every paddy delivery — grade, bags, moisture, harvest date. Farm Supervisors approve it before it ever counts as stock.",
  },
  {
    step: '02',
    title: 'Delivery',
    body: "Approved paddy moves to a warehouse by truck. It's tracked as in-transit the whole way — never counted as available stock until it actually arrives.",
  },
  {
    step: '03',
    title: 'Warehouse',
    body: "The receiving warehouse manager logs the actual quantity that arrived. Any shortfall against what was expected is flagged, not quietly absorbed.",
  },
  {
    step: '04',
    title: 'Milling',
    body: "Paddy becomes rice, broken rice, and hull. The mass balance is checked automatically — output can never exceed input.",
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
    does: "Records daily milling runs, machine meter readings, and quality inspections — with abnormal mass balance flagged automatically.",
  },
  {
    name: 'Sales Officer',
    does: "Builds customer orders against live, reserved stock — never a number that's already promised to someone else.",
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
      <header className="border-b border-paddy-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="font-display text-lg font-medium text-paddy-900">
            KAM<span className="text-husk-500">-ROMS</span>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-paddy-700 px-5 py-2 text-sm font-medium text-paddy-900 transition hover:bg-paddy-900 hover:text-rice-50"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-20 pt-16 md:grid-cols-[1.1fr_0.9fr] md:pt-24">
        <div>
          <p className="font-display text-sm italic text-soil-500">KAM Trading and Farms Limited</p>
          <h1 className="mt-3 font-display text-4xl font-medium leading-[1.1] text-paddy-900 md:text-6xl">
            Every bag of Pectra Rice, traced from the field it grew in.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700">
            KAM-ROMS is the system that runs the company end to end: six farms, three warehouses,
            a milling operation at Sefwi Kanchabio, and every sale out of Adenta — all on one ledger
            that can't drift out of sync with what actually happened.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="rounded-full bg-paddy-900 px-7 py-3 text-sm font-medium text-rice-50 transition hover:bg-paddy-700"
            >
              Sign in to KAM-ROMS
            </Link>
            <a href="#chain" className="text-sm font-medium text-soil-500 underline underline-offset-4">
              See how a bag gets made
            </a>
          </div>
        </div>

        {/* Illustrated panel — the real Pectra Rice product photo, same
            gradient-overlay treatment as the login page's panel. */}
        <div className="relative hidden aspect-[4/5] overflow-hidden rounded-3xl bg-paddy-900 md:block">
          <Image
            src="/pectra-rice.jpg"
            alt="Pectra Rice — Superfine Perfumed Rice, 25KG and 5KG bags"
            fill
            className="object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paddy-900 via-paddy-900/60 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="font-display text-2xl italic text-rice-50">Six farms. Three warehouses. One ledger.</p>
            <p className="mt-2 text-sm text-paddy-100">Adenta, Accra &middot; Sefwi Kanchabio, Western North Region</p>
          </div>
        </div>
      </section>

      <section id="chain" className="border-y border-paddy-100 bg-paddy-900 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-medium text-rice-50 md:text-3xl">
            Six stages. One system. No stage skipped.
          </h2>
          <p className="mt-3 max-w-lg text-paddy-100">
            Each step below is a module in KAM-ROMS, and each handoff between steps is an approval
            — nothing moves from one stage to the next without someone signing off on it.
          </p>

          <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3">
            {CHAIN.map((item) => (
              <div key={item.step} className="border-t border-paddy-500 pt-5">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-sm text-husk-300">{item.step}</span>
                  <h3 className="font-display text-xl text-rice-50">{item.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-paddy-100">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-2xl font-medium text-paddy-900 md:text-3xl">
          Built around who actually does the work
        </h2>
        <p className="mt-3 max-w-lg text-ink-700">
          Everyone sees exactly what their job needs — nothing more, nothing hidden behind a
          setting they'll never find.
        </p>

        <div className="mt-12 divide-y divide-paddy-100 border-t border-paddy-100">
          {ROLES.map((role) => (
            <div key={role.name} className="grid gap-2 py-6 md:grid-cols-[220px_1fr] md:items-baseline md:gap-8">
              <h3 className="font-display text-lg text-paddy-900">{role.name}</h3>
              <p className="text-ink-700">{role.does}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-husk-100/60 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <h2 className="font-display text-2xl font-medium text-paddy-900 md:text-3xl">
            Stock numbers you can trust, because nothing edits history.
          </h2>
          <div className="space-y-4 text-ink-700">
            <p>
              Most systems store &ldquo;current stock&rdquo; as a single number someone can quietly change.
              KAM-ROMS never does. Every movement — paddy approved, a truck departing, a shortfall on
              arrival, rice coming out of the mill — is its own permanent record. The stock figure you
              see is always the sum of everything that actually happened, not a number waiting to be
              corrected.
            </p>
            <p>
              Get something wrong? It's fixed with a new, explained correction — never a silent edit to
              the past.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <p className="font-display text-3xl text-paddy-900">6</p>
            <p className="mt-1 text-sm text-ink-500">farms feeding the mill, with room for a seventh whenever it's ready</p>
          </div>
          <div>
            <p className="font-display text-3xl text-paddy-900">3</p>
            <p className="mt-1 text-sm text-ink-500">warehouses, each with its own milling center at Sefwi Kanchabio, Western North Region</p>
          </div>
          <div>
            <p className="font-display text-3xl text-paddy-900">1</p>
            <p className="mt-1 text-sm text-ink-500">product line — Pectra Rice, Superfine Perfumed Rice — sold out of Adenta, Accra</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-paddy-100 bg-paddy-900 py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <h2 className="font-display text-2xl font-medium text-rice-50 md:text-3xl">Ready to get to work?</h2>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-husk-500 px-8 py-3 text-sm font-medium text-paddy-900 transition hover:bg-husk-300"
          >
            Sign in to KAM-ROMS
          </Link>
          <p className="mt-8 text-xs text-paddy-300">KAM Trading and Farms Limited &middot; Adenta, Accra</p>
        </div>
      </footer>
    </main>
  );
}
