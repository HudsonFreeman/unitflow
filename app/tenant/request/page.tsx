"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabaseClient } from "@/lib/supabase-client"

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  lease_end: string | null
  property_id: string
  unit_id: string
  status: string | null
  organization_id: string | null
}

type PropertyRow = {
  id: string
  name: string
  organization_id: string | null
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string | null
  organization_id: string | null
}

type AvailableUnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string | null
  expected_available_date: string | null
  gap_days: number | null
  timing_label: string
  timing_reason: string
}

function formatDateValue(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString()
}

function formatUnitStatus(status?: string | null) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

function getDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
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

function getMonthName(month: number) {
  return new Date(2026, month, 1).toLocaleDateString(undefined, {
    month: "long",
  })
}

function isBeforeDateOnly(a: Date, b: Date) {
  const aOnly = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bOnly = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return aOnly.getTime() < bOnly.getTime()
}

function isSameDateOnly(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getReadableTimingLabel(unit: AvailableUnitRow) {
  if (unit.gap_days === null) return unit.timing_label

  if (unit.gap_days === 0) return "Best match"

  if (unit.gap_days < 0) {
    const daysEarly = Math.abs(unit.gap_days)
    if (daysEarly <= 2) return "Good match"
    return "Available early"
  }

  if (unit.gap_days <= 2) return "Available soon"

  return "Needs later date"
}

function getUnitCardTone(unit: AvailableUnitRow) {
  if (unit.gap_days === null) {
    return "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
  }

  if (unit.gap_days === 0) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
  }

  if (unit.gap_days < 0) {
    return "border-blue-500/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15"
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
}

export default function TenantRequestPage() {
  const [loading, setLoading] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [tenant, setTenant] = useState<TenantRow | null>(null)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [availableUnits, setAvailableUnits] = useState<AvailableUnitRow[]>([])

  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [requestedDate, setRequestedDate] = useState("")
  const [moveOutDate, setMoveOutDate] = useState("")
  const [moveInDate, setMoveInDate] = useState("")
  const [reason, setReason] = useState("")

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  useEffect(() => {
    async function loadPage() {
      setLoading(true)
      setErrorMessage("")
      setSuccessMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        setErrorMessage("You must be logged in to submit a transfer request.")
        setLoading(false)
        return
      }

      const tenantQuery = await supabaseClient
        .from("tenants")
        .select(
          "id, first_name, last_name, email, phone, lease_end, property_id, unit_id, status, organization_id"
        )
        .eq("user_id", user.id)
        .single()

      if (tenantQuery.error || !tenantQuery.data) {
        setErrorMessage("Tenant record not found for this login.")
        setLoading(false)
        return
      }

      const nextTenant = tenantQuery.data as TenantRow

      if (!nextTenant.organization_id) {
        setErrorMessage("Tenant organization not found.")
        setLoading(false)
        return
      }

      const [propertiesQuery, unitsQuery] = await Promise.all([
        supabaseClient
          .from("properties")
          .select("id, name, organization_id")
          .eq("organization_id", nextTenant.organization_id)
          .order("name"),
        supabaseClient
          .from("units")
          .select("id, unit_number, property_id, status, organization_id")
          .eq("organization_id", nextTenant.organization_id)
          .order("unit_number"),
      ])

      if (propertiesQuery.error) {
        setErrorMessage(propertiesQuery.error.message)
        setLoading(false)
        return
      }

      if (unitsQuery.error) {
        setErrorMessage(unitsQuery.error.message)
        setLoading(false)
        return
      }

      setTenant(nextTenant)
      setProperties((propertiesQuery.data ?? []) as PropertyRow[])
      setUnits((unitsQuery.data ?? []) as UnitRow[])

      const today = new Date()
      const defaultMoveOut = addDays(today, 7)
      const defaultMoveIn = addDays(today, 8)

      setRequestedDate(getDateOnlyString(today))
      setMoveOutDate(getDateOnlyString(defaultMoveOut))
      setMoveInDate(getDateOnlyString(defaultMoveIn))
      setCalendarMonth(defaultMoveIn.getMonth())
      setCalendarYear(defaultMoveIn.getFullYear())

      setLoading(false)
    }

    loadPage()
  }, [])

  useEffect(() => {
    async function loadAvailableUnits() {
      setAvailableUnits([])
      setSelectedUnitId("")

      if (!selectedPropertyId || !moveInDate) return

      setLoadingUnits(true)
      setErrorMessage("")

      const params = new URLSearchParams({
        property_id: selectedPropertyId,
        move_in_date: moveInDate,
      })

      if (moveOutDate) {
        params.set("move_out_date", moveOutDate)
      }

      const response = await fetch(`/api/tenant/available-units?${params.toString()}`)
      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to load available units.")
        setLoadingUnits(false)
        return
      }

      setAvailableUnits((result.units ?? []) as AvailableUnitRow[])
      setLoadingUnits(false)
    }

    loadAvailableUnits()
  }, [selectedPropertyId, moveInDate, moveOutDate])

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const unitMap = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units]
  )

  const currentProperty = tenant ? propertyMap.get(tenant.property_id) ?? null : null
  const currentUnit = tenant ? unitMap.get(tenant.unit_id) ?? null : null

  const scopedProperties = useMemo(() => {
    if (!tenant?.organization_id) return []
    return properties.filter(
      (property) => property.organization_id === tenant.organization_id
    )
  }, [properties, tenant])

  const selectedDestinationUnit =
    availableUnits.find((unit) => unit.id === selectedUnitId) ?? null

  const calendarDays = useMemo(
    () => getDaysInMonth(calendarYear, calendarMonth),
    [calendarYear, calendarMonth]
  )

  const calendarYears = useMemo(() => {
    const start = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, index) => start + index)
  }, [])


  const stepItems = [
    {
      number: 1,
      label: "Property",
      complete: Boolean(selectedPropertyId),
    },
    {
      number: 2,
      label: "Dates",
      complete: Boolean(moveOutDate && moveInDate),
    },
    {
      number: 3,
      label: "Unit",
      complete: Boolean(selectedUnitId),
    },
    {
      number: 4,
      label: "Calendar",
      complete: Boolean(selectedUnitId && moveInDate),
    },
    {
      number: 5,
      label: "Submit",
      complete: Boolean(reason.trim()),
    },
  ]

  function handleMoveInDateChange(nextDate: string) {
    setMoveInDate(nextDate)
    const parsed = parseDate(nextDate)

    if (parsed) {
      setCalendarMonth(parsed.getMonth())
      setCalendarYear(parsed.getFullYear())
    }
  }

  function handleUnitChange(unitId: string) {
    setSelectedUnitId(unitId)
    setSuccessMessage("")

    const unit = availableUnits.find((item) => item.id === unitId)
    const availableDate = parseDate(unit?.expected_available_date)
    const currentMoveInDate = parseDate(moveInDate)

    if (!unit || !availableDate) return

    if (!currentMoveInDate || isBeforeDateOnly(currentMoveInDate, availableDate)) {
      const adjustedDate = getDateOnlyString(availableDate)
      handleMoveInDateChange(adjustedDate)
      setSuccessMessage(
        `Move-in date updated to ${formatDateValue(adjustedDate)} because Unit ${unit.unit_number} is expected to be available then.`
      )
    }
  }

  function handleCalendarDateClick(date: Date) {
    const selectedDate = getDateOnlyString(date)
    handleMoveInDateChange(selectedDate)
  }

  function getCalendarCell(date: Date) {
    const selectedMoveIn = parseDate(moveInDate)
    const selectedAvailableDate = parseDate(selectedDestinationUnit?.expected_available_date)

    if (selectedMoveIn && isSameDateOnly(date, selectedMoveIn)) {
      return {
        label: "Selected",
        className: "border-emerald-500/50 bg-emerald-500/25 text-emerald-100",
      }
    }

    if (selectedAvailableDate) {
      if (isBeforeDateOnly(date, selectedAvailableDate)) {
        return {
          label: "Unavailable",
          className: "border-white/10 bg-white/[0.03] text-zinc-600",
        }
      }

      if (isSameDateOnly(date, selectedAvailableDate)) {
        return {
          label: "Available",
          className: "border-blue-500/30 bg-blue-500/15 text-blue-200",
        }
      }

      return {
        label: "Available",
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
      }
    }

    return {
      label: "Pick",
      className: "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]",
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage("")
    setSuccessMessage("")

    if (!tenant) {
      setErrorMessage("Tenant record not loaded.")
      return
    }

    if (!selectedPropertyId) {
      setErrorMessage("Destination property is required.")
      return
    }

    if (!selectedUnitId) {
      setErrorMessage("Destination unit is required.")
      return
    }

    if (!reason.trim()) {
      setErrorMessage("Reason for transfer is required.")
      return
    }

    if (moveOutDate && moveInDate) {
      const moveOut = parseDate(moveOutDate)
      const moveIn = parseDate(moveInDate)

      if (!moveOut || !moveIn || moveIn.getTime() < moveOut.getTime()) {
        setErrorMessage("Move-in date cannot be before move-out date.")
        return
      }
    }

    setSubmitting(true)

    try {
      const response = await fetch("/api/tenant/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_property_id: selectedPropertyId,
          to_unit_id: selectedUnitId,
          requested_date: requestedDate || null,
          move_out_date: moveOutDate || null,
          move_in_date: moveInDate || null,
          reason: reason.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result.error ?? "Failed to submit transfer request.")
        setSubmitting(false)
        return
      }

      setSuccessMessage("Transfer request submitted.")
      setSelectedPropertyId("")
      setSelectedUnitId("")
      setReason("")
      setAvailableUnits([])

      const today = new Date()
      const defaultMoveOut = addDays(today, 7)
      const defaultMoveIn = addDays(today, 8)

      setRequestedDate(getDateOnlyString(today))
      setMoveOutDate(getDateOnlyString(defaultMoveOut))
      setMoveInDate(getDateOnlyString(defaultMoveIn))
      setCalendarMonth(defaultMoveIn.getMonth())
      setCalendarYear(defaultMoveIn.getFullYear())

      setSubmitting(false)
    } catch {
      setErrorMessage("Failed to submit transfer request.")
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        <h1 className="text-4xl">Request a Transfer</h1>
        <p className="mt-6 text-zinc-400">Loading request form...</p>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        <h1 className="text-4xl">Request a Transfer</h1>
        <p className="mt-6 text-red-400">
          {errorMessage || "Tenant record not found."}
        </p>
        <div className="mt-6">
          <Link href="/tenant" className="text-sm text-zinc-300 underline">
            Back to tenant portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-5 py-8 text-white md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              Tenant Portal
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              Request a Transfer
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Pick where you want to move, choose a date that works, and send the request to staff for review.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/tenant" className="text-sm text-zinc-300 underline">
              Back to portal
            </Link>
            <Link href="/tenant/requests" className="text-sm text-zinc-300 underline">
              My Requests
            </Link>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1fr_0.85fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Your current home</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {currentProperty?.name ?? "Unknown Property"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {currentUnit ? `Unit ${currentUnit.unit_number}` : "Unknown unit"} • Lease ends {formatDateValue(tenant.lease_end)}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Progress</p>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {stepItems.map((step) => (
                <div key={step.number}>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${
                      step.complete
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-white/10 bg-black/30 text-zinc-500"
                    }`}
                  >
                    {step.number}
                  </div>
                  <p className="mt-2 text-[10px] leading-tight text-zinc-500">
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-white">Where do you want to move?</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose the property first. Then choose your move dates.
                </p>

                <select
                  value={selectedPropertyId}
                  onChange={(e) => {
                    setSelectedPropertyId(e.target.value)
                    setSelectedUnitId("")
                  }}
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-black p-4 text-white"
                >
                  <option value="">Select destination property</option>
                  {scopedProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {selectedPropertyId ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  2
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white">When do you want to move?</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Choose your preferred move-out and move-in dates before selecting a unit.
                  </p>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs text-zinc-500">
                        Requested Date
                      </label>
                      <input
                        type="date"
                        value={requestedDate}
                        onChange={(e) => setRequestedDate(e.target.value)}
                        className="w-full rounded border border-white/10 bg-black p-3 text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs text-zinc-500">
                        Move-Out Date
                      </label>
                      <input
                        type="date"
                        value={moveOutDate}
                        onChange={(e) => setMoveOutDate(e.target.value)}
                        className="w-full rounded border border-white/10 bg-black p-3 text-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs text-zinc-500">
                        Move-In Date
                      </label>
                      <input
                        type="date"
                        value={moveInDate}
                        onChange={(e) => handleMoveInDateChange(e.target.value)}
                        className="w-full rounded border border-white/10 bg-black p-3 text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                    Unit options below are based on the move-in date you selected: {formatDateValue(moveInDate)}.
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {selectedPropertyId ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  3
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Choose a unit</h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        These options are based on your selected property and move-in date.
                      </p>
                    </div>
                    {loadingUnits ? (
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">
                        Loading units...
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {availableUnits.length > 0 ? (
                      availableUnits.slice(0, 8).map((unit) => (
                        <button
                          type="button"
                          onClick={() => handleUnitChange(unit.id)}
                          key={unit.id}
                          className={`rounded-2xl border p-4 text-left transition ${
                            selectedUnitId === unit.id
                              ? "border-white bg-white/15 text-white"
                              : getUnitCardTone(unit)
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold">Unit {unit.unit_number}</p>
                              <p className="mt-1 text-xs capitalize opacity-70">
                                {formatUnitStatus(unit.status)}
                              </p>
                            </div>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs opacity-80">
                              {getReadableTimingLabel(unit)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm opacity-80">
                            Available {formatDateValue(unit.expected_available_date)}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400 md:col-span-2">
                        {loadingUnits
                          ? "Loading available units..."
                          : "No units available around your preferred move-in date. Try a later move-in date or another property."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {selectedDestinationUnit ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  4
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-white">Confirm your move-in date</h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        Click the calendar or use the date input above. Unavailable days are blocked.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={calendarMonth}
                        onChange={(e) => setCalendarMonth(Number(e.target.value))}
                        className="rounded-full border border-white/10 bg-black px-3 py-2 text-xs text-white"
                      >
                        {Array.from({ length: 12 }, (_, index) => (
                          <option key={index} value={index}>
                            {getMonthName(index)}
                          </option>
                        ))}
                      </select>

                      <select
                        value={calendarYear}
                        onChange={(e) => setCalendarYear(Number(e.target.value))}
                        className="rounded-full border border-white/10 bg-black px-3 py-2 text-xs text-white"
                      >
                        {calendarYears.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-zinc-500">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div key={day}>{day}</div>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {Array.from({ length: calendarDays[0]?.getDay() ?? 0 }).map((_, index) => (
                      <div key={`blank-${index}`} />
                    ))}

                    {calendarDays.map((date) => {
                      const cell = getCalendarCell(date)
                      const selectedAvailableDate = parseDate(selectedDestinationUnit?.expected_available_date)
                      const disabled = selectedAvailableDate
                        ? isBeforeDateOnly(date, selectedAvailableDate)
                        : false

                      return (
                        <button
                          key={getDateOnlyString(date)}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleCalendarDateClick(date)}
                          className={`min-h-[74px] rounded-2xl border p-2 text-left text-xs transition disabled:cursor-not-allowed ${cell.className}`}
                        >
                          <p className="text-sm font-semibold text-white">{date.getDate()}</p>
                          <p className="mt-2 truncate text-[10px]">{cell.label}</p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                    <p className="text-sm font-medium text-blue-200">
                      Unit {selectedDestinationUnit.unit_number} selected
                    </p>
                    <p className="mt-2 text-sm text-zinc-100">
                      Available {formatDateValue(selectedDestinationUnit.expected_available_date)}. Your requested move-in date is {formatDateValue(moveInDate)}.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {selectedDestinationUnit ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">
                  5
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-white">Tell us why</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Staff will review your request and approve, deny, or follow up.
                  </p>

                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    placeholder="Example: I want a different layout, lower floor, quieter location, or closer parking."
                    className="mt-4 w-full rounded-2xl border border-white/10 bg-black p-4 text-white"
                  />

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-sm font-medium text-white">Review</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-zinc-300 md:grid-cols-4">
                      <div>
                        <p className="text-xs text-zinc-500">Property</p>
                        <p>{propertyMap.get(selectedPropertyId)?.name ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Unit</p>
                        <p>Unit {selectedDestinationUnit.unit_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Move-out</p>
                        <p>{formatDateValue(moveOutDate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Move-in</p>
                        <p>{formatDateValue(moveInDate)}</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-5 w-full rounded-2xl bg-white px-4 py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Submit Transfer Request"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </form>
      </div>
    </div>
  )
}
