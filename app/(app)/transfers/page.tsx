"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

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

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status?: string | null
}

type TimingRiskItem = {
  transfer: TransferRow
  risk: "missing_dates" | "overlap" | "vacancy_gap"
  gapDays: number | null
}

type DestinationUnitOption = UnitRow & {
  expectedDate: Date | null
  gap: number | null
  label: string
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

function formatUnitStatus(status?: string | null) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

function formatTenantStatus(status?: string | null) {
  if (!status) return "Unknown"
  return status.replaceAll("_", " ")
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

function formatDateForInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatShortDate(date: Date | null) {
  if (!date) return "Unknown"
  return date.toLocaleDateString()
}

function formatDateValue(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function getExpectedAvailableDate(
  unit: UnitRow,
  tenants: TenantRow[],
  transfers: TransferRow[]
): Date | null {
  const status = (unit.status ?? "").toLowerCase()
  const today = new Date()

  if (status === "vacant") return today

  if (status === "make_ready") {
    const d = new Date(today)
    d.setDate(today.getDate() + 7)
    return d
  }

  const relatedOpenTransfer = transfers.find(
    (transfer) =>
      transfer.from_unit_id === unit.id &&
      ["requested", "approved", "scheduled"].includes(transfer.status.toLowerCase()) &&
      transfer.move_out_date
  )

  if (relatedOpenTransfer?.move_out_date) {
    const d = new Date(relatedOpenTransfer.move_out_date)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (status === "notice") {
    const tenant = tenants.find(
      (t) =>
        t.unit_id === unit.id &&
        !["moved_out", "transferred"].includes((t.status ?? "").toLowerCase())
    )

    if (tenant?.lease_end) {
      const d = new Date(tenant.lease_end)
      if (!Number.isNaN(d.getTime())) return d
    }
  }

  return null
}

function getTimingLabel(gap: number | null) {
  if (gap === null) return "Unknown timing"
  if (gap >= 0 && gap <= 2) return "Best fit"
  if (gap < 0) return "Available early"
  if (gap <= 7) return "Slight delay"
  return "Too late"
}

function getMoveVsLeaseLabel(moveInDate?: string, leaseEnd?: string | null) {
  if (!moveInDate || !leaseEnd) return "Move timing vs lease unknown"

  const diff = getDateDiffInDays(moveInDate, leaseEnd)
  if (diff === null) return "Move timing vs lease unknown"

  if (diff < 0) return `Move is ${Math.abs(diff)} day(s) after lease end`
  if (diff === 0) return "Move is on lease end date"
  return `Move is ${diff} day(s) before lease end`
}

export default function TransfersPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)
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

  function handleSelectedPropertyChange(nextPropertyId: string) {
    setSelectedPropertyId(nextPropertyId)
    setStoredSelectedPropertyId(nextPropertyId)
    setSelectedTenantId("")
    setSelectedToUnitId("")
    setSelectedToPropertyId(nextPropertyId === ALL_PROPERTIES_VALUE ? "" : nextPropertyId)
    setRequestedDate("")
    setMoveOutDate("")
    setMoveInDate("")
  }

  function setDefaultTransferDates() {
    const today = new Date()
    const moveOut = new Date(today)
    const moveIn = new Date(today)

    moveOut.setDate(today.getDate() + 7)
    moveIn.setDate(today.getDate() + 8)

    setRequestedDate(formatDateForInput(today))
    setMoveOutDate(formatDateForInput(moveOut))
    setMoveInDate(formatDateForInput(moveIn))
  }

  async function loadTransfersPage() {
    setLoading(true)
    setErrorMessage("")

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      setErrorMessage("You must be logged in to view transfers.")
      setLoading(false)
      return
    }

    const [
      { data: transfersData, error: transfersError },
      { data: tenantsData, error: tenantsError },
      { data: propertiesData, error: propertiesError },
      { data: unitsData, error: unitsError },
    ] = await Promise.all([
      supabaseClient
        .from("transfers")
        .select(
          "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
        )
        .order("created_at", { ascending: false }),
      supabaseClient
        .from("tenants")
        .select("id, first_name, last_name, property_id, unit_id, status, lease_start, lease_end")
        .order("created_at", { ascending: false }),
      supabaseClient
        .from("properties")
        .select("id, name")
        .order("name"),
      supabaseClient
        .from("units")
        .select("id, unit_number, property_id, status")
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

    const nextTransfers = (transfersData ?? []) as TransferRow[]
    const nextTenants = (tenantsData ?? []) as TenantRow[]
    const nextProperties = (propertiesData ?? []) as PropertyRow[]
    const nextUnits = (unitsData ?? []) as UnitRow[]

    setTransfers(nextTransfers)
    setTenants(nextTenants)
    setProperties(nextProperties)
    setUnits(nextUnits)

    const storedSelectedPropertyId = getStoredSelectedPropertyId()

    if (
      storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
      nextProperties.some((property) => property.id === storedSelectedPropertyId)
    ) {
      setSelectedPropertyId(storedSelectedPropertyId)
      setSelectedToPropertyId(
        storedSelectedPropertyId === ALL_PROPERTIES_VALUE ? "" : storedSelectedPropertyId
      )
    } else if (nextProperties.length > 0) {
      setSelectedPropertyId(nextProperties[0].id)
      setSelectedToPropertyId(nextProperties[0].id)
      setStoredSelectedPropertyId(nextProperties[0].id)
    } else {
      setSelectedPropertyId(ALL_PROPERTIES_VALUE)
      setSelectedToPropertyId("")
      setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadTransfersPage()
  }, [])

  useEffect(() => {
    function handlePropertyChange(e: Event) {
      const customEvent = e as CustomEvent<{ propertyId: string }>
      const newPropertyId = customEvent.detail?.propertyId ?? ALL_PROPERTIES_VALUE

      setSelectedPropertyId(newPropertyId)
      setSelectedTenantId("")
      setSelectedToUnitId("")
      setSelectedToPropertyId(newPropertyId === ALL_PROPERTIES_VALUE ? "" : newPropertyId)
      setRequestedDate("")
      setMoveOutDate("")
      setMoveInDate("")
    }

    window.addEventListener("propertyChanged", handlePropertyChange)

    return () => {
      window.removeEventListener("propertyChanged", handlePropertyChange)
    }
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

  const scopedTenants = useMemo(() => {
    const baseTenants =
      selectedPropertyId === ALL_PROPERTIES_VALUE
        ? tenants
        : tenants.filter((tenant) => tenant.property_id === selectedPropertyId)

    return baseTenants.filter(
      (tenant) => !["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())
    )
  }, [tenants, selectedPropertyId])

  const scopedTransfers = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return transfers
    return transfers.filter((transfer) => transfer.from_property_id === selectedPropertyId)
  }, [transfers, selectedPropertyId])

  const selectedTenant = scopedTenants.find((tenant) => tenant.id === selectedTenantId) ?? null
  const fromUnitId = selectedTenant?.unit_id ?? ""

  const openTransfers = useMemo(() => {
    return scopedTransfers.filter((transfer) =>
      ["requested", "approved", "scheduled"].includes(transfer.status.toLowerCase())
    )
  }, [scopedTransfers])

  const destinationUnits = useMemo<DestinationUnitOption[]>(() => {
    if (!selectedToPropertyId) return []

    return units
      .filter((unit) => {
        const status = (unit.status ?? "").toLowerCase()

        return (
          unit.property_id === selectedToPropertyId &&
          unit.id !== fromUnitId &&
          ["vacant", "make_ready", "notice"].includes(status)
        )
      })
      .filter((unit) => !openTransfers.some((transfer) => transfer.to_unit_id === unit.id))
      .map((unit) => {
        const expectedDate = getExpectedAvailableDate(unit, tenants, transfers)

        let gap: number | null = null

        if (expectedDate && moveInDate) {
          const requested = new Date(moveInDate)
          if (!Number.isNaN(requested.getTime())) {
            gap = Math.round(
              (expectedDate.getTime() - requested.getTime()) / (1000 * 60 * 60 * 24)
            )
          }
        }

        return {
          ...unit,
          expectedDate,
          gap,
          label: getTimingLabel(gap),
        }
      })
      .sort((a, b) => {
        if (a.gap === null && b.gap === null) {
          return a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }
        if (a.gap === null) return 1
        if (b.gap === null) return -1

        const distanceDiff = Math.abs(a.gap) - Math.abs(b.gap)
        if (distanceDiff !== 0) return distanceDiff

        return a.unit_number.localeCompare(b.unit_number, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })
  }, [units, selectedToPropertyId, fromUnitId, openTransfers, tenants, transfers, moveInDate])

  const selectedDestinationUnit =
    destinationUnits.find((unit) => unit.id === selectedToUnitId) ?? null

  const selectedTenantLeaseDays = selectedTenant ? getDaysUntil(selectedTenant.lease_end) : null
  const selectedTenantMoveVsLeaseLabel = selectedTenant
    ? getMoveVsLeaseLabel(moveInDate, selectedTenant.lease_end)
    : "Move timing vs lease unknown"

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return scopedTransfers

    return scopedTransfers.filter(
      (transfer) => transfer.status.toLowerCase() === statusFilter.toLowerCase()
    )
  }, [scopedTransfers, statusFilter])

  const requestedCount = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "requested"
  ).length

  const approvedCount = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "approved"
  ).length

  const completedCount = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "completed"
  ).length

  const pipelineCounts = useMemo(() => {
    const counts = {
      requested: 0,
      approved: 0,
      scheduled: 0,
      completed: 0,
    }

    for (const transfer of scopedTransfers) {
      const stage = getPipelineStage(transfer)
      counts[stage] += 1
    }

    return counts
  }, [scopedTransfers])

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
    return scopedTransfers.filter((transfer) => getPipelineStage(transfer) === "requested").length
  }, [scopedTransfers])

  const approvedNeedingScheduling = useMemo(() => {
    return scopedTransfers.filter((transfer) => getPipelineStage(transfer) === "approved").length
  }, [scopedTransfers])

  const scheduledTransfers = useMemo(() => {
    return scopedTransfers.filter((transfer) => getPipelineStage(transfer) === "scheduled").length
  }, [scopedTransfers])

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

    if (moveOutDate && moveInDate) {
      const gap = getDateDiffInDays(moveOutDate, moveInDate)

      if (gap !== null && gap < 0) {
        setErrorMessage("Move-in date cannot be before move-out date.")
        return
      }
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
      setSelectedToPropertyId(selectedPropertyId === ALL_PROPERTIES_VALUE ? "" : selectedPropertyId)
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Transfers</h1>
          <p className="mt-2 text-zinc-400">
            {selectedProperty
              ? `Coordinate internal resident moves for ${selectedProperty.name}.`
              : "Create and track tenant-requested transfers across your properties."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={selectedPropertyId}
            onChange={(e) => handleSelectedPropertyChange(e.target.value)}
            className="rounded-xl border border-white/10 bg-black px-4 py-2 text-sm text-white"
          >
            <option value={ALL_PROPERTIES_VALUE}>All Properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>
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

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Current transfer scope</p>
        <p className="mt-1 text-lg text-white">
          {selectedProperty ? selectedProperty.name : "All Properties"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Transfers are organized by the tenant’s current property.
        </p>
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
      </div>

      {timingRiskTransfers.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
          <h2 className="text-lg font-semibold text-amber-200">Timing Watchlist</h2>
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

      <div
        id="create-transfer-form"
        className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6"
      >
        <h2 className="mb-1 text-xl font-semibold">Create Transfer Request</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Select the tenant who wants to move, choose the destination, and compare unit timing to the requested move date.
        </p>

        <form onSubmit={handleCreateTransfer} className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Property Context</label>
            <select
              className="w-full rounded bg-black p-2"
              value={selectedPropertyId}
              onChange={(e) => handleSelectedPropertyChange(e.target.value)}
            >
              <option value={ALL_PROPERTIES_VALUE}>All Properties</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Tenant</label>
            <select
              className="w-full rounded bg-black p-2"
              required
              value={selectedTenantId}
              onChange={(e) => {
                const nextTenantId = e.target.value
                setSelectedTenantId(nextTenantId)
                setSelectedToPropertyId(
                  selectedPropertyId === ALL_PROPERTIES_VALUE ? "" : selectedPropertyId
                )
                setSelectedToUnitId("")

                if (nextTenantId) {
                  setDefaultTransferDates()
                } else {
                  setRequestedDate("")
                  setMoveOutDate("")
                  setMoveInDate("")
                }
              }}
            >
              <option value="">Select Tenant</option>
              {scopedTenants.map((tenant) => (
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
              <p className="text-sm font-medium text-amber-200">Selected Tenant Lease Summary</p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Status</p>
                  <p className="mt-1 text-sm text-zinc-100 capitalize">
                    {formatTenantStatus(selectedTenant.status)}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Lease Timing</p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {getLeaseRiskLabel(selectedTenant.lease_end)}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Lease Start</p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {formatDateValue(selectedTenant.lease_start)}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Lease End</p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {formatDateValue(selectedTenant.lease_end)}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Days Until Lease End</p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {selectedTenantLeaseDays === null
                      ? "Unknown"
                      : `${selectedTenantLeaseDays} day(s)`}
                  </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">Move vs Lease</p>
                  <p className="mt-1 text-sm text-zinc-100">
                    {selectedTenantMoveVsLeaseLabel}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Requested Date</label>
            <input
              type="date"
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move Out Date</label>
            <input
              type="date"
              value={moveOutDate}
              onChange={(e) => setMoveOutDate(e.target.value)}
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move In Date</label>
            <input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="w-full rounded bg-black p-2"
            />
          </div>

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
                  Unit {unit.unit_number} — {formatUnitStatus(unit.status)} | Available:{" "}
                  {formatShortDate(unit.expectedDate)} | {unit.label}
                  {unit.gap !== null ? ` (${unit.gap} days)` : ""}
                </option>
              ))}
            </select>
          </div>

          {selectedToPropertyId && destinationUnits.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-medium text-zinc-200">Timing Preview</p>
              <div className="mt-3 space-y-2">
                {destinationUnits.slice(0, 5).map((unit) => (
                  <div
                    key={`${unit.id}-preview`}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                  >
                    Unit {unit.unit_number} • {formatUnitStatus(unit.status)} • Available{" "}
                    {formatShortDate(unit.expectedDate)} • {unit.label}
                    {unit.gap !== null ? ` (${unit.gap} days)` : ""}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selectedDestinationUnit ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="text-sm font-medium text-blue-200">Selected Unit Timing</p>
              <p className="mt-1 text-sm text-zinc-100">
                Unit {selectedDestinationUnit.unit_number} is expected to be available{" "}
                {formatShortDate(selectedDestinationUnit.expectedDate)}.
              </p>
              <p className="mt-1 text-sm text-zinc-100">
                Match: {selectedDestinationUnit.label}
                {selectedDestinationUnit.gap !== null
                  ? ` (${selectedDestinationUnit.gap} days from requested move date)`
                  : ""}
              </p>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for move, tenant request details, timing notes, etc."
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