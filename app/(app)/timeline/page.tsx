"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"

type PropertyRow = {
  id: string
  name: string
  default_monthly_rent?: number | null
  turnover_days?: number | null
  expected_vacancy_days?: number | null
  allow_same_day_transfer?: boolean | null
  auto_block_invalid_transfers?: boolean | null
  grace_buffer_days?: number | null
  daily_rent_mode?: string | null
  vacancy_loss_multiplier?: number | null
  turnover_cost_per_unit?: number | null
  auto_mark_notice_days?: number | null
  auto_status_updates?: boolean | null
  require_approval?: boolean | null
  allow_cross_property_transfers?: boolean | null
  minimum_notice_days?: number | null
  transfer_readiness_mode?: string | null
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status?: string | null
  monthly_rent?: number | null
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  unit_id: string
  property_id: string
  status?: string | null
  lease_end?: string | null
}

type TransferRow = {
  id: string
  status: string
  from_unit_id: string
  to_unit_id: string
  move_out_date: string | null
  move_in_date: string | null
  vacancy_days_saved?: number | null
  estimated_revenue_saved?: number | null
}

type TransferEvent = {
  id: string
  type: "out" | "in" | "gap" | "turn" | "conflict"
  label: string
  title: string
  className: string
  transfer: TransferRow
  gapDays: number | null
  revenueValue: number | null
}


type CalendarCell = {
  label: string
  title: string
  className: string
  transfer: TransferRow | null
  events: TransferEvent[]
  hasConflict: boolean
}


type SelectedCell = {
  unit: UnitRow
  date: Date
  label: string
  title: string
  transfer: TransferRow | null
  events: TransferEvent[]
  hasConflict: boolean
}


const TRANSFER_STATUSES_TO_SHOW = ["requested", "approved", "scheduled", "completed"]

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return normalizeDate(date)
}

function getDaysInMonth(year: number, month: number) {
  const days: Date[] = []
  const date = new Date(year, month, 1)

  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }

  return days
}

function isSameDate(value: string | null | undefined, date: Date) {
  const parsed = parseDate(value)
  if (!parsed) return false

  return dateKey(parsed) === dateKey(date)
}

function getMonthName(month: number) {
  return new Date(2026, month, 1).toLocaleDateString(undefined, {
    month: "long",
  })
}

function daysBetween(start: Date, end: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay))
}

function formatDateForDisplay(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateValue(value?: string | null) {
  const parsed = parseDate(value)

  if (!parsed) return "—"

  return parsed.toLocaleDateString()
}

function getTransferStatusLabel(status?: string | null) {
  if (!status) return "Transfer"
  return status.replaceAll("_", " ")
}

function getTransferStatusClasses(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "requested":
      return "bg-amber-500/25 text-amber-200 border-amber-500/40"
    case "approved":
      return "bg-emerald-500/25 text-emerald-200 border-emerald-500/40"
    case "scheduled":
      return "bg-blue-500/25 text-blue-200 border-blue-500/40"
    case "completed":
      return "bg-zinc-500/25 text-zinc-200 border-zinc-500/40"
    default:
      return "bg-white/[0.03] text-zinc-600 border-white/5"
  }
}

function getTransferEventClasses(type: TransferEvent["type"], status?: string | null) {
  if (type === "out") return "bg-orange-500/25 text-orange-200 border-orange-500/40"
  if (type === "in") return getTransferStatusClasses(status)
  if (type === "turn") return "bg-violet-500/20 text-violet-200 border-violet-500/30"
  if (type === "gap") return "bg-blue-500/20 text-blue-200 border-blue-500/30"
  return "bg-red-500/25 text-red-200 border-red-500/40"
}

function getGapEventClasses(gapDays?: number | null) {
  if (gapDays !== null && gapDays !== undefined && gapDays >= 7) {
    return "bg-red-500/25 text-red-200 border-red-500/40"
  }

  if (gapDays !== null && gapDays !== undefined && gapDays >= 3) {
    return "bg-amber-500/25 text-amber-200 border-amber-500/40"
  }

  return "bg-blue-500/20 text-blue-200 border-blue-500/30"
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return normalizeDate(next)
}

