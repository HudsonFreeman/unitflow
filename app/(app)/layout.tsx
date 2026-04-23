"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"
import PropertySelector from "@/components/PropertySelector"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState("")

  useEffect(() => {
    async function guardApp() {
      setLoading(true)

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        router.replace("/login")
        return
      }

      setUserEmail(user.email ?? "")

      // 🔴 REAL SECURITY CHECK (staff only)
      const { data: membership, error: membershipError } =
        await supabaseClient
          .from("organization_members")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()

      if (membershipError) {
        router.replace("/login")
        return
      }

      if (!membership) {
        // 🚫 NOT STAFF → block access
        router.replace("/tenant")
        return
      }

      setLoading(false)
    }

    guardApp()
  }, [router, pathname])

  async function handleSignOut() {
    await supabaseClient.auth.signOut()
    router.replace("/login")
  }

  function getLinkClasses(href: string) {
    const isActive = pathname === href

    return `group block rounded-xl px-3 py-3 text-sm font-medium transition ${
      isActive
        ? "bg-white/10 text-white shadow-lg"
        : "text-zinc-300 hover:bg-white/5 hover:text-white"
    }`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_40px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-400">Loading UnitFlow...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white">
      <div className="flex min-h-screen">
        <aside className="w-80 border-r border-white/10 bg-black/30 backdrop-blur-xl">
          <div className="sticky top-0 p-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_30px_rgba(0,0,0,0.35)]">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                  Platform
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  UnitFlow
                </h1>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Logged in as
                </p>
                <p className="mt-2 break-all text-sm text-zinc-200">
                  {userEmail}
                </p>

                <div className="mt-4 h-px bg-white/10" />

                <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  System
                </p>
                <p className="mt-2 text-sm text-zinc-200">
                  Property Operations Platform
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Active Property Scope
                </p>
                <div className="mt-3">
                  <PropertySelector />
                </div>
              </div>

              <nav className="mt-6 space-y-2">
                <Link href="/dashboard" className={getLinkClasses("/dashboard")}>
                  <span>Dashboard</span>
                </Link>

                <Link href="/properties" className={getLinkClasses("/properties")}>
                  <span>Properties</span>
                </Link>

                <Link href="/tenants" className={getLinkClasses("/tenants")}>
                  <span>Tenants</span>
                </Link>

                <Link href="/transfers" className={getLinkClasses("/transfers")}>
                  <span>Transfers</span>
                </Link>
              </nav>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-6 md:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_40px_rgba(0,0,0,0.35)] md:p-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}