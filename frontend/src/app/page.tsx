import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Eye,
  Factory,
  Gauge,
  Leaf,
  MapPin,
  Phone,
  ShieldCheck,
  Sprout,
  Truck,
  Warehouse,
  Zap,
} from 'lucide-react';
import { SiteNav } from '@/components/SiteNav';
import { Reveal } from '@/components/Reveal';

const STATS = [
  { icon: Sprout, value: '6', label: 'Farms', sub: 'growing and logging paddy' },
  { icon: Warehouse, value: '3', label: 'Warehouses', sub: 'storing paddy and rice' },
  { icon: Factory, value: '3', label: 'Milling centers', sub: 'turning paddy into rice' },
  { icon: ShieldCheck, value: '100%', label: 'Quality guarantee', sub: 'on every bag of Pectra Rice' },
];

const OPERATIONS = [
  { icon: Sprout, title: 'Farming', body: 'Every paddy delivery is logged by grade, bags and moisture, then approved before it counts as stock.' },
  { icon: Factory, title: 'Milling', body: 'Paddy becomes rice, broken rice and hull, with the mass balance checked on every single run.' },
  { icon: Warehouse, title: 'Warehousing', body: 'Stock is counted by the bag at every site, so what the screen says is what is on the floor.' },
  { icon: Truck, title: 'Distribution', body: 'Paddy and rice move by tracked delivery, and are never counted as available until they arrive.' },
  { icon: BarChart3, title: 'Sales', body: 'Each order is approved by Finance, released by the Managing Director and delivered by the warehouse. Stock is reserved at release, so no bag is promised twice.' },
];

const FEATURES = [
  { icon: ClipboardList, title: 'Approved at every handoff', body: 'Paddy, deliveries, production runs and expenses each need an approval before they count.' },
  { icon: Boxes, title: 'Counted by the bag', body: 'Farms and warehouses count in bags. A weight is optional, and clearly marked whenever it is an estimate.' },
  { icon: ShieldCheck, title: 'Nothing edits history', body: 'Stock is the sum of everything that happened. A mistake is fixed with a new, explained correction, never a silent edit.' },
  { icon: Gauge, title: 'A dashboard for every role', body: 'Twelve roles, each seeing exactly its own work, from the farm gate to the Managing Director.' },
  { icon: Zap, title: 'Yield and power predictions', body: 'Expected rice and power use for each milling run, built from the company\u2019s own approved history.' },
  { icon: Eye, title: 'A full audit trail', body: 'Every action across the company is recorded, most recent first, and open to the people who oversee it.' },
];

const ROLE_NAMES = [
  'Managing Director', 'CEO', 'Farm Director', 'Farm Manager', 'Warehouse Supervisor', 'Warehouse Manager', 'Operations Manager',
  'Operations Officer', 'Sales Officer', 'Finance Director', 'Auditor', 'System Administrator',
];

const CHAIN = [
  { step: '01', title: 'Farm', body: 'Farm managers log every paddy delivery: grade, bags, moisture, harvest date. Farm Supervisors approve it before it ever counts as stock.' },
  { step: '02', title: 'Delivery', body: 'Approved paddy moves to a warehouse by truck. It is tracked as in transit the whole way and never counted as available until it arrives.' },
  { step: '03', title: 'Warehouse', body: 'The receiving warehouse manager logs the actual quantity that arrived. Any shortfall against what was expected is flagged, not quietly absorbed.' },
  { step: '04', title: 'Milling', body: 'Paddy becomes rice, broken rice and hull. The mass balance is checked automatically, so output can never exceed input.' },
  { step: '05', title: 'Packaging', body: 'Recovered rice is bagged into 1, 2, 5, 10, 25 and 50 kg sizes as Pectra Rice, ready for the warehouse floor.' },
  { step: '06', title: 'Sale', body: 'The Finance Director approves each order, then the Managing Director releases it to the Warehouse Supervisor for delivery. Stock is reserved at release, so two customers can never be promised the same bag.' },
];