function getDailyRent(unit: UnitRow, property: PropertyRow | null, date: Date) {
  const rent = unit.monthly_rent ?? property?.default_monthly_rent ?? 1500
  const mode = property?.daily_rent_mode ?? "monthly_30"

  if (mode === "actual_days") {
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    return rent / daysInMonth
  }

  return rent / 30
}

function getTransferGapDays(transfer: TransferRow) {
  const moveOut = parseDate(transfer.move_out_date)
  const moveIn = parseDate(transfer.move_in_date)

  if (!moveOut || !moveIn) return null

  return daysBetween(moveOut, moveIn)
}

function getTransferRevenueValue(unit: UnitRow, transfer: TransferRow, property: PropertyRow | null) {
  if (transfer.estimated_revenue_saved !== null && transfer.estimated_revenue_saved !== undefined) {
    return transfer.estimated_revenue_saved
  }

  const gapDays = getTransferGapDays(transfer)
  if (gapDays === null || gapDays <= 0) return null

  const moveIn = parseDate(transfer.move_in_date) ?? new Date()
  const dailyRent = getDailyRent(unit, property, moveIn)
  const multiplier = property?.vacancy_loss_multiplier ?? 1
  return Math.round(gapDays * dailyRent * multiplier)
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `$${Math.round(value).toLocaleString()}`
}


