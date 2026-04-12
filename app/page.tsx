import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold tracking-tight">UnitFlow</div>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                Enter Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mb-6 inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-zinc-300">
            Built for multifamily portfolios
          </div>

          <h1 className="max-w-5xl text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl">
            Stop letting tenant transfers turn into vacancy loss.
          </h1>

          <p className="mt-6 max-w-3xl text-lg leading-8 text-zinc-400 sm:text-xl">
            Built after seeing how messy internal transfers get in real portfolios —
            missed timing, empty units, and teams stuck coordinating through texts
            and spreadsheets. UnitFlow fixes that with one clear system.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/login"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Start Using UnitFlow
            </Link>

            <Link
              href="/dashboard"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Dashboard
            </Link>
          </div>

          <p className="mt-6 text-sm text-zinc-500">
            Built for real multifamily operations • Designed to reduce vacancy
            loss • No spreadsheets required
          </p>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm text-zinc-400">Without UnitFlow</div>
              <div className="mt-2 text-xl font-semibold">
                Transfers get improvised
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Teams chase updates across calls, texts, notes, and memory.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm text-zinc-400">The result</div>
              <div className="mt-2 text-xl font-semibold">
                Empty-unit gaps grow
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Move-out and move-in timelines drift, creating avoidable
                vacancy.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-sm text-zinc-400">With UnitFlow</div>
              <div className="mt-2 text-xl font-semibold">
                Every move is coordinated
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                One workflow. One source of truth. Fewer delays and less
                revenue leakage.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-6">
            <div className="mb-4 text-sm text-zinc-500">Live system preview</div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <div className="border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-white/20" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-[220px_1fr]">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-medium text-white">Portfolio</div>
                  <div className="mt-4 space-y-3 text-sm text-zinc-400">
                    <div className="rounded-lg bg-white/5 px-3 py-2 text-white">
                      Dashboard
                    </div>
                    <div className="px-3 py-2">Transfers</div>
                    <div className="px-3 py-2">Properties</div>
                    <div className="px-3 py-2">Tenants</div>
                    <div className="px-3 py-2">Team</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Active transfers
                      </div>
                      <div className="mt-3 text-3xl font-semibold">12</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Vacant units
                      </div>
                      <div className="mt-3 text-3xl font-semibold">8</div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Properties
                      </div>
                      <div className="mt-3 text-3xl font-semibold">5</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-medium text-white">
                      Transfer Workflow
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="text-xs text-zinc-500">Requested</div>
                        <div className="mt-2 text-lg font-semibold">4</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="text-xs text-zinc-500">Approved</div>
                        <div className="mt-2 text-lg font-semibold">3</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="text-xs text-zinc-500">Scheduled</div>
                        <div className="mt-2 text-lg font-semibold">2</div>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <div className="text-xs text-zinc-500">Completed</div>
                        <div className="mt-2 text-lg font-semibold">3</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-medium text-white">
                      Why teams use UnitFlow
                    </div>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                      Coordinate resident movement, protect occupancy, and keep
                      every handoff visible across the portfolio.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Real scenario
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              A resident wants to move. The transfer should not create confusion,
              delays, or a dead unit in the middle.
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-7">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-red-200">
                Before
              </div>
              <h3 className="mt-4 text-2xl font-semibold">
                The transfer is handled manually
              </h3>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    1. Resident requests a move
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    The request starts in conversation, email, or a note instead
                    of one visible workflow.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    2. Staff coordinate across channels
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    Leasing, site staff, and management pass updates back and
                    forth without a clear shared source of truth.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    3. Timing slips
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    Move-out and move-in drift apart, unit status gets messy,
                    and revenue leakage starts showing up in the gap.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-7">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-200">
                After
              </div>
              <h3 className="mt-4 text-2xl font-semibold">
                UnitFlow keeps the move controlled
              </h3>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    1. The transfer enters one system
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    The request is tracked from the start, with clear status,
                    tenant details, and destination visibility.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    2. The team sees the same workflow
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    Everyone works from one transfer pipeline instead of piecing
                    things together manually.
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">
                    3. The move completes cleanly
                  </div>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    Unit status, tenant placement, and transfer completion stay
                    aligned so the portfolio keeps moving without unnecessary
                    downtime.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Why this matters
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Internal transfers should not feel like operational chaos.
            </h2>
            <p className="mt-6 text-lg leading-8 text-zinc-400">
              When a resident moves from one unit to another, the process should
              be clean. But in many portfolios, transfers create confusion,
              delayed communication, unit-status mistakes, and preventable
              vacancy between move-out and move-in.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-xl font-semibold">
                What teams deal with now
              </h3>
              <ul className="mt-5 space-y-4 text-sm leading-7 text-zinc-400">
                <li>Leasing teams piecing together updates manually</li>
                <li>Unclear transfer status across properties</li>
                <li>Move dates slipping without visibility</li>
                <li>Units showing the wrong availability at the wrong time</li>
                <li>Revenue lost in handoff gaps that should never exist</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-xl font-semibold">What UnitFlow changes</h3>
              <ul className="mt-5 space-y-4 text-sm leading-7 text-zinc-400">
                <li>A single place to manage transfer activity</li>
                <li>Clear status from request to completion</li>
                <li>Better alignment between move-out and move-in timing</li>
                <li>Real-time visibility into units, tenants, and properties</li>
                <li>A more controlled workflow across the whole portfolio</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
              Built for real teams
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Made for multifamily operators managing more than one property.
            </h2>
            <p className="mt-6 text-lg leading-8 text-zinc-400">
              UnitFlow is designed for portfolios where resident transfers are
              operationally important, financially sensitive, and too costly to
              manage through disconnected tools.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold">Regional operators</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Oversee transfer activity across multiple communities with more
                clarity and less manual follow-up.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold">On-site teams</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Keep leasing, occupancy, and resident movement organized without
                working from scattered notes.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold">Ownership groups</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Protect revenue by reducing the avoidable downtime that often
                happens during internal moves.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 sm:p-10">
            <div className="max-w-3xl">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">
                Final call to action
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Bring transfer coordination into one system.
              </h2>
              <p className="mt-5 text-lg leading-8 text-zinc-400">
                UnitFlow helps serious multifamily teams reduce friction,
                tighten handoffs, and protect revenue during internal resident
                moves.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/login"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
              >
                Start Using UnitFlow
              </Link>

              <Link
                href="/dashboard"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Enter Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}