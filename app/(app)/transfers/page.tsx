"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"
import VacancySavingsCard from "@/components/VacancySavingsCard"
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
  denial_reason?: string | null
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
  expected_vacancy_days_without_transfer: number | null
  expected_vacancy_days_with_transfer: number | null
  vacancy_days_saved: number | null
  estimated_revenue_saved: number | null
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
  monthly_rent?: number | null
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
  if (status === "cancelled") return "cancelled"

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

function normalizeDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatShortDate(date: Date | null) {
  if (!date) return "Unknown"
  return date.toLocaleDateString()
}

function formatDateValue(value?: string | null) {
  if (!value) return "—"

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

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
      ["requested", "approved", "scheduled"].includes(
        (transfer.status ?? "").toLowerCase()
      ) &&
      transfer.move_out_date
  )

  if (relatedOpenTransfer?.move_out_date) {
    const d = new Date(relatedOpenTransfer.move_out_date)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (status === "notice" || status === "occupied") {
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

function getReadableTimingLabel(gap: number | null) {
  if (gap === null) return "Unknown timing"

  if (gap === 0) return "Best fit — ready on move-in date"

  if (gap > 0 && gap <= 2) {
    return `Best fit — ready ${gap} day${gap === 1 ? "" : "s"} after move-in`
  }

  if (gap < 0) {
    const daysEarly = Math.abs(gap)
    return `Ready ${daysEarly} day${daysEarly === 1 ? "" : "s"} early`
  }

  return `Too late — ready ${gap} days after move-in`
}

function getMoveVsLeaseLabel(moveInDate?: string, leaseEnd?: string | null) {
  if (!moveInDate || !leaseEnd) return "Move timing vs lease unknown"

  const diff = getDateDiffInDays(moveInDate, leaseEnd)
  if (diff === null) return "Move timing vs lease unknown"

  if (diff < 0) return `Move is ${Math.abs(diff)} day(s) after lease end`
  if (diff === 0) return "Move is on lease end date"
  return `Move is ${diff} day(s) before lease end`
}

function getTransferDestinationTiming(
  transfer: TransferRow,
  destinationUnit: UnitRow | undefined,
  tenants: TenantRow[],
  transfers: TransferRow[]
) {
  if (!destinationUnit) {
    return {
      expectedDate: null as Date | null,
      gap: null as number | null,
      label: "Unknown timing",
    }
  }

  const expectedDate = getExpectedAvailableDate(destinationUnit, tenants, transfers)

  let gap: number | null = null

  if (expectedDate && transfer.move_in_date) {
    gap = getDateDiffInDays(transfer.move_in_date, expectedDate.toISOString().slice(0, 10))
  }

  let label = "Unknown timing"

  if (gap !== null) {
    if (gap < -14) label = "Available early"
    else if (gap < 0) label = "Available slightly early"
    else if (gap <= 2) label = "Best fit"
    else if (gap <= 7) label = "Slight delay"
    else if (gap <= 14) label = "Delayed"
    else label = "Too late"
  }

  return {
    expectedDate,
    gap,
    label,
  }
}

function getApprovalWarnings(
  transfer: TransferRow,
  tenant: TenantRow | undefined,
  destinationUnit: UnitRow | undefined,
  tenants: TenantRow[],
  transfers: TransferRow[]
) {
  const warnings: string[] = []

  if (tenant?.lease_end && transfer.move_in_date) {
    const diff = getDateDiffInDays(transfer.move_in_date, tenant.lease_end)

    if (diff !== null && diff >= 0 && diff < 30) {
      warnings.push(`Tenant has only ${diff} day(s) remaining on lease at move-in.`)
    } else if (diff !== null && diff < 0) {
      warnings.push(`Move-in happens ${Math.abs(diff)} day(s) after lease end.`)
    }
  }

  if (transfer.move_out_date && transfer.move_in_date) {
    const gap = getDateDiffInDays(transfer.move_out_date, transfer.move_in_date)

    if (gap !== null) {
      if (gap < 0) {
        warnings.push(`Move-in occurs before move-out by ${Math.abs(gap)} day(s).`)
      } else if (gap > 1) {
        warnings.push(`Transfer creates a vacancy gap of ${gap} day(s).`)
      }
    }
  }

  if (!transfer.move_out_date || !transfer.move_in_date) {
    warnings.push("Transfer is missing move-out or move-in date.")
  }

  const destinationTiming = getTransferDestinationTiming(
    transfer,
    destinationUnit,
    tenants,
    transfers
  )

  if (!destinationUnit) {
    warnings.push("Destination unit could not be found.")
  } else if (destinationTiming.label === "Unknown timing") {
    warnings.push(
      `Destination unit timing is unknown for Unit ${destinationUnit.unit_number}.`
    )
  } else if (
    (destinationTiming.label === "Slight delay" ||
      destinationTiming.label === "Too late") &&
    destinationTiming.gap !== null
  ) {
    warnings.push(
      `Destination unit is expected to be ready ${destinationTiming.gap} day(s) after requested move-in.`
    )
  } else if (
    destinationTiming.label === "Available early" &&
    destinationTiming.gap !== null &&
    Math.abs(destinationTiming.gap) > 14
  ) {
    warnings.push(
      `Destination unit is available ${Math.abs(destinationTiming.gap)} day(s) before requested move-in.`
    )
  }

  return warnings
}



function getDestinationOccupant(
  transfer: TransferRow,
  tenants: TenantRow[]
) {
  return tenants.find(
    (tenant) =>
      tenant.unit_id === transfer.to_unit_id &&
      tenant.id !== transfer.tenant_id &&
      !["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())
  )
}

function getTransferTimelineSummary(
  transfer: TransferRow,
  tenants: TenantRow[],
  units: UnitRow[]
) {
  const destinationOccupant = getDestinationOccupant(transfer, tenants)
  const destinationUnit = units.find((unit) => unit.id === transfer.to_unit_id)

  const currentOccupantLeaveDate = transfer.move_out_date || null

  const requestedMoveInDate = transfer.move_in_date || null

  const gapDays =
    currentOccupantLeaveDate && requestedMoveInDate
      ? getDateDiffInDays(currentOccupantLeaveDate, requestedMoveInDate)
      : null

  let resultLabel = "Missing timing"
  let toneClasses = "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
  let detailLabel = "Add move dates to understand whether this handoff works."

  if (gapDays !== null) {
    if (gapDays === 0) {
      resultLabel = "Clean handoff"
      toneClasses = "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      detailLabel = "No vacancy gap. Occupant leaves and incoming tenant moves in the same day."
    } else if (gapDays > 0) {
      resultLabel = `${gapDays} day vacancy gap`
      toneClasses = "border-amber-500/20 bg-amber-500/10 text-amber-300"
      detailLabel = `The unit sits empty for ${gapDays} day(s) before the incoming tenant arrives.`
    } else {
      resultLabel = `${Math.abs(gapDays)} day overlap`
      toneClasses = "border-red-500/20 bg-red-500/10 text-red-300"
      detailLabel = `The incoming tenant wants to move in ${Math.abs(gapDays)} day(s) before the destination unit is actually available.`
    }
  }

  return {
    destinationOccupant,
    destinationUnit,
    currentOccupantLeaveDate,
    requestedMoveInDate,
    gapDays,
    resultLabel,
    toneClasses,
    detailLabel,
  }
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
  const [confirmApproveTransfer, setConfirmApproveTransfer] = useState<TransferRow | null>(null)
  const [denyReasonByTransfer, setDenyReasonByTransfer] = useState<Record<string, string>>({})

  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  function clearMessages() {
    setErrorMessage("")
    setSuccessMessage("")
  }

  function scrollToTransferList() {
    setTimeout(() => {
      document.getElementById("transfer-list-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 50)
  }

  function handlePipelineFilter(nextFilter: string) {
    setStatusFilter(nextFilter)
    scrollToTransferList()
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

  function handleDestinationUnitChange(unitId: string) {
    setSelectedToUnitId(unitId)
    clearMessages()

    const selectedUnit = destinationUnits.find((unit) => unit.id === unitId)

    if (!selectedUnit?.expectedDate) return

    const expectedDate = normalizeDateOnly(selectedUnit.expectedDate)

    if (!moveInDate) {
      setMoveInDate(formatDateForInput(expectedDate))
      setSuccessMessage(
        `Move-in date set to ${formatShortDate(expectedDate)} because that is when Unit ${selectedUnit.unit_number} is available.`
      )
      return
    }

    const currentMoveInDate = normalizeDateOnly(new Date(moveInDate))

    if (Number.isNaN(currentMoveInDate.getTime())) return

    if (currentMoveInDate < expectedDate) {
      setMoveInDate(formatDateForInput(expectedDate))
      setSuccessMessage(
        `Move-in date updated to ${formatShortDate(expectedDate)} because Unit ${selectedUnit.unit_number} is not available before then.`
      )
    }
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
      data: { session },
    } = await supabaseClient.auth.getSession()

    if (!session) {
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
          "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, denial_reason, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id, expected_vacancy_days_without_transfer, expected_vacancy_days_with_transfer, vacancy_days_saved, estimated_revenue_saved"
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
        .select("id, unit_number, property_id, status, monthly_rent")
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
    return transfers.filter(
      (transfer) =>
        transfer.from_property_id === selectedPropertyId ||
        transfer.to_property_id === selectedPropertyId
    )
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
        const aBest = a.gap !== null && Math.abs(a.gap) <= 2
        const bBest = b.gap !== null && Math.abs(b.gap) <= 2

        if (aBest && !bBest) return -1
        if (!aBest && bBest) return 1

        if (a.gap !== null && b.gap !== null) {
          if (a.gap < 0 && b.gap < 0) return Math.abs(a.gap) - Math.abs(b.gap)
          if (a.gap < 0) return -1
          if (b.gap < 0) return 1

          if (a.gap > 0 && b.gap > 0) return a.gap - b.gap
        }

        if (a.gap === null && b.gap !== null) return 1
        if (a.gap !== null && b.gap === null) return -1

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
      (transfer) => getPipelineStage(transfer).toLowerCase() === statusFilter.toLowerCase()
    )
  }, [scopedTransfers, statusFilter])

  const requestedCount = scopedTransfers.filter(
    (transfer) => getPipelineStage(transfer) === "requested"
  ).length

  const approvedCount = scopedTransfers.filter(
    (transfer) => getPipelineStage(transfer) === "approved"
  ).length

  const scheduledCount = scopedTransfers.filter(
    (transfer) => getPipelineStage(transfer) === "scheduled"
  ).length

  const completedCount = scopedTransfers.filter(
    (transfer) => getPipelineStage(transfer) === "completed"
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

      if (stage === "requested" || stage === "approved" || stage === "scheduled" || stage === "completed") {
        counts[stage] += 1
      }
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


  const liveAttentionItems = useMemo(() => {
    const items: Array<{
      id: string
      level: "high" | "pending" | "risk"
      title: string
      subtitle: string
      actionLabel: string
      actionFilter: string
    }> = []

    const requestedOpenCount = openTransfers.filter(
      (transfer) => getPipelineStage(transfer) === "requested"
    ).length

    const approvedOpenCount = openTransfers.filter(
      (transfer) => getPipelineStage(transfer) === "approved"
    ).length

    const activeRiskCount = openTransfers.filter((transfer) => {
      const timeline = getTransferTimelineSummary(transfer, tenants, units)
      return timeline.gapDays === null || (timeline.gapDays !== null && timeline.gapDays !== 0)
    }).length

    if (requestedOpenCount > 0) {
      items.push({
        id: "needs-approval",
        level: "high",
        title: `${requestedOpenCount} transfer${requestedOpenCount === 1 ? "" : "s"} need approval`,
        subtitle: "These requests are waiting on a decision.",
        actionLabel: "Review requested",
        actionFilter: "requested",
      })
    }

    if (approvedOpenCount > 0) {
      items.push({
        id: "needs-completion",
        level: "pending",
        title: `${approvedOpenCount} approved transfer${approvedOpenCount === 1 ? "" : "s"} still need completion`,
        subtitle: "These moves are approved but not yet finished in the system.",
        actionLabel: "Review approved",
        actionFilter: "approved",
      })
    }

    if (activeRiskCount > 0) {
      items.push({
        id: "active-risk",
        level: "risk",
        title: `${activeRiskCount} active transfer${activeRiskCount === 1 ? "" : "s"} have timing issues`,
        subtitle: "These open transfers create a gap, overlap, or missing-date problem.",
        actionLabel: "Review risk",
        actionFilter: "all",
      })
    }

    if (items.length === 0) {
      items.push({
        id: "clear",
        level: "pending",
        title: "No active transfer issues right now",
        subtitle: "There are no open transfers that need attention in this scope.",
        actionLabel: "View all",
        actionFilter: "all",
      })
    }

    return items
  }, [openTransfers, tenants, units])

  const timelineCards = useMemo(() => {
    return openTransfers.map((transfer) => {
      const tenant = tenantMap.get(transfer.tenant_id)
      const fromProperty = propertyMap.get(transfer.from_property_id)
      const toProperty = propertyMap.get(transfer.to_property_id)
      const fromUnit = unitMap.get(transfer.from_unit_id)
      const timeline = getTransferTimelineSummary(transfer, tenants, units)

      return {
        transfer,
        tenant,
        fromProperty,
        toProperty,
        fromUnit,
        ...timeline,
      }
    })
  }, [openTransfers, propertyMap, tenantMap, tenants, unitMap, units])

  const transferHistoryCards = useMemo(() => {
    return scopedTransfers
      .filter((transfer) => ["completed", "cancelled"].includes((transfer.status ?? "").toLowerCase()))
      .slice(0, 6)
      .map((transfer) => {
        const tenant = tenantMap.get(transfer.tenant_id)
        const fromProperty = propertyMap.get(transfer.from_property_id)
        const toProperty = propertyMap.get(transfer.to_property_id)
        const fromUnit = unitMap.get(transfer.from_unit_id)
        const toUnit = unitMap.get(transfer.to_unit_id)

        return {
          transfer,
          tenant,
          fromProperty,
          toProperty,
          fromUnit,
          toUnit,
        }
      })
  }, [propertyMap, scopedTransfers, tenantMap, unitMap])


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
      setStatusFilter("requested")
      scrollToTransferList()
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
      setStatusFilter("approved")
      scrollToTransferList()
    } catch {
      setErrorMessage("Failed to approve transfer.")
      setActionLoadingId("")
    }
  }

  async function handleDenyTransfer(transferId: string) {
    clearMessages()
    setActionLoadingId(transferId)

    try {
      const response = await fetch("/api/transfers/deny", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transfer_id: transferId,
          denial_reason: denyReasonByTransfer[transferId] || "Not specified",
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to deny transfer.")
        setActionLoadingId("")
        return
      }

      setActionLoadingId("")
      setSuccessMessage("Transfer denied.")
      setDenyReasonByTransfer((prev) => {
        const next = { ...prev }
        delete next[transferId]
        return next
      })
      await loadTransfersPage()
      setStatusFilter("all")
      scrollToTransferList()
    } catch {
      setErrorMessage("Failed to deny transfer.")
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
      setStatusFilter("completed")
      scrollToTransferList()
    } catch {
      setErrorMessage("Failed to complete transfer.")
      setActionLoadingId("")
    }
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

      {loading ? <p className="mt-4 text-zinc-400">Loading transfers...</p> : null}

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
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
          Transfers are visible by current scope. Cross-property transfers appear in either related property.
        </p>
      </div>

      <div className="mt-8 border-t border-white/10 pt-8">
        <h1 className="text-5xl font-semibold tracking-tight text-white">
          What moves need my attention?
        </h1>
        <p className="mt-3 text-xl text-zinc-400">
          Live transfer decisions only. Resolved history stays out of this section.
        </p>

        <div className="mt-8 space-y-8">
          {liveAttentionItems.map((item, index) => {
            const toneClasses =
              item.level === "high"
                ? "text-violet-300 border-violet-500/20 bg-violet-500/10"
                : item.level === "pending"
                  ? "text-blue-300 border-blue-500/20 bg-blue-500/10"
                  : "text-red-300 border-red-500/20 bg-red-500/10"

            return (
              <div
                key={item.id}
                className={`grid grid-cols-[72px_1fr_auto] items-center gap-6 border-b border-white/10 pb-8 ${
                  index === 0 ? "border-t pt-8" : ""
                }`}
              >
                <div className="text-6xl font-semibold tracking-tight text-white">
                  {index + 1}
                </div>

                <div>
                  <div className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${toneClasses}`}>
                    {item.level === "high"
                      ? "Needs approval"
                      : item.level === "pending"
                        ? "Needs completion"
                        : "At risk"}
                  </div>

                  <h2 className="mt-4 text-3xl font-medium tracking-tight text-white">
                    {item.title}
                  </h2>

                  <p className="mt-2 text-zinc-400">{item.subtitle}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handlePipelineFilter(item.actionFilter)}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
                >
                  {item.actionLabel} →
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Open transfer timelines</h2>
            <p className="mt-2 text-sm text-zinc-400">
              See who is leaving, when the destination unit opens, and whether the incoming move actually lines up.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handlePipelineFilter("all")}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
          >
            Show all open transfers
          </button>
        </div>

        <div className="mt-8 space-y-8">
          {timelineCards.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-zinc-400">
              No open transfers right now.
            </div>
          ) : (
            timelineCards.map((card, index) => (
              <div
                key={card.transfer.id}
                className={`grid grid-cols-[72px_1fr] gap-6 border-b border-white/10 pb-8 ${
                  index === 0 ? "border-t pt-8" : ""
                }`}
              >
                <div className="text-6xl font-semibold tracking-tight text-white">
                  {index + 1}
                </div>

                <div>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-3xl font-medium tracking-tight text-white">
                        {card.tenant ? `${card.tenant.first_name} ${card.tenant.last_name}` : "Unknown Tenant"}
                      </h3>
                      <p className="mt-2 text-zinc-400">
                        {card.fromProperty?.name ?? "Unknown Property"} Unit {card.fromUnit?.unit_number ?? "?"}
                        {" "}→{" "}
                        {card.toProperty?.name ?? "Unknown Property"} Unit {card.destinationUnit?.unit_number ?? "?"}
                      </p>
                    </div>

                    <span className={`rounded-full border px-3 py-1 text-sm capitalize ${getTransferStatusClasses(card.transfer.status)}`}>
                      {card.transfer.status}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Destination unit now</p>
                      <p className="mt-3 text-lg text-white">
                        {card.destinationOccupant
                          ? `${card.destinationOccupant.first_name} ${card.destinationOccupant.last_name}`
                          : "No active occupant"}
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">
                        Leaves: {formatDateValue(card.currentOccupantLeaveDate)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Incoming move</p>
                      <p className="mt-3 text-lg text-white">
                        {formatDateValue(card.requestedMoveInDate)}
                      </p>
                      <p className="mt-2 text-sm text-zinc-400">
                        Requested by incoming tenant
                      </p>
                    </div>

                    <div className={`rounded-xl border p-4 ${card.toneClasses}`}>
                      <p className="text-xs uppercase tracking-[0.2em] opacity-80">Result</p>
                      <p className="mt-3 text-lg font-medium">
                        {card.resultLabel}
                      </p>
                      <p className="mt-2 text-sm opacity-80">
                        {card.detailLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <VacancySavingsCard
                      saved={card.transfer.vacancy_days_saved}
                      revenue={card.transfer.estimated_revenue_saved}
                      rent={card.destinationUnit?.monthly_rent ?? null}
                    />
                  </div>

                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Timeline</p>
                    <div className="mt-3 flex items-center gap-3 text-sm text-zinc-300">
                      <span>{formatDateValue(card.currentOccupantLeaveDate)}</span>
                      <div className="h-px flex-1 bg-white/15" />
                      <span>{formatDateValue(card.requestedMoveInDate)}</span>
                    </div>
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
          <button
            type="button"
            onClick={() => handlePipelineFilter("requested")}
            className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-left hover:bg-amber-500/15"
          >
            <p className="text-sm text-amber-200">Requested</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.requested}</p>
            <p className="mt-2 text-xs text-amber-100/80">
              {transfersRequiringReview === 0 ? "No requests waiting" : "Review requests"}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handlePipelineFilter("approved")}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-left hover:bg-emerald-500/15"
          >
            <p className="text-sm text-emerald-200">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.approved}</p>
            <p className="mt-2 text-xs text-emerald-100/80">
              {approvedNeedingScheduling === 0 ? "Nothing approved" : "Schedule moves"}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handlePipelineFilter("scheduled")}
            className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-left hover:bg-blue-500/15"
          >
            <p className="text-sm text-blue-200">Scheduled</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.scheduled}</p>
            <p className="mt-2 text-xs text-blue-100/80">
              {scheduledTransfers === 0 ? "Nothing scheduled" : "View timing"}
            </p>
          </button>

          <button
            type="button"
            onClick={() => handlePipelineFilter("completed")}
            className="rounded-xl border border-zinc-500/20 bg-zinc-500/10 p-4 text-left hover:bg-zinc-500/15"
          >
            <p className="text-sm text-zinc-200">Completed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{pipelineCounts.completed}</p>
            <p className="mt-2 text-xs text-zinc-300/80">View history</p>
          </button>
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
        id="transfer-list-section"
        className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5"
      >
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
            All ({scopedTransfers.length})
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
            onClick={() => setStatusFilter("scheduled")}
            className={`rounded-full border px-4 py-2 text-sm ${
              statusFilter === "scheduled"
                ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            Scheduled ({scheduledCount})
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

        <div className="mt-6 space-y-4">
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
                className="rounded-xl border border-zinc-800 bg-black/30 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-medium">
                      {tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown Tenant"}
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
                                : stage === "completed"
                                  ? "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
                                  : "border-red-500/20 bg-red-500/10 text-red-300"
                        }`}
                      >
                        {stage === "requested"
                          ? "Review needed"
                          : stage === "approved"
                            ? "Ready to schedule"
                            : stage === "scheduled"
                              ? "Move timing set"
                              : stage === "completed"
                                ? "Completed"
                                : "Denied"}
                      </span>
                    </div>

                    {transfer.notes ? (
                      <p className="mt-3 text-sm text-zinc-400">{transfer.notes}</p>
                    ) : null}

                    {transfer.status.toLowerCase() === "cancelled" && transfer.denial_reason ? (
                      <p className="mt-2 text-sm text-red-300">
                        Denial reason: {transfer.denial_reason}
                      </p>
                    ) : null}

                    <div className="mt-4 max-w-xl">
                      <VacancySavingsCard
                        saved={transfer.vacancy_days_saved}
                        revenue={transfer.estimated_revenue_saved}
                        rent={toUnit?.monthly_rent ?? null}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div
                      className={`rounded-full border px-3 py-1 text-sm capitalize ${getTransferStatusClasses(
                        transfer.status
                      )}`}
                    >
                      {transfer.status}
                    </div>

                    {transfer.status.toLowerCase() === "requested" ? (
                      <div className="flex flex-col items-end gap-2">
                        <select
                          value={denyReasonByTransfer[transfer.id] ?? ""}
                          onChange={(e) =>
                            setDenyReasonByTransfer((prev) => ({
                              ...prev,
                              [transfer.id]: e.target.value,
                            }))
                          }
                          className="rounded bg-black p-2 text-sm text-white"
                        >
                          <option value="">Select denial reason</option>
                          <option value="Timing mismatch">Timing mismatch</option>
                          <option value="Unit not available / not ready">
                            Unit not available / not ready
                          </option>
                          <option value="Better unit option available">
                            Better unit option available
                          </option>
                          <option value="Tenant changed mind">Tenant changed mind</option>
                          <option value="Lease conflict / too little time remaining">
                            Lease conflict / too little time remaining
                          </option>
                          <option value="Financial / pricing issue">Financial / pricing issue</option>
                          <option value="Operational conflict">Operational conflict</option>
                          <option value="Other">Other</option>
                        </select>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDenyTransfer(transfer.id)}
                            disabled={actionLoadingId === transfer.id}
                            className="rounded bg-red-600 px-3 py-2 text-sm hover:bg-red-700 disabled:opacity-60"
                          >
                            {actionLoadingId === transfer.id ? "Denying..." : "Deny Transfer"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmApproveTransfer(transfer)}
                            disabled={actionLoadingId === transfer.id}
                            className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actionLoadingId === transfer.id ? "Approving..." : "Approve Transfer"}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {transfer.status.toLowerCase() === "approved" ? (
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
            <div className="rounded-xl border border-zinc-800 bg-black/30 p-5 text-zinc-400">
              No transfers found for this filter.
            </div>
          ) : null}
        </div>
      </div>


      <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Resolved history</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Completed and cancelled transfers stay here so the live attention sections only show active work.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {transferHistoryCards.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-zinc-400">
              No resolved transfer history yet.
            </div>
          ) : (
            transferHistoryCards.map((card) => (
              <div
                key={card.transfer.id}
                className="rounded-xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-medium text-white">
                      {card.tenant ? `${card.tenant.first_name} ${card.tenant.last_name}` : "Unknown Tenant"}
                    </h3>
                    <p className="mt-2 text-zinc-400">
                      {card.fromProperty?.name ?? "Unknown Property"} Unit {card.fromUnit?.unit_number ?? "?"}
                      {" "}→{" "}
                      {card.toProperty?.name ?? "Unknown Property"} Unit {card.toUnit?.unit_number ?? "?"}
                    </p>
                  </div>

                  <span className={`rounded-full border px-3 py-1 text-sm capitalize ${getTransferStatusClasses(card.transfer.status)}`}>
                    {card.transfer.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    Requested: {formatDateValue(card.transfer.requested_date)}
                  </span>
                  {card.transfer.approved_date ? (
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      Approved: {formatDateValue(card.transfer.approved_date)}
                    </span>
                  ) : null}
                  {card.transfer.move_in_date ? (
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                      Move in: {formatDateValue(card.transfer.move_in_date)}
                    </span>
                  ) : null}
                </div>

                {card.transfer.status.toLowerCase() === "cancelled" && card.transfer.denial_reason ? (
                  <p className="mt-4 text-sm text-red-300">
                    Denial reason: {card.transfer.denial_reason}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

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
              onChange={(e) => handleDestinationUnitChange(e.target.value)}
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
                <option
                  key={unit.id}
                  value={unit.id}
                >
                  Unit {unit.unit_number} — {formatUnitStatus(unit.status)} | Available:{" "}
                  {formatShortDate(unit.expectedDate)} | {getReadableTimingLabel(unit.gap)}
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
                    {formatShortDate(unit.expectedDate)} • {getReadableTimingLabel(unit.gap)}
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
                Match: {getReadableTimingLabel(selectedDestinationUnit.gap)}
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

      {confirmApproveTransfer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">Confirm Approval</h2>

            <p className="mt-2 text-sm text-zinc-400">
              Review potential risks before approving this transfer.
            </p>

            {(() => {
              const tenant = tenantMap.get(confirmApproveTransfer.tenant_id)
              const destinationUnit = unitMap.get(confirmApproveTransfer.to_unit_id)
              const destinationTiming = getTransferDestinationTiming(
                confirmApproveTransfer,
                destinationUnit,
                tenants,
                transfers
              )
              const warnings = getApprovalWarnings(
                confirmApproveTransfer,
                tenant,
                destinationUnit,
                tenants,
                transfers
              )

              return (
                <>
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-200">
                    <p>
                      Destination unit:{" "}
                      {destinationUnit ? `Unit ${destinationUnit.unit_number}` : "Unknown"}
                    </p>
                    <p className="mt-1">
                      Expected available: {formatShortDate(destinationTiming.expectedDate)}
                    </p>
                    <p className="mt-1">
                      Timing label: {destinationTiming.label}
                      {destinationTiming.gap !== null ? ` (${destinationTiming.gap} days)` : ""}
                    </p>
                  </div>

                  <div className="mt-4">
                    <VacancySavingsCard
                      saved={confirmApproveTransfer.vacancy_days_saved}
                      revenue={confirmApproveTransfer.estimated_revenue_saved}
                      rent={destinationUnit?.monthly_rent ?? null}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {warnings.length === 0 ? (
                      <p className="text-sm text-emerald-300">
                        No major timing risks detected.
                      </p>
                    ) : (
                      warnings.map((warning, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
                        >
                          {warning}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )
            })()}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmApproveTransfer(null)}
                className="rounded bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  const id = confirmApproveTransfer.id
                  setConfirmApproveTransfer(null)
                  await handleApproveTransfer(id)
                }}
                className="rounded bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-700"
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}