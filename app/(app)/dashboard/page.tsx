"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  property_id: string
  unit_number: string
  status?: string | null
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  property_id: string
  unit_id: string
  status?: string | null
  lease_start?: string | null
  lease_end?: string | null
}

type TransferRow = {
  id: string
  status: string
  requested_date: string | null
  approved_date: string | null
  move_out_date: string | null
  move_in_date: string | null
  notes: string | null
  denial_reason?: string | null
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
}

type ActionItem = {
  id: string
  priorityNumber: number
  level: "high" | "pending" | "risk"
  title: string
  subtitle: string
  detail: string
  href: string
  accent: string
}

type ActivityItem = {
  id: string
  label: string
  detail: string
  time: string
  tone: "violet" | "emerald" | "red" | "zinc"
}

function formatDateValue(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString()
}

function getDaysUntil(dateValue?: string | null) {
  if (!dateValue) return null

  const today = new Date()
  const target = new Date(dateValue)

  if (Number.isNaN(target.getTime())) return null

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate())

  const diffMs = targetStart.getTime() - todayStart.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function getTransferStage(transfer: TransferRow) {
  const status = (transfer.status ?? "").toLowerCase()

  if (status === "completed") return "completed"
  if (status === "cancelled") return "cancelled"
  if (status === "approved") {
    if (transfer.move_out_date || transfer.move_in_date) return "scheduled"
    return "approved"
  }

  return "requested"
}

function formatRelativeUrgency(days: number | null) {
  if (days === null) return "No date"
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
  if (days === 0) return "Today"
  if (days === 1) return "1 day"
  return `${days} days`
}

function getToneClasses(level: ActionItem["level"]) {
  if (level === "high") {
    return {
      number: "text-violet-400",
      label: "text-violet-300",
      dot: "bg-violet-500",
      button: "border-violet-500/30 text-violet-300 hover:bg-violet-500/10",
    }
  }

  if (level === "pending") {
    return {
      number: "text-violet-400",
      label: "text-violet-300",
      dot: "bg-violet-500",
      button: "border-violet-500/30 text-violet-300 hover:bg-violet-500/10",
    }
  }

  return {
    number: "text-red-400",
    label: "text-red-300",
    dot: "bg-red-500",
    button: "border-red-500/30 text-red-300 hover:bg-red-500/10",
  }
}

function getActivityToneClasses(tone: ActivityItem["tone"]) {
  if (tone === "emerald") return "bg-emerald-500/15 text-emerald-300"
  if (tone === "red") return "bg-red-500/15 text-red-300"
  if (tone === "violet") return "bg-violet-500/15 text-violet-300"
  return "bg-white/8 text-zinc-300"
}

