import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="mb-6 inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-zinc-300">
          UnitFlow
        </div>

        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Coordinated tenant transfers, built for modern housing portfolios.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
          UnitFlow helps property operators manage internal tenant transfers,
          reduce vacancy loss, and keep move-ins and move-outs organized across
          multiple properties.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link href="/login">
            <button className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200">
              Login
            </button>
          </Link>

          <Link href="/dashboard">
            <button className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Enter Dashboard
            </button>
          </Link>
        </div>
      </div>
    </main>
  )
}