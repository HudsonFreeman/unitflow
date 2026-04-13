"use client"

import { useEffect, useMemo, useState } from "react"
import { getActiveOrganizationContext } from "@/lib/active-organization"
import { supabaseClient } from "@/lib/supabase-client"

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
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  property_id: string
  unit_id: string
  organization_id: string
  status?: string | null
  lease_end?: string | null
}

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
  status?: string | null
}

type TimingRiskItem = {
  transfer: TransferRow
  risk: "missing_dates" | "overlap" | "vacancy_gap"
  gapDays: number | null
}

type SmartSuggestion = {
  tenantId: string
  tenantName: string
  fromPropertyName: string
  fromUnitNumber: string
  suggestedPropertyId: string
  suggestedPropertyName: string
  suggestedUnitId: string
  suggestedUnitNumber: string
  suggestedUnitStatus: string | null
  score: number
  reason: string
  leaseRiskLabel: string
  impactLabel: string
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
    case "vacant":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    case "make_ready":
      return "border-orange-500/20 bg-orange-500/10 text-orange-300"
    case "notice":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "occupied":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function formatUnitStatus(status?: string | null) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

function getUnitPriorityScore(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "vacant":
      return 3
    case "make_ready":
      return 2
    case "notice":
      return 1
    default:
      return 0
  }
}