function getSafeTimeLabel(value?: string | null) {
  if (!value) return "Recently"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"

  return date.toLocaleDateString()
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])

  async function loadDashboard() {
    setLoading(true)
    setErrorMessage("")

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()

      if (!session) {
        setErrorMessage("You must be logged in to view the dashboard.")
        setLoading(false)
        return
      }

      const [
        { data: propertiesData, error: propertiesError },
        { data: unitsData, error: unitsError },
        { data: tenantsData, error: tenantsError },
        { data: transfersData, error: transfersError },
      ] = await Promise.all([
        supabaseClient.from("properties").select("id, name").order("name"),
        supabaseClient
          .from("units")
          .select("id, property_id, unit_number, status")
          .order("unit_number"),
        supabaseClient
          .from("tenants")
          .select("id, first_name, last_name, property_id, unit_id, status, lease_start, lease_end")
          .order("created_at", { ascending: false }),
        supabaseClient
          .from("transfers")
          .select(
            "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, denial_reason, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
          )
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

      const nextProperties = (propertiesData ?? []) as PropertyRow[]
      setProperties(nextProperties)
      setUnits((unitsData ?? []) as UnitRow[])
      setTenants((tenantsData ?? []) as TenantRow[])
      setTransfers((transfersData ?? []) as TransferRow[])

      const storedSelectedPropertyId = getStoredSelectedPropertyId()

      if (
        storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
        nextProperties.some((property) => property.id === storedSelectedPropertyId)
      ) {
        setSelectedPropertyId(storedSelectedPropertyId)
      } else if (nextProperties.length > 0) {
        setSelectedPropertyId(nextProperties[0].id)
        setStoredSelectedPropertyId(nextProperties[0].id)
      } else {
        setSelectedPropertyId(ALL_PROPERTIES_VALUE)
        setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
      }

      setLoading(false)
    } catch {
      setErrorMessage("Failed to load dashboard data.")
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    function handlePropertyChange(e: Event) {
      const customEvent = e as CustomEvent<{ propertyId: string }>
      const nextPropertyId = customEvent.detail?.propertyId ?? ALL_PROPERTIES_VALUE
      setSelectedPropertyId(nextPropertyId)
    }

    window.addEventListener("propertyChanged", handlePropertyChange)
    return () => window.removeEventListener("propertyChanged", handlePropertyChange)
  }, [])

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const unitMap = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units]
  )

  const tenantMap = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants]
  )

  const selectedProperty =
    selectedPropertyId === ALL_PROPERTIES_VALUE
      ? null
      : properties.find((property) => property.id === selectedPropertyId) ?? null

  const selectedPropertyName = selectedProperty?.name ?? "All Properties"

  const scopedUnits = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return units
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const scopedTenants = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return tenants
    return tenants.filter((tenant) => tenant.property_id === selectedPropertyId)
  }, [tenants, selectedPropertyId])

  const scopedTransfers = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return transfers
    return transfers.filter(
      (transfer) =>
        transfer.from_property_id === selectedPropertyId ||
        transfer.to_property_id === selectedPropertyId
    )
  }, [transfers, selectedPropertyId])

  const noticeTenants = useMemo(() => {
    return scopedTenants
      .filter((tenant) => (tenant.status ?? "").toLowerCase() === "notice")
      .sort((a, b) => {
        const aDays = getDaysUntil(a.lease_end)
        const bDays = getDaysUntil(b.lease_end)

        if (aDays === null && bDays === null) return 0
        if (aDays === null) return 1
        if (bDays === null) return -1
        return aDays - bDays
      })
  }, [scopedTenants])

  const urgentNoticeTenants = noticeTenants.filter((tenant) => {
    const days = getDaysUntil(tenant.lease_end)
    return days !== null && days <= 7
  })

  const openTransfers = scopedTransfers.filter((transfer) =>
    ["requested", "approved", "scheduled"].includes(getTransferStage(transfer))
  )

  const requestedTransfers = openTransfers.filter(
    (transfer) => getTransferStage(transfer) === "requested"
  )

  const approvedTransfers = openTransfers.filter(
    (transfer) => getTransferStage(transfer) === "approved"
  )

  const scheduledTransfers = openTransfers.filter(
    (transfer) => getTransferStage(transfer) === "scheduled"
  )

  const completedThisScope = scopedTransfers.filter(
    (transfer) => getTransferStage(transfer) === "completed"
  )

  const riskyTransfers = openTransfers.filter((transfer) => {
    if (!transfer.move_in_date) return true

    const destinationUnit = unitMap.get(transfer.to_unit_id)
    if (!destinationUnit) return true

    const destinationStatus = (destinationUnit.status ?? "").toLowerCase()
    if (!["vacant", "make_ready", "notice"].includes(destinationStatus)) return true

    if (destinationStatus === "notice") {
      const destinationOccupant = scopedTenants.find(
        (tenant) =>
          tenant.unit_id === destinationUnit.id &&
          !["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())
      )

      if (!destinationOccupant?.lease_end) return true

      const destinationAvailableDays = getDaysUntil(destinationOccupant.lease_end)
      const requestedMoveDate = new Date(transfer.move_in_date)
      const destinationAvailableDate = new Date(destinationOccupant.lease_end)

      if (
        destinationAvailableDays === null ||
        Number.isNaN(requestedMoveDate.getTime()) ||
        Number.isNaN(destinationAvailableDate.getTime())
      ) {
        return true
      }

      return destinationAvailableDate.getTime() > requestedMoveDate.getTime()
    }

    return false
  })

  const occupancy = scopedUnits.length
    ? Math.round(
        (scopedUnits.filter((unit) => (unit.status ?? "").toLowerCase() === "occupied").length /
          scopedUnits.length) *
          100
      )
    : 0

  const actionItems: ActionItem[] = useMemo(() => {
    const items: ActionItem[] = []

    if (urgentNoticeTenants.length > 0) {
      items.push({
        id: "urgent-notice",
        priorityNumber: 1,
        level: "high",
        title: `${urgentNoticeTenants.length} tenant${urgentNoticeTenants.length === 1 ? "" : "s"} will leave soon`,
        subtitle:
          urgentNoticeTenants.length === 1
            ? "Expiring within 7 days"
            : "Expiring within 7 days",
        detail: `Risk: ${urgentNoticeTenants.length} unit${urgentNoticeTenants.length === 1 ? "" : "s"} may become vacant.`,
        href: "/tenants",
        accent: "Review tenants",
      })
    }

    if (requestedTransfers.length > 0) {
      items.push({
        id: "requested-transfers",
        priorityNumber: items.length + 1,
        level: "pending",
        title: `${requestedTransfers.length} transfer${requestedTransfers.length === 1 ? "" : "s"} awaiting approval`,
        subtitle: "Your decision is needed",
        detail: "Approve, deny, or review timing before vacancy is created.",
        href: "/transfers",
        accent: "Review transfers",
      })
    }

    if (riskyTransfers.length > 0) {
      items.push({
        id: "risky-transfers",
        priorityNumber: items.length + 1,
        level: "risk",
        title: `${riskyTransfers.length} transfer conflict${riskyTransfers.length === 1 ? "" : "s"}`,
        subtitle: "Action required to avoid bad data or vacancy loss",
        detail: "These transfers have timing or destination issues that need attention.",
        href: "/transfers",
        accent: "Fix issue",
      })
    }

    if (items.length === 0) {
      items.push({
        id: "clear",
        priorityNumber: 1,
        level: "pending",
        title: "No urgent decisions right now",
        subtitle: "Your portfolio is clear",
        detail: "No notice pressure, pending approvals, or transfer conflicts in this scope.",
        href: "/transfers",
        accent: "Open transfers",
      })
    }

    return items.slice(0, 3)
  }, [urgentNoticeTenants.length, requestedTransfers.length, riskyTransfers.length])

  const upcomingExpirations = noticeTenants.slice(0, 3)

  const recentActivity: ActivityItem[] = useMemo(() => {
    const items: ActivityItem[] = []

    for (const transfer of scopedTransfers.slice(0, 5)) {
      const tenant = tenantMap.get(transfer.tenant_id)
      const tenantName = tenant
        ? `${tenant.first_name} ${tenant.last_name}`
        : "Unknown tenant"

      const stage = getTransferStage(transfer)

      if (stage === "completed") {
        const toUnit = unitMap.get(transfer.to_unit_id)
        items.push({
          id: `transfer-${transfer.id}`,
          label: "Transfer completed",
          detail: `${tenantName} moved to Unit ${toUnit?.unit_number ?? "?"}`,
          time: getSafeTimeLabel(transfer.move_in_date || transfer.approved_date),
          tone: "violet",
        })
      } else if (stage === "cancelled") {
        items.push({
          id: `transfer-${transfer.id}`,
          label: "Transfer cancelled",
          detail: transfer.denial_reason || `${tenantName} transfer was cancelled`,
          time: getSafeTimeLabel(transfer.approved_date || transfer.requested_date),
          tone: "red",
        })
      } else if (stage === "requested") {
        items.push({
          id: `transfer-${transfer.id}`,
          label: "New transfer request",
          detail: `${tenantName} requested a move`,
          time: getSafeTimeLabel(transfer.requested_date),
          tone: "zinc",
        })
      }
    }

    const renewedCandidates = scopedTenants
      .filter((tenant) => (tenant.status ?? "").toLowerCase() === "active")
      .filter((tenant) => {
        const leaseDays = getDaysUntil(tenant.lease_end)
        return leaseDays !== null && leaseDays > 180
      })
      .slice(0, 1)

    for (const tenant of renewedCandidates) {
      items.push({
        id: `renew-${tenant.id}`,
        label: "Lease active",
        detail: `${tenant.first_name} ${tenant.last_name} has a stable lease`,
        time: formatDateValue(tenant.lease_end),
        tone: "emerald",
      })
    }

    return items.slice(0, 4)
  }, [scopedTransfers, scopedTenants, tenantMap, unitMap])

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-black px-8 py-10 text-white">
        <h1 className="text-5xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-6 text-zinc-400">Loading dashboard...</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-[60vh] bg-black px-8 py-10 text-white">
        <h1 className="text-5xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-6 text-red-400">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 xl:grid-cols-[1.7fr_0.9fr]">
        <section className="border-r border-white/8 pr-0 xl:pr-10">
          <div className="mb-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-zinc-500">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <h1 className="mt-8 max-w-4xl text-6xl font-semibold tracking-[-0.06em] text-white md:text-7xl">
                What should I do right now?
              </h1>
              <p className="mt-6 text-2xl text-zinc-400">
                You have {actionItems.length} item{actionItems.length === 1 ? "" : "s"} that need your decision.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedPropertyId}
                onChange={(e) => {
                  setSelectedPropertyId(e.target.value)
                  setStoredSelectedPropertyId(e.target.value)
                }}
                className="border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none transition hover:border-white/20"
              >
                <option value={ALL_PROPERTIES_VALUE} className="bg-black text-white">
                  All Properties
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id} className="bg-black text-white">
                    {property.name}
                  </option>
                ))}
              </select>

              <Link
                href="/transfers"
                className="border border-violet-500/30 px-4 py-3 text-sm text-violet-300 transition hover:bg-violet-500/10"
              >
                Create transfer
              </Link>
            </div>
          </div>

          <div className="space-y-0">
            {actionItems.map((item, index) => {
              const tone = getToneClasses(item.level)

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[90px_1fr_auto] items-center gap-6 border-b border-white/8 py-10 ${
                    index === 0 ? "border-t border-white/8" : ""
                  }`}
                >
                  <div className={`text-8xl font-semibold tracking-[-0.08em] ${tone.number}`}>
                    {item.priorityNumber}
                  </div>

                  <div>
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                      <p className={`text-xs uppercase tracking-[0.22em] ${tone.label}`}>
                        {item.level === "high"
                          ? "High Priority"
                          : item.level === "pending"
                            ? "Pending"
                            : "At Risk"}
                      </p>
                    </div>

                    <h2 className="mt-4 text-4xl font-medium tracking-[-0.04em] text-white">
                      {item.title}
                    </h2>

                    <p className="mt-3 text-xl text-zinc-300">{item.subtitle}</p>
                    <p className="mt-3 text-base text-zinc-500">{item.detail}</p>
                  </div>

                  <Link
                    href={item.href}
                    className={`inline-flex items-center gap-3 border px-5 py-4 text-sm font-medium transition ${tone.button}`}
                  >
                    {item.accent}
                    <span className="text-xl">→</span>
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="mt-10 flex items-center gap-3 text-zinc-500">
            <span className="inline-block h-1 w-8 bg-violet-500" />
            {actionItems[0]?.title === "No urgent decisions right now"
              ? "You're clear. No urgent actions."
              : "Stay focused on the decision queue."}
          </div>
        </section>

        <aside className="space-y-10">
          <section>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">
                  {selectedPropertyName}
                </p>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
                  Transfer pipeline
                </h2>
              </div>

              <div className="text-right">
                <p className="text-sm text-zinc-500">Occupancy</p>
                <p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-white">
                  {occupancy}%
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {[
                {
                  label: "Requested",
                  value: requestedTransfers.length,
                  sub: "Waiting for review",
                  active: true,
                },
                {
                  label: "Approved",
                  value: approvedTransfers.length,
                  sub: "Ready to schedule",
                  active: true,
                },
                {
                  label: "Scheduled",
                  value: scheduledTransfers.length,
                  sub: "Move-in scheduled",
                  active: true,
                },
                {
                  label: "Completed",
                  value: completedThisScope.length,
                  sub: "This scope",
                  active: false,
                },
              ].map((row, index) => (
                <div key={row.label} className="flex items-start gap-5">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                        row.active
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                          : "border-white/10 bg-white/5 text-zinc-300"
                      }`}
                    >
                      {index + 1}
                    </div>
                    {index < 3 ? <div className="mt-2 h-10 w-px bg-white/10" /> : null}
                  </div>

                  <div className="flex-1 border-b border-white/8 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-2xl font-medium tracking-[-0.03em] text-white">
                          {row.label}
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">{row.sub}</p>
                      </div>
                      <p className="text-2xl font-semibold tracking-[-0.04em] text-white">
                        {row.value}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-medium tracking-[-0.04em] text-white">
                Upcoming expirations
              </h2>
              <Link href="/tenants" className="text-sm text-violet-300 hover:text-violet-200">
                View all
              </Link>
            </div>

            <div className="space-y-5">
              {upcomingExpirations.length > 0 ? (
                upcomingExpirations.map((tenant) => {
                  const unit = unitMap.get(tenant.unit_id)
                  const days = getDaysUntil(tenant.lease_end)

                  return (
                    <Link
                      href="/tenants"
                      key={tenant.id}
                      className="flex items-start justify-between gap-4 border-b border-white/8 pb-5 transition hover:border-violet-500/20"
                    >
                      <div className="min-w-[72px]">
                        <p
                          className={`text-4xl font-semibold tracking-[-0.06em] ${
                            days !== null && days <= 7 ? "text-orange-400" : "text-amber-300"
                          }`}
                        >
                          {days === null ? "—" : days}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {days === 1 ? "Day" : "Days"}
                        </p>
                      </div>

                      <div className="flex-1">
                        <p className="text-xl font-medium text-white">
                          {tenant.first_name} {tenant.last_name}
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          Unit {unit?.unit_number ?? "?"} • {propertyMap.get(tenant.property_id)?.name ?? "Unknown Property"}
                        </p>
                      </div>

                      <div className="pt-1 text-zinc-500">→</div>
                    </Link>
                  )
                })
              ) : (
                <div className="border-b border-white/8 pb-5 text-zinc-500">
                  No notice tenants in this scope.
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-medium tracking-[-0.04em] text-white">
                Recent activity
              </h2>
              <Link href="/transfers" className="text-sm text-violet-300 hover:text-violet-200">
                View all
              </Link>
            </div>

            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 border-b border-white/8 pb-4">
                    <div
                      className={`mt-1 flex h-10 w-10 items-center justify-center rounded-full text-sm ${getActivityToneClasses(
                        item.tone
                      )}`}
                    >
                      •
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium text-white">{item.label}</p>
                      <p className="mt-1 text-sm text-zinc-400">{item.detail}</p>
                    </div>

                    <p className="whitespace-nowrap text-sm text-zinc-500">{item.time}</p>
                  </div>
                ))
              ) : (
                <div className="border-b border-white/8 pb-5 text-zinc-500">
                  No recent activity in this scope.
                </div>
              )}
            </div>
          </section>

          <section className="border-t border-white/8 pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Link
                href="/tenants"
                className="border border-white/10 px-4 py-4 text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
              >
                <p className="text-zinc-500">Tenants on notice</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
                  {noticeTenants.length}
                </p>
              </Link>

              <Link
                href="/properties"
                className="border border-white/10 px-4 py-4 text-zinc-200 transition hover:border-white/20 hover:bg-white/5"
              >
                <p className="text-zinc-500">Vacant units</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
                  {
                    scopedUnits.filter((unit) => (unit.status ?? "").toLowerCase() === "vacant")
                      .length
                  }
                </p>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}