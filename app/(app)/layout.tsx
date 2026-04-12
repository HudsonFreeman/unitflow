"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"
import {
  getActiveOrganizationContext,
  setActiveOrganization,
  type OrganizationMemberRow,
  type OrganizationRow,
} from "@/lib/active-organization"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [loading, setLoading] = useState(true)
  const [switchingOrg, setSwitchingOrg] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  const [role, setRole] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [memberships, setMemberships] = useState<OrganizationMemberRow[]>([])

  useEffect(() => {
    async function guardApp() {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        router.replace("/login")
        return
      }

      setUserEmail(user.email ?? "")

      const context = await getActiveOrganizationContext()

      if (context.error) {
        router.replace("/login")
        return
      }

      if (!context.membership) {
        router.replace("/onboarding")
        return
      }

      setRole(context.membership.role)
      setOrganizationId(context.activeOrganizationId)
      setOrganizations(context.organizations)
      setMemberships(context.memberships)
      setLoading(false)
    }

    guardApp()
  }, [router])

  async function handleSignOut() {
    await supabaseClient.auth.signOut()
    router.replace("/login")
  }

  async function handleOrgChange(nextOrganizationId: string) {
    if (!nextOrganizationId || nextOrganizationId === organizationId) return

    setSwitchingOrg(true)

    const result = await setActiveOrganization(nextOrganizationId)

    if (result.error) {
      setSwitchingOrg(false)
      return
    }

    const nextMembership = memberships.find(
      (membership) => membership.organization_id === nextOrganizationId
    )

    setOrganizationId(nextOrganizationId)
    setRole(nextMembership?.role ?? "")
    setSwitchingOrg(false)
    router.refresh()
    window.location.href = pathname
  }

  function getLinkClasses(href: string) {
    const isActive = pathname === href
    return `group block rounded-xl px-3 py-3 text-sm font-medium transition ${
      isActive
        ? "bg-white/10 text-white shadow-lg"
        : "text-zinc-300 hover:bg-white/5 hover:text-white"
    }`
  }

  const activeOrganization =
    organizations.find((organization) => organization.id === organizationId) ?? null

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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                    Platform
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    UnitFlow
                  </h1>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300">
                  {role}
                </div>
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
                  Active organization
                </p>
                <p className="mt-2 text-sm text-zinc-200">
                  {activeOrganization?.name ?? "Unknown organization"}
                </p>

                <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Switch organization
                </p>
                <select
                  value={organizationId}
                  onChange={(e) => handleOrgChange(e.target.value)}
                  disabled={switchingOrg}
                  className="mt-2 w-full rounded-xl bg-black p-2 text-sm text-white"
                >
                  {organizations.map((organization) => {
                    const membership = memberships.find(
                      (item) => item.organization_id === organization.id
                    )

                    return (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                        {membership?.role ? ` — ${membership.role}` : ""}
                      </option>
                    )
                  })}
                </select>

                <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Organization ID
                </p>
                <p className="mt-2 break-all text-xs text-zinc-400">
                  {organizationId}
                </p>
              </div>

              <nav className="mt-6 space-y-2">
                <Link href="/dashboard" className={getLinkClasses("/dashboard")}>
                  <div className="flex items-center justify-between">
                    <span>Dashboard</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                      →
                    </span>
                  </div>
                </Link>

                <Link href="/properties" className={getLinkClasses("/properties")}>
                  <div className="flex items-center justify-between">
                    <span>Properties</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                      →
                    </span>
                  </div>
                </Link>

                <Link href="/tenants" className={getLinkClasses("/tenants")}>
                  <div className="flex items-center justify-between">
                    <span>Tenants</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                      →
                    </span>
                  </div>
                </Link>

                <Link href="/transfers" className={getLinkClasses("/transfers")}>
                  <div className="flex items-center justify-between">
                    <span>Transfers</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                      →
                    </span>
                  </div>
                </Link>

                <Link href="/team" className={getLinkClasses("/team")}>
                  <div className="flex items-center justify-between">
                    <span>Team</span>
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                      →
                    </span>
                  </div>
                </Link>
              </nav>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.06] hover:text-white active:scale-[0.99]"
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