function getDateDiffInDays(start: string, end: string) {
  const startDate = new Date(start)
  const endDate = new Date(end)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function getPipelineStage(transfer: TransferRow) {
  const status = transfer.status.toLowerCase()

  if (status === "completed") return "completed"
  if (status === "approved") {
    if (transfer.move_out_date || transfer.move_in_date) return "scheduled"
    return "approved"
  }
  return "requested"
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

function getLeaseRiskLabel(leaseEnd?: string | null) {
  const days = getDaysUntil(leaseEnd)

  if (days === null) return "No lease end date"
  if (days < 0) return "Lease expired"
  if (days <= 30) return "Lease ending soon"
  if (days <= 60) return "Lease ending in 60 days"
  return "Longer runway"
}

export default function TransfersPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState("")
  const [suggestionLoadingTenantId, setSuggestionLoadingTenantId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [role, setRole] = useState("")
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [selectedToPropertyId, setSelectedToPropertyId] = useState("")
  const [selectedToUnitId, setSelectedToUnitId] = useState("")
  const [requestedDate, setRequestedDate] = useState("")
  const [moveOutDate, setMoveOutDate] = useState("")
  const [moveInDate, setMoveInDate] = useState("")
  const [notes, setNotes] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  function clearMessages() {
    setErrorMessage("")
    setSuccessMessage("")
  }

  async function loadTransfersPage() {
    setLoading(true)
    setErrorMessage("")

    const context = await getActiveOrganizationContext()

    if (context.error) {
      setErrorMessage(context.error)
      setLoading(false)
      return
    }

    if (!context.userId) {
      setErrorMessage("You must be logged in to view transfers.")
      setLoading(false)
      return
    }

    if (!context.membership) {
      setErrorMessage("No organization membership found for this user.")
      setLoading(false)
      return
    }

    const orgId = context.activeOrganizationId

    setOrganizationId(orgId)
    setRole(context.membership.role)

    const [
      { data: transfersData, error: transfersError },
      { data: tenantsData, error: tenantsError },
      { data: propertiesData, error: propertiesError },
      { data: unitsData, error: unitsError },
    ] = await Promise.all([
      supabaseClient
        .from("transfers")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabaseClient
        .from("tenants")
        .select("id, first_name, last_name, property_id, unit_id, organization_id, status, lease_end")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
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
    ])

    if (transfersError || tenantsError || propertiesError || unitsError) {
      setErrorMessage(
        transfersError?.message ||
          tenantsError?.message ||
          propertiesError?.message ||
          unitsError?.message ||
          "Failed to load transfers page data."
      )
      setLoading(false)
      return
    }

    setTransfers((transfersData ?? []) as TransferRow[])
    setTenants((tenantsData ?? []) as TenantRow[])
    setProperties((propertiesData ?? []) as PropertyRow[])
    setUnits((unitsData ?? []) as UnitRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadTransfersPage()
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

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null

  const fromUnitId = selectedTenant?.unit_id ?? ""

  const openTransfers = useMemo(() => {
    return transfers.filter((transfer) =>
      ["requested", "approved", "scheduled"].includes(transfer.status.toLowerCase())
    )
  }, [transfers])

  const destinationUnits = useMemo(() => {
    if (!selectedToPropertyId) return []

    return units.filter((unit) => {
      const status = (unit.status ?? "").toLowerCase()

      return (
        unit.property_id === selectedToPropertyId &&
        unit.id !== fromUnitId &&
        ["vacant", "make_ready", "notice"].includes(status)
      )
    })
  }, [units, selectedToPropertyId, fromUnitId])

  const recommendedDestinationUnit = useMemo(() => {
    if (!selectedTenant) return null

    const candidates = units
      .filter((unit) => unit.id !== selectedTenant.unit_id)
      .filter((unit) =>
        ["vacant", "make_ready", "notice"].includes((unit.status ?? "").toLowerCase())
      )
      .filter((unit) => !openTransfers.some((transfer) => transfer.to_unit_id === unit.id))
      .sort((a, b) => {
        const aSameProperty = a.property_id === selectedTenant.property_id ? 1 : 0
        const bSameProperty = b.property_id === selectedTenant.property_id ? 1 : 0

        if (bSameProperty !== aSameProperty) {
          return bSameProperty - aSameProperty
        }

        const scoreDiff = getUnitPriorityScore(b.status) - getUnitPriorityScore(a.status)
        if (scoreDiff !== 0) return scoreDiff

        const propertyA = propertyMap.get(a.property_id)?.name ?? ""
        const propertyB = propertyMap.get(b.property_id)?.name ?? ""

        if (propertyA !== propertyB) {
          return propertyA.localeCompare(propertyB)
        }

        return a.unit_number.localeCompare(b.unit_number, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })

    return candidates[0] ?? null
  }, [selectedTenant, units, openTransfers, propertyMap])

  const smartSuggestions = useMemo(() => {
    const availableUnits = units.filter((unit) =>
      ["vacant", "make_ready", "notice"].includes((unit.status ?? "").toLowerCase())
    )

    const suggestions: SmartSuggestion[] = []

    for (const tenant of tenants) {
      const tenantStatus = (tenant.status ?? "").toLowerCase()
      const tenantHasOpenTransfer = openTransfers.some(
        (transfer) => transfer.tenant_id === tenant.id
      )

      const leaseDays = getDaysUntil(tenant.lease_end)
      const leaseSoon = leaseDays !== null && leaseDays <= 45
      const onNotice = tenantStatus === "notice"

      if (!leaseSoon && !onNotice) continue
      if (tenantHasOpenTransfer) continue

      const candidates = availableUnits
        .filter((unit) => unit.id !== tenant.unit_id)
        .filter((unit) => !openTransfers.some((transfer) => transfer.to_unit_id === unit.id))
        .map((unit) => {
          const samePropertyBonus = unit.property_id === tenant.property_id ? 5 : 0
          const priorityScore = getUnitPriorityScore(unit.status)
          const leaseUrgencyBonus = onNotice ? 4 : leaseSoon ? 2 : 0
          const score = priorityScore * 10 + samePropertyBonus + leaseUrgencyBonus

          let reason = "Best available match"
          if (unit.property_id === tenant.property_id && (unit.status ?? "").toLowerCase() === "vacant") {
            reason = "Same property + vacant now"
          } else if ((unit.status ?? "").toLowerCase() === "vacant") {
            reason = "Vacant now"
          } else if ((unit.status ?? "").toLowerCase() === "make_ready") {
            reason = "Make-ready candidate"
          } else if ((unit.status ?? "").toLowerCase() === "notice") {
            reason = "Notice unit could line up next"
          }

          const impactLabel =
            (unit.status ?? "").toLowerCase() === "vacant"
              ? "Prevents vacancy gap"
              : "Keeps transfer options open"

          return {
            unit,
            score,
            reason,
            impactLabel,
          }
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score

          const propertyA = propertyMap.get(a.unit.property_id)?.name ?? ""
          const propertyB = propertyMap.get(b.unit.property_id)?.name ?? ""
          if (propertyA !== propertyB) return propertyA.localeCompare(propertyB)

          return a.unit.unit_number.localeCompare(b.unit.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        })

      const best = candidates[0]
      const fromProperty = propertyMap.get(tenant.property_id)
      const fromUnit = unitMap.get(tenant.unit_id)
      const suggestedProperty = best ? propertyMap.get(best.unit.property_id) : null

      if (!best || !fromProperty || !fromUnit || !suggestedProperty) continue

      suggestions.push({
        tenantId: tenant.id,
        tenantName: `${tenant.first_name} ${tenant.last_name}`,
        fromPropertyName: fromProperty.name,
        fromUnitNumber: fromUnit.unit_number,
        suggestedPropertyId: best.unit.property_id,
        suggestedPropertyName: suggestedProperty.name,
        suggestedUnitId: best.unit.id,
        suggestedUnitNumber: best.unit.unit_number,
        suggestedUnitStatus: best.unit.status ?? null,
        score: best.score,
        reason: best.reason,
        leaseRiskLabel: getLeaseRiskLabel(tenant.lease_end),
        impactLabel: best.impactLabel,
      })
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
  }, [tenants, units, openTransfers, propertyMap, unitMap])

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return transfers

    return transfers.filter(
      (transfer) => transfer.status.toLowerCase() === statusFilter.toLowerCase()
    )
  }, [transfers, statusFilter])

  const requestedCount = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "requested"
  ).length

  const approvedCount = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "approved"
  ).length

  const completedCount = transfers.filter(
    (transfer) => transfer.status.toLowerCase() === "completed"
  ).length

  const isManager = role.toLowerCase() === "manager"

  const pipelineCounts = useMemo(() => {
    const counts = {
      requested: 0,
      approved: 0,
      scheduled: 0,
      completed: 0,
    }

    for (const transfer of transfers) {
      const stage = getPipelineStage(transfer)
      counts[stage] += 1
    }

    return counts
  }, [transfers])

  const conflictGroups = useMemo(() => {
    const byUnit = new Map<string, TransferRow[]>()

    for (const transfer of openTransfers) {
      const existing = byUnit.get(transfer.to_unit_id) ?? []
      existing.push(transfer)
      byUnit.set(transfer.to_unit_id, existing)
    }

    return Array.from(byUnit.entries())
      .map(([unitId, group]) => ({ unitId, transfers: group }))
      .filter((group) => group.transfers.length > 1)
  }, [openTransfers])

  const bestAvailableUnits = useMemo(() => {
    return units
      .filter((unit) =>
        ["vacant", "make_ready", "notice"].includes((unit.status ?? "").toLowerCase())
      )
      .filter((unit) => !openTransfers.some((transfer) => transfer.to_unit_id === unit.id))
      .sort((a, b) => {
        const scoreDiff = getUnitPriorityScore(b.status) - getUnitPriorityScore(a.status)
        if (scoreDiff !== 0) return scoreDiff

        const propertyA = propertyMap.get(a.property_id)?.name ?? ""
        const propertyB = propertyMap.get(b.property_id)?.name ?? ""

        if (propertyA !== propertyB) return propertyA.localeCompare(propertyB)

        return a.unit_number.localeCompare(b.unit_number, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })
      .slice(0, 6)
  }, [units, openTransfers, propertyMap])

  const tenantsWithOpenTransfers = useMemo(() => {
    return openTransfers
      .map((transfer) => tenantMap.get(transfer.tenant_id))
      .filter((tenant): tenant is TenantRow => Boolean(tenant))
  }, [openTransfers, tenantMap])

  const noticeAndMakeReadyPool = useMemo(() => {
    return units.filter((unit) => {
      const status = (unit.status ?? "").toLowerCase()
      return status === "notice" || status === "make_ready"
    })
  }, [units])

  const timingRiskTransfers = useMemo(() => {
    const results: TimingRiskItem[] = []

    for (const transfer of openTransfers) {
      if (!transfer.move_out_date || !transfer.move_in_date) {
        results.push({
          transfer,
          risk: "missing_dates",
          gapDays: null,
        })
        continue
      }

      const gapDays = getDateDiffInDays(transfer.move_out_date, transfer.move_in_date)

      if (gapDays === null) {
        results.push({
          transfer,
          risk: "missing_dates",
          gapDays: null,
        })
        continue
      }

      if (gapDays < 0) {
        results.push({
          transfer,
          risk: "overlap",
          gapDays,
        })
        continue
      }

      if (gapDays > 1) {
        results.push({
          transfer,
          risk: "vacancy_gap",
          gapDays,
        })
      }
    }

    return results
  }, [openTransfers])

  const transfersRequiringReview = useMemo(() => {
    return transfers.filter((transfer) => getPipelineStage(transfer) === "requested").length
  }, [transfers])

  const approvedNeedingScheduling = useMemo(() => {
    return transfers.filter((transfer) => getPipelineStage(transfer) === "approved").length
  }, [transfers])

  const scheduledTransfers = useMemo(() => {
    return transfers.filter((transfer) => getPipelineStage(transfer) === "scheduled").length
  }, [transfers])

  async function handleUseSuggestion(suggestion: SmartSuggestion) {
    clearMessages()
    setSuggestionLoadingTenantId(suggestion.tenantId)

    setSelectedTenantId(suggestion.tenantId)
    setSelectedToPropertyId(suggestion.suggestedPropertyId)
    setSelectedToUnitId(suggestion.suggestedUnitId)

    const today = new Date()
    const plusTwo = new Date(today)
    plusTwo.setDate(today.getDate() + 2)
    const plusThree = new Date(today)
    plusThree.setDate(today.getDate() + 3)

    const formatDate = (value: Date) => value.toISOString().slice(0, 10)

    setRequestedDate(formatDate(today))
    setMoveOutDate(formatDate(plusTwo))
    setMoveInDate(formatDate(plusThree))
    setNotes(
      `Suggested transfer: ${suggestion.tenantName} from ${suggestion.fromPropertyName} Unit ${suggestion.fromUnitNumber} to ${suggestion.suggestedPropertyName} Unit ${suggestion.suggestedUnitNumber}.`
    )

    setSuggestionLoadingTenantId("")
    setSuccessMessage("Suggestion applied. Review dates and create the transfer.")

    setTimeout(() => {
      const formSection = document.getElementById("create-transfer-form")
      formSection?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }

  async function handleCreateTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!selectedTenant) {
      setErrorMessage("Select a tenant.")
      return
    }

    if (!selectedToPropertyId) {
      setErrorMessage("Select a destination property.")
      return
    }

    if (!selectedToUnitId) {
      setErrorMessage("Select a destination unit.")
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: selectedTenant.id,
          to_property_id: selectedToPropertyId,
          to_unit_id: selectedToUnitId,
          requested_date: requestedDate,
          move_out_date: moveOutDate,
          move_in_date: moveInDate,
          notes,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to create transfer.")
        setSubmitting(false)
        return
      }

      setSelectedTenantId("")
      setSelectedToPropertyId("")
      setSelectedToUnitId("")
      setRequestedDate("")
      setMoveOutDate("")
      setMoveInDate("")
      setNotes("")
      setSuccessMessage("Transfer request created.")
      setSubmitting(false)

      await loadTransfersPage()
    } catch {
      setErrorMessage("Failed to create transfer.")
      setSubmitting(false)
    }
  }

  async function handleApproveTransfer(transferId: string) {
    clearMessages()

    if (!isManager) {
      setErrorMessage("Only managers can approve transfers.")
      return
    }

    setActionLoadingId(transferId)

    try {
      const response = await fetch("/api/transfers/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transfer_id: transferId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to approve transfer.")
        setActionLoadingId("")
        return
      }

      setActionLoadingId("")
      setSuccessMessage("Transfer approved.")
      await loadTransfersPage()
    } catch {
      setErrorMessage("Failed to approve transfer.")
      setActionLoadingId("")
    }
  }

  async function handleCompleteTransfer(transferId: string) {
    clearMessages()

    if (!isManager) {
      setErrorMessage("Only managers can complete transfers.")
      return
    }

    setActionLoadingId(transferId)

    try {
      const response = await fetch("/api/transfers/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transfer_id: transferId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to complete transfer.")
        setActionLoadingId("")
        return
      }

      setActionLoadingId("")
      setSuccessMessage("Transfer completed.")
      await loadTransfersPage()
    } catch {
      setErrorMessage("Failed to complete transfer.")
      setActionLoadingId("")
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Transfers</h1>
        <p className="mt-4 text-zinc-400">Loading transfers...</p>
      </div>
    )
  }

  if (errorMessage && transfers.length === 0 && tenants.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Transfers</h1>
        <p className="mt-4 text-red-500">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Transfers</h1>

      <p className="mt-2 text-zinc-400">
        Coordinate internal resident moves, reduce vacancy risk, and keep every handoff visible.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Signed-in role</p>
        <p className="mt-1 text-sm capitalize text-zinc-200">{role}</p>
        <p className="mt-3 text-sm text-zinc-400">Transfer environment</p>
        <p className="mt-1 text-sm text-zinc-200">
          Suggestions, destination units, and transfer activity are scoped to your active organization.
        </p>
      </div>

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      {errorMessage && !(errorMessage && transfers.length === 0 && tenants.length === 0) ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Smart Transfer Suggestions</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Recommended actions based on lease timing, notice risk, and live unit availability.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-zinc-300">
            {smartSuggestions.length} suggestion{smartSuggestions.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {smartSuggestions.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              No transfer opportunities need attention right now. Add lease end dates or place tenants on notice to generate recommendations.
            </div>
          ) : (
            smartSuggestions.map((suggestion) => (
              <div
                key={`${suggestion.tenantId}-${suggestion.suggestedUnitId}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">
                        {suggestion.tenantName} — HIGH PRIORITY
                      </p>
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                        {suggestion.leaseRiskLabel}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-sm text-zinc-300">
                      <p>
                        <span className="text-zinc-500">Risk:</span>{" "}
                        {suggestion.leaseRiskLabel === "Longer runway"
                          ? "Tenant movement opportunity identified"
                          : suggestion.leaseRiskLabel}
                      </p>
                      <p>
                        <span className="text-zinc-500">Opportunity:</span>{" "}
                        {suggestion.suggestedPropertyName} • Unit {suggestion.suggestedUnitNumber} ({formatUnitStatus(suggestion.suggestedUnitStatus)})
                      </p>
                      <p>
                        <span className="text-zinc-500">Impact:</span> {suggestion.impactLabel}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
                        Current: {suggestion.fromPropertyName} • Unit {suggestion.fromUnitNumber}
                      </span>
                      <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300">
                        {suggestion.reason}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUseSuggestion(suggestion)}
                      disabled={suggestionLoadingTenantId === suggestion.tenantId}
                      className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    >
                      View Details
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUseSuggestion(suggestion)}
                      disabled={suggestionLoadingTenantId === suggestion.tenantId}
                      className="rounded bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {suggestionLoadingTenantId === suggestion.tenantId
                        ? "Applying..."
                        : "Move"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Transfer Pipeline</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Review what needs approval, scheduling, and completion.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-200">Requested</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.requested}</p>
            <p className="mt-2 text-xs text-amber-100/80">
              {transfersRequiringReview === 0 ? "No requests waiting" : "Review requests"}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-sm text-emerald-200">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.approved}</p>
            <p className="mt-2 text-xs text-emerald-100/80">
              {approvedNeedingScheduling === 0 ? "Nothing approved" : "Schedule moves"}
            </p>
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <p className="text-sm text-blue-200">Scheduled</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.scheduled}</p>
            <p className="mt-2 text-xs text-blue-100/80">
              {scheduledTransfers === 0 ? "Nothing scheduled" : "View timing"}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-500/20 bg-zinc-500/10 p-4">
            <p className="text-sm text-zinc-200">Completed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.completed}</p>
            <p className="mt-2 text-xs text-zinc-300/80">View history</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-amber-200">Requested Queue</p>
            <div className="mt-3 space-y-2">
              {transfers.filter((t) => getPipelineStage(t) === "requested").slice(0, 4).map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                return (
                  <div
                    key={transfer.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  >
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
                  </div>
                )
              })}
              {transfers.filter((t) => getPipelineStage(t) === "requested").length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing waiting.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-emerald-200">Approved Queue</p>
            <div className="mt-3 space-y-2">
              {transfers.filter((t) => getPipelineStage(t) === "approved").slice(0, 4).map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                return (
                  <div
                    key={transfer.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  >
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
                  </div>
                )
              })}
              {transfers.filter((t) => getPipelineStage(t) === "approved").length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing approved.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-blue-200">Scheduled Queue</p>
            <div className="mt-3 space-y-2">
              {transfers.filter((t) => getPipelineStage(t) === "scheduled").slice(0, 4).map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                return (
                  <div
                    key={transfer.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  >
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
                  </div>
                )
              })}
              {transfers.filter((t) => getPipelineStage(t) === "scheduled").length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing scheduled.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-zinc-200">Recently Completed</p>
            <div className="mt-3 space-y-2">
              {transfers.filter((t) => getPipelineStage(t) === "completed").slice(0, 4).map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                return (
                  <div
                    key={transfer.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  >
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
                  </div>
                )
              })}
              {transfers.filter((t) => getPipelineStage(t) === "completed").length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing completed yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold">Transfer Intelligence</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-zinc-400">Conflicting Destinations</p>
              <p className="mt-2 text-2xl font-semibold text-white">{conflictGroups.length}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {conflictGroups.length === 0
                  ? "No conflicts detected"
                  : "Destination units targeted by more than one open transfer"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-zinc-400">Tenants in Motion</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {tenantsWithOpenTransfers.length}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {tenantsWithOpenTransfers.length === 0
                  ? "No transfers currently moving"
                  : "Tenants with requested or approved transfers"}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-zinc-400">Ready Pool</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {noticeAndMakeReadyPool.length}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {noticeAndMakeReadyPool.length === 0
                  ? "No immediate backup options"
                  : `${noticeAndMakeReadyPool.length} unit${noticeAndMakeReadyPool.length === 1 ? "" : "s"} ready for immediate transfer planning`}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Best Units for Immediate Transfers</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Use these when resolving tenant risk or creating a transfer now.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {bestAvailableUnits.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No strong destination candidates right now.
              </div>
            ) : (
              bestAvailableUnits.map((unit) => {
                const property = propertyMap.get(unit.property_id)

                return (
                  <div
                    key={unit.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <p className="font-medium text-white">
                      {property?.name ?? "Unknown Property"} • Unit {unit.unit_number}
                    </p>
                    <div
                      className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs ${getUnitStatusClasses(
                        unit.status
                      )}`}
                    >
                      {formatUnitStatus(unit.status)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {timingRiskTransfers.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Vacancy Risk Watchlist</h2>
          <div className="mt-4 space-y-3">
            {timingRiskTransfers.map(({ transfer, risk, gapDays }) => {
              const tenant = tenantMap.get(transfer.tenant_id)
              const fromProperty = propertyMap.get(transfer.from_property_id)
              const fromUnit = unitMap.get(transfer.from_unit_id)

              let riskText = "Transfer needs dates before it can be coordinated cleanly."
              if (risk === "overlap") {
                riskText = `Move-in happens before move-out by ${Math.abs(gapDays ?? 0)} day(s).`
              } else if (risk === "vacancy_gap") {
                riskText = `Potential vacancy gap of ${gapDays ?? 0} day(s).`
              }

              return (
                <div
                  key={transfer.id}
                  className="rounded-xl border border-amber-500/20 bg-black/20 p-4"
                >
                  <p className="font-medium text-white">
                    {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-300">
                    {fromProperty?.name ?? "Unknown Property"} • Unit {fromUnit?.unit_number ?? "?"}
                  </p>
                  <p className="mt-2 text-sm text-amber-200">{riskText}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {conflictGroups.length > 0 ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-5">
          <h2 className="text-lg font-semibold text-red-200">Conflict Alerts</h2>
          <div className="mt-4 space-y-3">
            {conflictGroups.map((group) => {
              const unit = unitMap.get(group.unitId)
              const property = unit ? propertyMap.get(unit.property_id) : null

              return (
                <div
                  key={group.unitId}
                  className="rounded-xl border border-red-500/20 bg-black/20 p-4"
                >
                  <p className="font-medium text-white">
                    {property?.name ?? "Unknown Property"} • Unit {unit?.unit_number ?? "?"}
                  </p>
                  <p className="mt-1 text-sm text-red-200">
                    {group.transfers.length} open transfers are targeting this same destination unit.
                  </p>

                  <div className="mt-3 space-y-2">
                    {group.transfers.map((transfer) => {
                      const tenant = tenantMap.get(transfer.tenant_id)

                      return (
                        <div
                          key={transfer.id}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                        >
                          {tenant
                            ? `${tenant.first_name} ${tenant.last_name}`
                            : "Unknown Tenant"}{" "}
                          • {transfer.status}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-full border px-4 py-2 text-sm ${
              statusFilter === "all"
                ? "border-white/20 bg-white/10 text-white"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            All ({transfers.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("requested")}
            className={`rounded-full border px-4 py-2 text-sm ${
              statusFilter === "requested"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            Requested ({requestedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("approved")}
            className={`rounded-full border px-4 py-2 text-sm ${
              statusFilter === "approved"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            Approved ({approvedCount})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={`rounded-full border px-4 py-2 text-sm ${
              statusFilter === "completed"
                ? "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {filteredTransfers.map((transfer) => {
          const tenant = tenantMap.get(transfer.tenant_id)
          const fromProperty = propertyMap.get(transfer.from_property_id)
          const toProperty = propertyMap.get(transfer.to_property_id)
          const fromUnit = unitMap.get(transfer.from_unit_id)
          const toUnit = unitMap.get(transfer.to_unit_id)

          const stage = getPipelineStage(transfer)

          return (
            <div
              key={transfer.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-medium">
                    {tenant
                      ? `${tenant.first_name} ${tenant.last_name}`
                      : "Unknown Tenant"}
                  </h2>

                  <p className="mt-2 text-zinc-300">
                    {fromProperty?.name ?? "Unknown Property"} Unit{" "}
                    {fromUnit?.unit_number ?? "?"} → {toProperty?.name ?? "Unknown Property"} Unit{" "}
                    {toUnit?.unit_number ?? "?"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                      Requested: {transfer.requested_date ?? "—"}
                    </span>

                    {transfer.approved_date ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                        Approved: {transfer.approved_date}
                      </span>
                    ) : null}

                    {transfer.move_out_date || transfer.move_in_date ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                        Timing: {transfer.move_out_date ?? "—"} → {transfer.move_in_date ?? "—"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-3 py-1 ${
                        stage === "requested"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                          : stage === "approved"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : stage === "scheduled"
                          ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
                          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
                      }`}
                    >
                      {stage === "requested"
                        ? "Review needed"
                        : stage === "approved"
                        ? "Ready to schedule"
                        : stage === "scheduled"
                        ? "Move timing set"
                        : "Completed"}
                    </span>
                  </div>

                  {transfer.notes ? (
                    <p className="mt-3 text-sm text-zinc-400">{transfer.notes}</p>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-3">
                  <div
                    className={`rounded-full border px-3 py-1 text-sm capitalize ${getTransferStatusClasses(
                      transfer.status
                    )}`}
                  >
                    {transfer.status}
                  </div>

                  {isManager && transfer.status.toLowerCase() === "requested" ? (
                    <button
                      type="button"
                      onClick={() => handleApproveTransfer(transfer.id)}
                      disabled={actionLoadingId === transfer.id}
                      className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {actionLoadingId === transfer.id ? "Approving..." : "Approve Transfer"}
                    </button>
                  ) : null}

                  {isManager && transfer.status.toLowerCase() === "approved" ? (
                    <button
                      type="button"
                      onClick={() => handleCompleteTransfer(transfer.id)}
                      disabled={actionLoadingId === transfer.id}
                      className="rounded bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {actionLoadingId === transfer.id ? "Completing..." : "Complete Transfer"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {filteredTransfers.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            No transfers found for this filter.
          </div>
        ) : null}
      </div>

      <div
        id="create-transfer-form"
        className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6"
      >
        <h2 className="mb-1 text-xl font-semibold">Create Transfer Request</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Use this when you need to create a transfer manually. Suggestions above will pre-fill this form when available.
        </p>

        <form onSubmit={handleCreateTransfer} className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Tenant</label>
            <select
              className="w-full rounded bg-black p-2"
              required
              value={selectedTenantId}
              onChange={(e) => {
                setSelectedTenantId(e.target.value)
                setSelectedToPropertyId("")
                setSelectedToUnitId("")
              }}
            >
              <option value="">Select Tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.first_name} {tenant.last_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Current Property</label>
            <div className="rounded bg-black p-2 text-zinc-300">
              {selectedTenant
                ? propertyMap.get(selectedTenant.property_id)?.name ?? "Unknown Property"
                : "Auto-fills after tenant selection"}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Current Unit</label>
            <div className="rounded bg-black p-2 text-zinc-300">
              {selectedTenant
                ? `Unit ${unitMap.get(selectedTenant.unit_id)?.unit_number ?? "?"}`
                : "Auto-fills after tenant selection"}
            </div>
          </div>

          {selectedTenant ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-200">Lease Timing</p>
              <p className="mt-1 text-sm text-zinc-100">
                {getLeaseRiskLabel(selectedTenant.lease_end)}
              </p>
            </div>
          ) : null}

          {selectedTenant && recommendedDestinationUnit ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-200">Recommended Destination</p>
              <p className="mt-1 text-sm text-zinc-100">
                {propertyMap.get(recommendedDestinationUnit.property_id)?.name ?? "Unknown Property"} • Unit{" "}
                {recommendedDestinationUnit.unit_number}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                Status: {formatUnitStatus(recommendedDestinationUnit.status)}
              </p>

              <button
                type="button"
                onClick={() => {
                  setSelectedToPropertyId(recommendedDestinationUnit.property_id)
                  setSelectedToUnitId(recommendedDestinationUnit.id)
                }}
                className="mt-3 rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700"
              >
                Use Recommendation
              </button>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Destination Property</label>
            <select
              className="w-full rounded bg-black p-2"
              required
              value={selectedToPropertyId}
              onChange={(e) => {
                setSelectedToPropertyId(e.target.value)
                setSelectedToUnitId("")
              }}
            >
              <option value="">Select Destination Property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Destination Unit</label>
            <select
              className="w-full rounded bg-black p-2"
              required
              value={selectedToUnitId}
              onChange={(e) => setSelectedToUnitId(e.target.value)}
              disabled={!selectedToPropertyId}
            >
              <option value="">
                {!selectedToPropertyId
                  ? "Select Destination Property First"
                  : destinationUnits.length === 0
                  ? "No available units"
                  : "Select Destination Unit"}
              </option>

              {destinationUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unit_number} — {formatUnitStatus(unit.status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Requested Date</label>
            <input
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move Out Date</label>
            <input
              value={moveOutDate}
              onChange={(e) => setMoveOutDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move In Date</label>
            <input
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              className="w-full rounded bg-black p-2"
              rows={3}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Transfer"}
          </button>
        </form>
      </div>
    </div>
  )
}