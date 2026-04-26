export default function VacancySavingsCard({
    saved,
    revenue,
    rent,
  }: {
    saved: number | null
    revenue: number | null
    rent: number | null
  }) {
    const hasSavings = saved !== null && revenue !== null
  
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Vacancy Savings
        </div>
  
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              Vacancy Saved
            </div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {saved !== null ? `${saved} days` : "—"}
            </div>
          </div>
  
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">
              Revenue Saved
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">
              {revenue !== null ? `$${revenue.toLocaleString()}` : "Unavailable"}
            </div>
          </div>
        </div>
  
        {hasSavings && rent !== null ? (
          <div className="mt-3 text-sm text-zinc-300">
            Based on{" "}
            <span className="font-semibold text-white">
              ${rent.toLocaleString()}/month
            </span>{" "}
            rent.
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-400">
            Revenue savings unavailable until rent and timing data are available.
          </div>
        )}
      </div>
    )
  }