export default function TimelinePage() {
  const currentDate = new Date()

  const [loading, setLoading] = useState(true)
  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth())
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])

  async function loadData() {
    setLoading(true)

    const [
      { data: propertiesData, error: propertiesError },
      { data: unitsData, error: unitsError },
      { data: tenantsData, error: tenantsError },
      { data: transfersData, error: transfersError },
    ] = await Promise.all([
      supabaseClient
        .from("properties")
        .select(
          "id, name, default_monthly_rent, turnover_days, expected_vacancy_days, allow_same_day_transfer, auto_block_invalid_transfers, grace_buffer_days, daily_rent_mode, vacancy_loss_multiplier, turnover_cost_per_unit, auto_mark_notice_days, auto_status_updates, require_approval, allow_cross_property_transfers, minimum_notice_days, transfer_readiness_mode"
        )
        .order("name"),
      supabaseClient
        .from("units")
        .select("id, unit_number, property_id, status, monthly_rent")
        .order("unit_number"),
      supabaseClient
        .from("tenants")
        .select("id, first_name, last_name, unit_id, property_id, status, lease_end"),
      supabaseClient
        .from("transfers")
        .select("id, status, from_unit_id, to_unit_id, move_out_date, move_in_date, vacancy_days_saved, estimated_revenue_saved")
        .in("status", TRANSFER_STATUSES_TO_SHOW),
    ])

    if (propertiesError || unitsError || tenantsError || transfersError) {
      console.error({
        propertiesError,
        unitsError,
        tenantsError,
        transfersError,
      })
      setLoading(false)
      return
    }

    const nextProperties = (propertiesData ?? []) as PropertyRow[]

    setProperties(nextProperties)
    setUnits((unitsData ?? []) as UnitRow[])
    setTenants((tenantsData ?? []) as TenantRow[])
    setTransfers((transfersData ?? []) as TransferRow[])

    if (!selectedPropertyId && nextProperties.length > 0) {
      setSelectedPropertyId(nextProperties[0].id)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId
  )

  const days = useMemo(
    () => getDaysInMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  const years = useMemo(() => {
    const start = currentDate.getFullYear()
    return Array.from({ length: 6 }, (_, index) => start + index)
  }, [currentDate])

  const visibleUnits = useMemo(() => {
    if (!selectedPropertyId) return []
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const visibleTenants = useMemo(() => {
    if (!selectedPropertyId) return []
    return tenants.filter((tenant) => tenant.property_id === selectedPropertyId)
  }, [tenants, selectedPropertyId])

  const visibleUnitIds = useMemo(() => {
    return new Set(visibleUnits.map((unit) => unit.id))
  }, [visibleUnits])

  const visibleTransfers = useMemo(() => {
    return transfers.filter(
      (transfer) =>
        visibleUnitIds.has(transfer.from_unit_id) ||
        visibleUnitIds.has(transfer.to_unit_id)
    )
  }, [transfers, visibleUnitIds])

  function getActiveTenantForUnit(unitId: string) {
    return tenants.find(
      (tenant) =>
        tenant.unit_id === unitId &&
        !["moved_out", "transferred"].includes(
          (tenant.status ?? "").toLowerCase()
        )
    )
  }

  function getIncomingTransferForDate(unitId: string, day: Date) {
    return visibleTransfers.find(
      (transfer) =>
        transfer.to_unit_id === unitId &&
        isSameDate(transfer.move_in_date, day)
    )
  }

  function getOutgoingTransferForDate(unitId: string, day: Date) {
    return visibleTransfers.find(
      (transfer) =>
        transfer.from_unit_id === unitId &&
        isSameDate(transfer.move_out_date, day)
    )
  }

  function getLatestOutgoingTransferBeforeOrOn(unitId: string, day: Date) {
    return visibleTransfers
      .filter((transfer) => transfer.from_unit_id === unitId && transfer.move_out_date)
      .map((transfer) => ({
        transfer,
        date: parseDate(transfer.move_out_date),
      }))
      .filter((item): item is { transfer: TransferRow; date: Date } => {
        return item.date !== null && item.date <= day
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0]
  }

  function getEarliestIncomingTransferAfter(unitId: string, day: Date) {
    return visibleTransfers
      .filter((transfer) => transfer.to_unit_id === unitId && transfer.move_in_date)
      .map((transfer) => ({
        transfer,
        date: parseDate(transfer.move_in_date),
      }))
      .filter((item): item is { transfer: TransferRow; date: Date } => {
        return item.date !== null && item.date >= day
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  }

  function getIncomingTransferBeforeOrOn(unitId: string, day: Date) {
    return visibleTransfers
      .filter((transfer) => transfer.to_unit_id === unitId && transfer.move_in_date)
      .map((transfer) => ({
        transfer,
        date: parseDate(transfer.move_in_date),
      }))
      .filter((item): item is { transfer: TransferRow; date: Date } => {
        return item.date !== null && item.date <= day
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0]
  }

  function getCell(unit: UnitRow, dayValue: Date): CalendarCell {
    const day = normalizeDate(dayValue)
    const tenant = getActiveTenantForUnit(unit.id)
    const status = (unit.status ?? "").toLowerCase()
    const events: TransferEvent[] = []

    const unitTransfers = visibleTransfers.filter(
      (transfer) => transfer.from_unit_id === unit.id || transfer.to_unit_id === unit.id
    )

    for (const transfer of unitTransfers) {
      const moveOut = parseDate(transfer.move_out_date)
      const moveIn = parseDate(transfer.move_in_date)
      const gapDays = getTransferGapDays(transfer)
      const revenueValue = getTransferRevenueValue(unit, transfer, selectedProperty ?? null)

      if (transfer.from_unit_id === unit.id && moveOut && dateKey(moveOut) === dateKey(day)) {
        events.push({
          id: `${transfer.id}-out`,
          type: "out",
          label: "Out",
          title: `${getTransferStatusLabel(transfer.status)} transfer move-out`,
          className: getTransferEventClasses("out", transfer.status),
          transfer,
          gapDays,
          revenueValue,
        })
      }

      if (transfer.to_unit_id === unit.id && moveOut && moveIn) {
        const turnoverDays = selectedProperty?.turnover_days ?? 2
        // Move-out day is day 0. If turnover is 2 full days, earliest move-in is move_out + 3.
        const readyDate = addDays(moveOut, turnoverDays + 1)

        if (day >= moveOut && day <= moveIn) {
          const isMoveOut = dateKey(day) === dateKey(moveOut)
          const isMoveIn = dateKey(day) === dateKey(moveIn)
          const isBeforeReady = day > moveOut && day < readyDate

          if (isMoveOut) {
            events.push({
              id: `${transfer.id}-destination-out-${dateKey(day)}`,
              type: "out",
              label: "Out",
              title: `${getTransferStatusLabel(transfer.status)} destination turnover starts`,
              className: getTransferEventClasses("out", transfer.status),
              transfer,
              gapDays,
              revenueValue,
            })
          } else if (isMoveIn) {
            const impossibleTiming = moveIn < readyDate

            events.push({
              id: `${transfer.id}-in`,
              type: impossibleTiming ? "conflict" : "in",
              label: impossibleTiming
                ? "Too Soon"
                : revenueValue
                  ? `In ${formatMoney(revenueValue)}`
                  : "In",
              title: impossibleTiming
                ? `Move-in is before ${turnoverDays} turnover day(s) are complete`
                : `${getTransferStatusLabel(transfer.status)} transfer move-in`,
              className: getTransferEventClasses(impossibleTiming ? "conflict" : "in", transfer.status),
              transfer,
              gapDays,
              revenueValue,
            })
          } else if (isBeforeReady) {
            events.push({
              id: `${transfer.id}-turn-${dateKey(day)}`,
              type: "turn",
              label: "Turn",
              title: `${turnoverDays} turnover day(s) required before this unit is ready. Earliest ready date: ${formatDateValue(dateKey(readyDate))}`,
              className: getTransferEventClasses("turn", transfer.status),
              transfer,
              gapDays,
              revenueValue,
            })
          } else {
            events.push({
              id: `${transfer.id}-gap-${dateKey(day)}`,
              type: "gap",
              label: revenueValue ? formatMoney(revenueValue) : `${gapDays ?? ""}d`,
              title: gapDays !== null
                ? `${gapDays} day gap between move-out and move-in after turnover rules`
                : "Vacancy gap between transfer move-out and move-in",
              className: getGapEventClasses(gapDays),
              transfer,
              gapDays,
              revenueValue,
            })
          }
        }
      }
    }

    const incomingToday = events.filter((event) => event.type === "in")
    const hasConflict = incomingToday.length > 1

    if (hasConflict && incomingToday[0]) {
      events.push({
        id: `conflict-${unit.id}-${dateKey(day)}`,
        type: "conflict",
        label: "Conflict",
        title: "Multiple transfers target this unit on the same date",
        className: getTransferEventClasses("conflict"),
        transfer: incomingToday[0].transfer,
        gapDays: null,
        revenueValue: null,
      })
    }

    if (events.length > 0) {
      const primary = events[0]
      return {
        label: primary.label,
        title: hasConflict ? "Transfer conflict detected" : primary.title,
        transfer: primary.transfer,
        events,
        hasConflict,
        className: hasConflict ? getTransferEventClasses("conflict") : primary.className,
      }
    }

    const leaseEndDate = parseDate(tenant?.lease_end)

    if (leaseEndDate && dateKey(leaseEndDate) === dateKey(day)) {
      return {
        label: "End",
        title: "Lease ends",
        transfer: null,
        events: [],
        hasConflict: false,
        className: "bg-amber-500/25 text-amber-200 border-amber-500/40",
      }
    }

    const futureIncoming = getEarliestIncomingTransferAfter(unit.id, day)

    if (leaseEndDate && day > leaseEndDate) {
      const turnoverEndDate = new Date(leaseEndDate)
      turnoverEndDate.setDate(turnoverEndDate.getDate() + 2)

      if (day <= turnoverEndDate) {
        return {
          label: "Turn",
          title: "Projected turnover after move-out",
          transfer: null,
          events: [],
          hasConflict: false,
          className: "bg-violet-500/15 text-violet-200 border-violet-500/20",
        }
      }

      if (futureIncoming && day < futureIncoming.date) {
        return {
          label: "Open",
          title: "Projected vacant gap before scheduled move-in",
          transfer: futureIncoming.transfer,
          events: [],
          hasConflict: false,
          className: "bg-blue-500/15 text-blue-200 border-blue-500/20",
        }
      }

      return {
        label: "Open",
        title: "Projected vacant",
        transfer: null,
        events: [],
        hasConflict: false,
        className: "bg-blue-500/15 text-blue-200 border-blue-500/20",
      }
    }

    if (status === "vacant") {
      return {
        label: "Open",
        title: "Vacant",
        transfer: null,
        events: [],
        hasConflict: false,
        className: "bg-blue-500/15 text-blue-200 border-blue-500/20",
      }
    }

    if (status === "make_ready") {
      return {
        label: "Turn",
        title: "Make ready / turnover",
        transfer: null,
        events: [],
        hasConflict: false,
        className: "bg-violet-500/15 text-violet-200 border-violet-500/20",
      }
    }

    if (status === "notice") {
      return {
        label: "Notice",
        title: "Tenant on notice",
        transfer: null,
        events: [],
        hasConflict: false,
        className: "bg-yellow-500/15 text-yellow-200 border-yellow-500/20",
      }
    }

    return {
      label: "",
      title: "Occupied",
      transfer: null,
      events: [],
      hasConflict: false,
      className: "bg-white/[0.03] text-zinc-600 border-white/5",
    }
  }

  const monthlyStats = useMemo(() => {
    let unitsOpening = 0
    let moveIns = 0
    let vacancyDays = 0
    let conflictCount = 0

    for (const unit of visibleUnits) {
      const unitIncomingByDate = new Map<string, number>()

      for (const transfer of visibleTransfers.filter((item) => item.to_unit_id === unit.id)) {
        const moveIn = parseDate(transfer.move_in_date)
        if (!moveIn) continue
        if (moveIn.getMonth() !== selectedMonth || moveIn.getFullYear() !== selectedYear) continue

        const key = dateKey(moveIn)
        unitIncomingByDate.set(key, (unitIncomingByDate.get(key) ?? 0) + 1)
      }

      conflictCount += Array.from(unitIncomingByDate.values()).filter((count) => count > 1).length
      const tenant = visibleTenants.find(
        (tenant) =>
          tenant.unit_id === unit.id &&
          !["moved_out", "transferred"].includes(
            (tenant.status ?? "").toLowerCase()
          )
      )

      const leaseEndDate = parseDate(tenant?.lease_end)
      const unitMoveIns = visibleTransfers
        .filter((transfer) => transfer.to_unit_id === unit.id && transfer.move_in_date)
        .map((transfer) => parseDate(transfer.move_in_date))
        .filter((date): date is Date => date !== null)

      const unitMoveOuts = visibleTransfers
        .filter((transfer) => transfer.from_unit_id === unit.id && transfer.move_out_date)
        .map((transfer) => parseDate(transfer.move_out_date))
        .filter((date): date is Date => date !== null)

      const moveInsThisMonth = unitMoveIns.filter(
        (date) => date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
      )

      const moveOutsThisMonth = unitMoveOuts.filter(
        (date) => date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
      )

      moveIns += moveInsThisMonth.length
      unitsOpening += moveOutsThisMonth.length

      for (const moveOut of moveOutsThisMonth) {
        const nextMoveIn = unitMoveIns
          .filter((date) => date > moveOut)
          .sort((a, b) => a.getTime() - b.getTime())[0]

        if (nextMoveIn) {
          vacancyDays += daysBetween(moveOut, nextMoveIn)
        } else {
          const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0)
          vacancyDays += daysBetween(moveOut, endOfMonth)
        }
      }

      if (
        leaseEndDate &&
        leaseEndDate.getMonth() === selectedMonth &&
        leaseEndDate.getFullYear() === selectedYear &&
        moveOutsThisMonth.length === 0
      ) {
        unitsOpening++

        const nextMoveIn = unitMoveIns
          .filter((date) => date > leaseEndDate)
          .sort((a, b) => a.getTime() - b.getTime())[0]

        if (nextMoveIn) {
          vacancyDays += daysBetween(leaseEndDate, nextMoveIn)
        } else {
          const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0)
          vacancyDays += daysBetween(leaseEndDate, endOfMonth)
        }
      }

      if ((unit.status ?? "").toLowerCase() === "vacant") {
        vacancyDays += days.length
      }
    }

    const averageMonthlyRent =
      visibleUnits.length > 0
        ? visibleUnits.reduce(
            (sum, unit) =>
              sum + (unit.monthly_rent ?? selectedProperty?.default_monthly_rent ?? 1500),
            0
          ) / visibleUnits.length
        : selectedProperty?.default_monthly_rent ?? 1500

    const lossMultiplier = selectedProperty?.vacancy_loss_multiplier ?? 1
    const revenueRisk = Math.round((vacancyDays * averageMonthlyRent * lossMultiplier) / 30)

    return {
      unitsOpening,
      moveIns,
      vacancyDays,
      revenueRisk,
      conflictCount,
    }
  }, [visibleUnits, visibleTenants, visibleTransfers, selectedMonth, selectedYear, days.length, selectedProperty])

  function openTransferFromSelectedCell() {
    if (!selectedCell) return

    const params = new URLSearchParams({
      to_unit_id: selectedCell.unit.id,
      move_in_date: dateKey(selectedCell.date),
      to_property_id: selectedCell.unit.property_id,
    })

    window.location.href = `/transfers?${params.toString()}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black px-8 py-8 text-white">
        Loading calendar...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-8 py-8 text-white">
      <div className="mx-auto max-w-[1700px]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              UnitFlow Calendar
            </p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em]">
              Monthly Occupancy Calendar
            </h1>
            <p className="mt-3 max-w-3xl text-zinc-400">
              View every unit by property, month, and day. See move-outs,
              move-ins, lease endings, turnover, vacancy gaps, and completed transfer history.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm text-white"
            >
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm text-white"
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index}>
                  {getMonthName(index)}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm text-white"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Units Opening</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {monthlyStats.unitsOpening}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Scheduled Move-ins</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {monthlyStats.moveIns}
            </p>
          </div>

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5">
            <p className="text-sm text-orange-300">Vacancy Days Exposed</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {monthlyStats.vacancyDays}
            </p>
          </div>

          <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-5">
            <p className="text-sm text-orange-300">Revenue at Risk</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              ${monthlyStats.revenueRisk.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
            <p className="text-sm text-red-300">Conflict Warnings</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {monthlyStats.conflictCount}
            </p>
          </div>

        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-8">
          {[
            ["Occupied", "bg-white/[0.03] border-white/10 text-zinc-400"],
            ["Vacant / Gap", "bg-blue-500/15 border-blue-500/20 text-blue-200"],
            ["Turnover", "bg-violet-500/15 border-violet-500/20 text-violet-200"],
            ["Notice", "bg-yellow-500/15 border-yellow-500/20 text-yellow-200"],
            ["Move-out", "bg-orange-500/25 border-orange-500/40 text-orange-200"],
            ["Move-in", "bg-emerald-500/25 border-emerald-500/40 text-emerald-200"],
            ["Transfer Gap", "bg-blue-500/20 border-blue-500/30 text-blue-200"],
            ["Conflict", "bg-red-500/25 border-red-500/40 text-red-200"],
          ].map(([label, classes]) => (
            <div
              key={label}
              className={`rounded-2xl border px-4 py-3 text-sm ${classes}`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-medium tracking-[-0.03em]">
              {selectedProperty?.name ?? "No property selected"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {getMonthName(selectedMonth)} {selectedYear} • {visibleUnits.length} units • {visibleTransfers.length} visible transfers
            </p>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-auto rounded-3xl border border-white/10 bg-white/[0.03]">
          <div
            className="min-w-[1500px]"
            style={{
              gridTemplateColumns: `220px repeat(${days.length}, minmax(48px, 1fr))`,
            }}
          >
            <div
              className="sticky top-0 z-30 grid border-b border-white/10 bg-zinc-950/95 backdrop-blur"
              style={{
                gridTemplateColumns: `220px repeat(${days.length}, minmax(48px, 1fr))`,
              }}
            >
              <div className="sticky left-0 z-40 bg-zinc-950/95 p-4 text-sm font-medium text-zinc-400 backdrop-blur">
                Unit
              </div>

              {days.map((day) => {
                const isToday = dateKey(day) === dateKey(new Date())

                return (
                  <div
                    key={dateKey(day)}
                    className={`border-l border-white/10 p-2 text-center ${
                      isToday ? "bg-white/10" : ""
                    }`}
                  >
                    <p className="text-[10px] uppercase text-zinc-500">
                      {day.toLocaleDateString(undefined, { weekday: "short" })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {day.getDate()}
                    </p>
                  </div>
                )
              })}
            </div>

            {visibleUnits.map((unit) => (
              <div
                key={unit.id}
                className="grid border-b border-white/5 last:border-b-0"
                style={{
                  gridTemplateColumns: `220px repeat(${days.length}, minmax(48px, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-20 bg-zinc-950/95 p-4">
                  <p className="text-base font-medium text-white">
                    Unit {unit.unit_number}
                  </p>
                  <p className="mt-1 text-xs capitalize text-zinc-500">
                    {(unit.status ?? "unknown").replaceAll("_", " ")}
                  </p>
                </div>

                {days.map((day) => {
                  const cell = getCell(unit, day)

                  return (
                    <button
                      key={`${unit.id}-${dateKey(day)}`}
                      type="button"
                      onClick={() =>
                        setSelectedCell({
                          unit,
                          date: day,
                          label: cell.label || "Occupied",
                          title: cell.title,
                          transfer: cell.transfer,
                          events: cell.events,
                          hasConflict: cell.hasConflict,
                        })
                      }
                      className="border-l border-white/5 p-1 text-left transition hover:bg-white/5"
                      title={cell.title}
                    >
                      <div className={`flex min-h-10 flex-col justify-center gap-1 rounded-xl border px-1 py-1 text-[10px] font-medium ${cell.events.length > 0 ? "bg-white/[0.02] text-white border-white/10" : cell.className}`}>
                        {cell.events.length > 0 ? (
                          cell.events.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className={`truncate rounded-lg border px-1.5 py-0.5 text-center leading-tight ${event.className}`}
                            >
                              {event.label}
                            </div>
                          ))
                        ) : (
                          <div className="text-center">{cell.label}</div>
                        )}
                        {cell.events.length > 3 ? (
                          <div className="text-center text-[9px] text-zinc-400">
                            +{cell.events.length - 3}
                          </div>
                        ) : null}
                      </div>

                    </button>
                  )
                })}
              </div>
            ))}

            {visibleUnits.length === 0 ? (
              <div className="p-8 text-zinc-500">
                No units found for this property.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {selectedCell ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close timeline detail panel"
            className="flex-1"
            onClick={() => setSelectedCell(null)}
          />

          <aside className="h-full w-full max-w-[430px] border-l border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">
                  Calendar Detail
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  Unit {selectedCell.unit.unit_number}
                </h2>
                <p className="mt-2 text-zinc-400">
                  {formatDateForDisplay(selectedCell.date)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5"
              >
                Close
              </button>
            </div>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-zinc-500">Projected state</p>
                <p className="mt-2 text-xl font-medium text-white">
                  {selectedCell.label}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {selectedCell.title}
                </p>
              </div>

              {selectedCell.events.length > 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-300">Linked transfer activity</p>
                  <div className="mt-3 space-y-3">
                    {selectedCell.events.map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-xl border p-3 ${event.className}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{event.label}</p>
                            <p className="mt-1 text-xs opacity-80">{event.title}</p>
                          </div>
                          <p className="text-xs capitalize opacity-80">
                            {getTransferStatusLabel(event.transfer.status)}
                          </p>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="opacity-70">Move-out</p>
                            <p>{formatDateValue(event.transfer.move_out_date)}</p>
                          </div>
                          <div>
                            <p className="opacity-70">Move-in</p>
                            <p>{formatDateValue(event.transfer.move_in_date)}</p>
                          </div>
                          <div>
                            <p className="opacity-70">Gap days</p>
                            <p>{event.gapDays ?? "—"}</p>
                          </div>
                          <div>
                            <p className="opacity-70">Savings / risk</p>
                            <p>{formatMoney(event.revenueValue)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}


              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-zinc-500">Current unit status</p>
                <p className="mt-2 text-xl font-medium capitalize text-white">
                  {(selectedCell.unit.status ?? "unknown").replaceAll("_", " ")}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-zinc-500">Rent basis</p>
                <p className="mt-2 text-xl font-medium text-white">
                  {selectedCell.unit.monthly_rent
                    ? `$${selectedCell.unit.monthly_rent.toLocaleString()}/month`
                    : selectedProperty?.default_monthly_rent
                      ? `$${selectedProperty.default_monthly_rent.toLocaleString()}/month default`
                      : "Rent not set"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-zinc-500">Turnover rule</p>
                <p className="mt-2 text-xl font-medium text-white">
                  {selectedProperty?.turnover_days ?? 2} day buffer
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  UnitFlow will not treat a moved-out unit as ready until this buffer is complete.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openTransferFromSelectedCell}
              className="mt-8 w-full rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Start transfer from this date
            </button>

            <p className="mt-3 text-center text-xs text-zinc-500">
              This sends the selected unit and move-in date to the Transfers page.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  )
}
