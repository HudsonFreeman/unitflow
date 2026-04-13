"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { getActiveOrganizationContext } from "@/lib/active-organization"
import { supabaseClient } from "@/lib/supabase-client"

type PropertyRow = {
  id: string
  name: string
  organization_id: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  organization_id: string
  status: string | null
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  status: string
  property_id: string
  unit_id: string
  organization_id: string
}

type TransferRow = {
  id: string
  status: string
  requested_date: string | null
  approved_date: string | null
  move_out_date: string | null
  move_in_date: string | null
  notes: string | null
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
  organization_id: string
  created_at: string
}

function getTransferStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "requested":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "approved":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    case "scheduled":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300"
    case "completed":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    case "cancelled":
      return "border-red-500/20 bg-red-500/10 text-red-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function getUnitStatusClasses(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "occupied":
      return "text-emerald-300"
    case "vacant":
      return "text-zinc-300"
    case "make_ready":
      return "text-orange-300"
    case "notice":
      return "text-amber-300"
    default:
      return "text-zinc-400"
  }
}

function formatTransferWindow(moveOutDate?: string | null, moveInDate?: string | null) {
  if (moveOutDate && moveInDate) {
    return `${moveOutDate} → ${moveInDate}`
  }

  if (moveOutDate) {
    return `Move out: ${moveOutDate}`
  }

  if (moveInDate) {
    return `Move in: ${moveInDate}`
  }

  return "Dates not scheduled"
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [role, setRole] = useState("")
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      setErrorMessage("")

      const context = await getActiveOrganizationContext()

      if (context.error) {
        setErrorMessage(context.error)
        setLoading(false)
        return
      }

      if (!context.userId) {
        setErrorMessage("You must be logged in to view the dashboard.")
        setLoading(false)
        return
      }

      // 🔥 NEW: force profile creation first
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("user_id", context.userId)
        .single()

      if (profileError || !profile) {
        router.replace("/create-profile")
        return
      }

      if (!context.membership) {
        router.replace("/onboarding")
        return
      }

      const orgId = context.activeOrganizationId

      setRole(context.membership.role)

      const [
        { data: propertiesData, error: propertiesError },
        { data: unitsData, error: unitsError },
        { data: tenantsData, error: tenantsError },
        { data: transfersData, error: transfersError },
      ] = await Promise.all([
        supabaseClient
          .from("properties")
          .select("id, name, organization_id")
          .eq("organization_id", orgId)
          .order("name"),
        supabaseClient
          .from("units")
          .select("id, unit_number, property_id, organization_id, status")
          .eq("organization_id", orgId)
          .order("unit_number"),
        supabaseClient
          .from("tenants")
          .select("id, first_name, last_name, status, property_id, unit_id, organization_id")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false }),
        supabaseClient
          .from("transfers")
          .select(
            "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id, organization_id, created_at"
          )
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false }),
      ])

      if (propertiesError || unitsError || tenantsError || transfersError) {
        setErrorMessage(
          propertiesError?.message ||
            unitsError?.message ||
            tenantsError?.message ||
            transfersError?.message ||
            "Failed to load dashboard data."
        )
        setLoading(false)
        return
      }

      setProperties((propertiesData ?? []) as PropertyRow[])
      setUnits((unitsData ?? []) as UnitRow[])
      setTenants((tenantsData ?? []) as TenantRow[])
      setTransfers((transfersData ?? []) as TransferRow[])
      setLoading(false)
    }

    loadDashboard()
  }, [router])

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const tenantMap = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants]
  )

  const totalUnits = units.length
  const occupiedUnits = units.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "occupied"
  ).length
  const vacantUnits = units.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "vacant"
  ).length
  const makeReadyUnits = units.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "make_ready"
  ).length
  const noticeUnits = units.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "notice"
  ).length

  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const requestedTransfers = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "requested"
  ).length
  const approvedTransfers = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "approved"
  ).length
  const completedTransfers = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "completed"
  ).length

  const activeTenants = tenants.filter(
    (tenant) => tenant.status.toLowerCase() === "active"
  ).length
  const noticeTenants = tenants.filter(
    (tenant) => tenant.status.toLowerCase() === "notice"
  ).length

  const recentTransfers = transfers.slice(0, 5)

  const propertySummaries = properties.map((property) => {
    const propertyUnits = units.filter((unit) => unit.property_id === property.id)
    const propertyTenants = tenants.filter((tenant) => tenant.property_id === property.id)
    const propertyOccupiedUnits = propertyUnits.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "occupied"
    ).length

    const propertyOccupancy =
      propertyUnits.length > 0
        ? Math.round((propertyOccupiedUnits / propertyUnits.length) * 100)
        : 0

    return {
      property,
      totalUnits: propertyUnits.length,
      occupiedUnits: propertyOccupiedUnits,
      tenants: propertyTenants.length,
      occupancy: propertyOccupancy,
    }
  })

  const setupChecklist = [
    {
      label: "Create your first property",
      done: properties.length > 0,
      href: "/properties",
    },
    {
      label: "Add your first unit",
      done: units.length > 0,
      href: "/properties",
    },
    {
      label: "Add your first tenant",
      done: tenants.length > 0,
      href: "/tenants",
    },
    {
      label: "Create your first transfer",
      done: transfers.length > 0,
      href: "/transfers",
    },
  ]

  const hasSetupGaps = setupChecklist.some((item) => !item.done)

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-zinc-400">Loading dashboard...</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-red-500">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-zinc-400">
            Live portfolio view for your active organization.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/transfers"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Create Transfer
          </Link>
          <Link
            href="/properties"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Add Property
          </Link>
          <Link
            href="/tenants"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Add Tenant
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-zinc-400">Signed-in Role</p>
            <p className="mt-1 text-sm capitalize text-zinc-200">{role}</p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">Portfolio Status</p>
            <p className="mt-1 text-sm text-zinc-200">
              {hasSetupGaps ? "Still setting up" : "Operational"}
            </p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">System</p>
            <p className="mt-1 text-sm text-zinc-200">Portfolio Transfer Management</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Action Center</h2>

        <div className="mt-4 space-y-3">
          {vacantUnits > 0 ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="font-medium text-red-300">
                {vacantUnits} vacant unit{vacantUnits === 1 ? "" : "s"} generating no revenue
              </p>
              <p className="mt-1 text-sm text-red-200">
                Review properties and start transfers to reduce empty-unit gaps.
              </p>
              <Link
                href="/properties"
                className="mt-2 inline-block text-xs text-red-200 hover:text-white"
              >
                View units →
              </Link>
            </div>
          ) : null}

          {noticeTenants > 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="font-medium text-amber-300">
                {noticeTenants} tenant{noticeTenants === 1 ? "" : "s"} on notice
              </p>
              <p className="mt-1 text-sm text-amber-200">
                Plan transfers early before notice turns into vacancy loss.
              </p>
              <Link
                href="/tenants"
                className="mt-2 inline-block text-xs text-amber-200 hover:text-white"
              >
                Review tenants →
              </Link>
            </div>
          ) : null}

          {vacantUnits > 0 && tenants.length > 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-medium text-emerald-300">
                You have vacant units and active tenants — transfers can reduce vacancy.
              </p>
              <p className="mt-1 text-sm text-emerald-200">
                Move quickly to keep occupancy aligned across the portfolio.
              </p>
              <Link
                href="/transfers"
                className="mt-2 inline-block text-xs text-emerald-200 hover:text-white"
              >
                Start transfer →
              </Link>
            </div>
          ) : null}

          {vacantUnits === 0 && noticeTenants === 0 ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="font-medium text-blue-300">No immediate issues detected</p>
              <p className="mt-1 text-sm text-blue-200">
                No vacancy risk or notice pressure is showing right now.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Occupancy Rate</p>
          <p className="mt-3 text-3xl font-semibold">{occupancyRate}%</p>
          <p className="mt-2 text-sm text-zinc-500">
            {occupiedUnits} occupied out of {totalUnits} units
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Open Transfers</p>
          <p className="mt-3 text-3xl font-semibold">{requestedTransfers + approvedTransfers}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {requestedTransfers} requested • {approvedTransfers} approved
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Tenant Health</p>
          <p className="mt-3 text-3xl font-semibold">{activeTenants}</p>
          <p className="mt-2 text-sm text-zinc-500">{noticeTenants} on notice</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Properties</p>
          <p className="mt-3 text-3xl font-semibold">{properties.length}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {completedTransfers} completed transfers total
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Portfolio Snapshot</h2>
            <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
              View
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Total Units</span>
              <span className="font-medium">{totalUnits}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Occupied</span>
              <span className="font-medium">{occupiedUnits}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Vacant</span>
              <span className="font-medium">{vacantUnits}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Make Ready</span>
              <span className="font-medium">{makeReadyUnits}</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Notice Units</span>
              <span className="font-medium">{noticeUnits}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Transfers</h2>
            <Link href="/transfers" className="text-sm text-blue-400 hover:text-blue-300">
              View all
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {recentTransfers.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No transfers yet for this organization.
              </div>
            ) : (
              recentTransfers.map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                const fromProperty = propertyMap.get(transfer.from_property_id)
                const toProperty = propertyMap.get(transfer.to_property_id)

                return (
                  <div
                    key={transfer.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {tenant
                            ? `${tenant.first_name} ${tenant.last_name}`
                            : "Unknown Tenant"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {fromProperty?.name ?? "Unknown Property"} →{" "}
                          {toProperty?.name ?? "Unknown Property"}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {formatTransferWindow(transfer.move_out_date, transfer.move_in_date)}
                        </p>
                      </div>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs capitalize ${getTransferStatusClasses(
                          transfer.status
                        )}`}
                      >
                        {transfer.status}
                      </span>
                    </div>

                    {transfer.notes ? (
                      <p className="mt-3 text-sm text-zinc-400">{transfer.notes}</p>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Property Performance</h2>
            <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
              Manage
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {propertySummaries.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No properties created yet.
              </div>
            ) : (
              propertySummaries.map((summary) => (
                <div
                  key={summary.property.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{summary.property.name}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {summary.totalUnits} units • {summary.tenants} tenants
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-semibold">{summary.occupancy}%</p>
                      <p className="text-xs text-zinc-500">occupied</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Setup Checklist</h2>
            <span className="text-sm text-zinc-500">
              {setupChecklist.filter((item) => item.done).length}/{setupChecklist.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {setupChecklist.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {item.done ? "Completed" : "Still needed"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      item.done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {item.done ? "Done" : "Pending"}
                  </span>

                  {!item.done ? (
                    <Link
                      href={item.href}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                    >
                      Go
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Unit Status Board</h2>
          <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
            Open properties
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {units.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              No units found yet.
            </div>
          ) : (
            units.slice(0, 12).map((unit) => {
              const property = propertyMap.get(unit.property_id)
              const tenant = tenants.find((item) => item.unit_id === unit.id)

              return (
                <div
                  key={unit.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="font-medium">
                    {property?.name ?? "Unknown Property"} • Unit {unit.unit_number}
                  </p>
                  <p className={`mt-2 text-sm ${getUnitStatusClasses(unit.status)}`}>
                    {unit.status?.replaceAll("_", " ") ?? "unknown"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    {tenant
                      ? `${tenant.first_name} ${tenant.last_name}`
                      : "No assigned tenant"}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}