const BAG_SIZES = ['1 kg', '2 kg', '5 kg', '10 kg', '25 kg', '50 kg'];

// Sales points exactly as printed on the Pectra Rice sales poster.
const SALES_POINTS = [
  { place: 'Lapaz, Awoshie', phone: '0541589964' },
  { place: 'Tema Community 18', phone: '0548254399' },
  { place: 'Koforidua', phone: '0557706731' },
  { place: 'Adenta', phone: '0241730440' },
  { place: 'Akuse', phone: '0543761009' },
  { place: 'Cape Coast', phone: '0246130986' },
  { place: 'East Legon', phone: '0266696189' },
  { place: 'Sefwi Asawinso, Asafo, Juaboso, Wiawso', phone: '0541771795' },
];

const spaced = (n: string) => `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;

const eyebrow = 'text-xs font-semibold uppercase tracking-[0.2em] text-husk-700';
const h2 = 'mt-3 text-3xl font-bold tracking-tight text-paddy-900 sm:text-4xl';

export default function HomePage() {
  return (
    <main className="bg-rice-50 font-sans">
      <SiteNav />

      {/* HERO */}
      <section id="home" className="relative isolate overflow-hidden bg-paddy-900 pb-36 pt-32 sm:pt-36 lg:pb-48">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_82%_18%,rgba(201,151,43,0.30),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_8%_95%,rgba(59,130,102,0.40),transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:24px_24px]" />

        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="reveal inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-husk-300">
              <Leaf className="h-3.5 w-3.5" /> KAM Trading and Farms Limited
            </p>
            <h1 className="reveal mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl" style={{ ['--reveal-delay' as string]: '100ms' }}>
              <span className="text-husk-300">Quality Rice</span> from Our Farms to Your Table
            </h1>
            <p className="reveal mt-6 max-w-xl text-lg leading-relaxed text-paddy-100" style={{ ['--reveal-delay' as string]: '200ms' }}>
              We grow, mill, store and sell Pectra Rice, a Superfine Perfumed Rice, with every bag recorded and traceable from the field it came from to the table it ends up on.
            </p>
            <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ ['--reveal-delay' as string]: '300ms' }}>
              <a href="#products" className="inline-flex items-center gap-2 rounded-full bg-husk-500 px-7 py-3.5 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
                Our Products <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#about" className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">
                Learn More
              </a>
            </div>
            <ul className="reveal mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-paddy-100" style={{ ['--reveal-delay' as string]: '400ms' }}>
              {['Farm fresh', 'Superfine and perfumed', 'Sales points across Ghana'].map((t) => (
                <li key={t} className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-husk-300" /> {t}</li>
              ))}
            </ul>
          </div>

          <div className="reveal relative mx-auto w-full max-w-md" style={{ ['--reveal-delay' as string]: '200ms' }}>
            <div aria-hidden className="absolute -inset-5 rounded-[2.5rem] bg-husk-500/25 blur-2xl" />
            <div className="relative aspect-[912/866] rotate-2 overflow-hidden rounded-3xl border border-white/20 shadow-2xl shadow-black/40 transition duration-700 hover:rotate-0">
              <Image src="/pectra-hero.jpg" alt="Pectra Rice, Superfine Perfumed Rice, in 25 kg and 5 kg bags beside a bowl of cooked rice" fill priority sizes="(min-width: 1024px) 440px, 90vw" className="object-cover" />
            </div>
            <div className="absolute -left-3 -top-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl sm:-left-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-paddy-100 text-paddy-900"><Sprout className="h-5 w-5" /></span>
              <span className="text-sm leading-tight"><span className="block font-semibold text-paddy-900">Traced from the field</span><span className="block text-xs text-ink-500">Every bag recorded end to end</span></span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS, overlapping the hero */}
      <section className="relative z-10 -mt-16 px-6 lg:-mt-24">
        <Reveal className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-8 rounded-3xl border border-paddy-100 bg-white p-6 shadow-xl shadow-paddy-900/10 md:grid-cols-4 md:divide-x md:divide-paddy-100 md:p-8">
          {STATS.map((s) => (
            <div key={s.label} className="flex items-center gap-4 md:px-6 md:first:pl-0 md:last:pr-0">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-paddy-100 text-paddy-900"><s.icon className="h-6 w-6" /></span>
              <div>
                <p className="text-2xl font-bold leading-none text-paddy-900">{s.value}</p>
                <p className="mt-1 text-sm font-semibold text-ink-900">{s.label}</p>
                <p className="text-xs text-ink-500">{s.sub}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ABOUT */}
      <section id="about" className="mx-auto max-w-6xl px-6 py-24 lg:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <p className={eyebrow}>About us</p>
            <h2 className={h2}>Grown, milled and sold by one company</h2>
            <p className="mt-5 text-ink-700">
              KAM Trading and Farms Limited grows, mills, stores and sells Pectra Rice. Six farms feed three warehouses, each with its own milling center, with milling at Sefwi Kanchabio and every sale going out through our base in Adenta, Accra.
            </p>
            <p className="mt-4 text-ink-700">
              Every step is recorded and approved, so every bag can be traced back to the field it came from. That is how we can stand behind the quality of what reaches your table.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
              {['Our own farms, warehouses and milling centers', 'Every handoff recorded and approved', 'A quality guarantee on every bag'].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-paddy-700" /> {t}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <div className="rounded-3xl border border-paddy-100 bg-white p-7 shadow-sm">
              <p className="text-sm font-semibold text-paddy-900">Where we work</p>
              <ul className="mt-4 divide-y divide-paddy-100">
                {[
                  ['Farms', 'Six farms growing paddy for Pectra Rice'],
                  ['Milling', 'Sefwi Kanchabio'],
                  ['Sales base', 'Adenta, Accra'],
                  ['Sales points', 'Lapaz, Tema, Koforidua, Akuse, Cape Coast, East Legon and Sefwi'],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-start gap-3 py-3.5">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-husk-700" />
                    <div><p className="text-sm font-semibold text-ink-900">{k}</p><p className="text-sm text-ink-500">{v}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CORE OPERATIONS */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className={eyebrow}>What we do</p>
            <h2 className={h2}>Our Core Operations</h2>
            <p className="mt-4 text-ink-500">From the farm to the market, every step is handled with care and recorded as it happens.</p>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {OPERATIONS.map((o, i) => (
              <Reveal key={o.title} delay={i * 70} className="group rounded-2xl border border-paddy-100 bg-rice-50 p-6 text-center transition duration-300 hover:-translate-y-1.5 hover:border-husk-300 hover:bg-white hover:shadow-xl">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-paddy-100 text-paddy-900 transition group-hover:bg-paddy-900 group-hover:text-husk-300"><o.icon className="h-7 w-7" /></span>
                <h3 className="mt-5 text-lg font-bold text-paddy-900">{o.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{o.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24 lg:py-28">
        <Reveal className="max-w-2xl">
          <p className={eyebrow}>Features</p>
          <h2 className={h2}>Traceable by design</h2>
          <p className="mt-4 text-ink-500">
            Behind every bag is KAM-ROMS, the system we built to run the company: every handoff recorded and approved, and never quietly edited.
          </p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className="rounded-2xl border border-paddy-100 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-husk-300 hover:shadow-lg">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-paddy-900 text-husk-300"><f.icon className="h-5 w-5" /></span>
              <h3 className="mt-5 text-lg font-bold text-paddy-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 rounded-2xl border border-paddy-100 bg-white p-6">
          <p className="text-sm font-semibold text-paddy-900">One system, twelve roles</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ROLE_NAMES.map((r) => <span key={r} className="rounded-full bg-paddy-50 px-3 py-1.5 text-xs font-medium text-paddy-900">{r}</span>)}
          </div>
        </Reveal>
      </section>

      {/* THE CHAIN */}
      <section className="bg-paddy-900 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-husk-300">From field to bag</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Six handoffs, each approved before it counts.</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {CHAIN.map((c, i) => (
              <Reveal key={c.step} delay={i * 60} className="bg-paddy-900 p-8 transition hover:bg-paddy-700/60">
                <span className="text-sm font-bold tracking-widest text-husk-300">{c.step}</span>
                <h3 className="mt-3 text-xl font-bold text-white">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-paddy-100">{c.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section id="products" className="bg-white py-24 lg:py-28">
        <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <Reveal className="mx-auto w-full max-w-sm">
            <div className="relative aspect-[912/1280] overflow-hidden rounded-3xl border border-paddy-100 shadow-2xl shadow-paddy-900/15">
              <Image src="/pectra-rice.jpg" alt="Pectra Rice sales poster: 25 kg and 5 kg bags of Superfine Perfumed Rice with the list of sales points" fill sizes="(min-width: 1024px) 384px, 90vw" className="object-cover" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <p className={eyebrow}>Our products</p>
            <h2 className={h2}>Pectra Rice</h2>
            <p className="mt-1 text-lg font-medium text-soil-500">Superfine Perfumed Rice</p>
            <p className="mt-5 text-ink-700">
              Grown on our own farms, milled in our own centers and packed for the table. Every bag carries the same promise: farm fresh, fragrant, and traceable back to where it was grown.
            </p>
            <p className="mt-6 text-sm font-semibold text-paddy-900">Available in bags of</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BAG_SIZES.map((s) => <span key={s} className="rounded-full border border-paddy-100 bg-rice-50 px-4 py-1.5 text-sm font-medium text-paddy-900">{s}</span>)}
            </div>
            <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
              {['Farm fresh', 'Superfine and perfumed', '100% quality guarantee', 'Traced from the field it grew in'].map((t) => (
                <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-paddy-700" /> {t}</li>
              ))}
            </ul>
            <a href="#contact" className="mt-8 inline-flex items-center gap-2 rounded-full bg-paddy-900 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-paddy-700">
              Find a sales point <ArrowRight className="h-4 w-4" />
            </a>
          </Reveal>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="relative isolate overflow-hidden bg-paddy-900 py-24 lg:py-28">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_85%_10%,rgba(201,151,43,0.22),transparent_70%)]" />
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-husk-300">Contact</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Where to buy Pectra Rice</h2>
            <p className="mt-4 text-paddy-100">Visit or call a Pectra Rice sales point near you.</p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SALES_POINTS.map((p, i) => (
              <Reveal key={p.place} delay={i * 50} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition hover:border-husk-300/50 hover:bg-white/10">
                <MapPin className="h-5 w-5 text-husk-300" />
                <p className="mt-3 min-h-[2.5rem] text-sm font-semibold leading-snug text-white">{p.place}</p>
                <a href={`tel:${p.phone}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-husk-300 hover:text-husk-500">
                  <Phone className="h-4 w-4" /> {spaced(p.phone)}
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-paddy-900">
        <div className="border-t border-white/10 bg-black/25">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
            <div>
              <p className="text-lg font-bold text-white">KAM Trading and Farms Limited</p>
              <p className="text-sm text-paddy-100">Pectra Rice &middot; Adenta, Accra &middot; Milling at Sefwi Kanchabio</p>
            </div>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-husk-500 px-6 py-3 text-sm font-semibold text-paddy-900 transition hover:bg-husk-300">
              KAM team and partners: sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="border-t border-white/10 px-6 py-4 text-center text-xs text-paddy-300">&copy; {new Date().getFullYear()} KAM Trading and Farms Limited. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
