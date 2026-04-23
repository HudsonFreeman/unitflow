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

type TransferRow = {
  id: string
  status: string
  tenant_id: string
  from_unit_id: string
  to_unit_id: string
  move_out_date: string | null
  move_in_date: string | null
}

type DestinationUnitOption = UnitRow & {
  expectedAvailableDate: Date | null
  gapDays: number | null
  timingLabel: string
  timingReason: string
}

function formatDateValue(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)
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
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function maxDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date)

  if (validDates.length === 0) return null

  return validDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  )
}

function minDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date)

  if (validDates.length === 0) return null

  return validDates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest
  )
}

function getTimingGapDays(
  expectedAvailableDate: Date | null,
  requestedMoveInDate: string
) {
  if (!expectedAvailableDate || !requestedMoveInDate) return null

  const requestedDate = parseDate(requestedMoveInDate)
  if (!requestedDate) return null

  const available = startOfDay(expectedAvailableDate)
  const requested = startOfDay(requestedDate)

  return Math.round(
    (available.getTime() - requested.getTime()) / (1000 * 60 * 60 * 24)
  )
}

function getTimingLabel(gapDays: number | null) {
  if (gapDays === null) return "Unknown timing"
  if (gapDays < -60) return "Available much earlier"
  if (gapDays < -14) return "Available earlier"
  if (gapDays < 0) return "Available slightly early"
  if (gapDays <= 2) return "Best fit"
  if (gapDays <= 7) return "Slight delay"
  if (gapDays <= 21) return "Delayed"
  return "Too late"
}

function getExpectedAvailabilityDetails(
  unit: UnitRow,
  allTenants: TenantRow[],
  allTransfers: TransferRow[]
) {
  const today = startOfDay(new Date())
  const unitStatus = (unit.status ?? "").toLowerCase()

  const activeOccupants = allTenants.filter(
    (tenant) =>
      tenant.unit_id === unit.id &&
      !["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())
  )

  const relevantTransfers = allTransfers.filter(
    (transfer) =>
      transfer.from_unit_id === unit.id &&
      ["requested", "approved", "scheduled"].includes(
        (transfer.status ?? "").toLowerCase()
      )
  )

  const occupantLeaseEndDates = activeOccupants.map((tenant) => parseDate(tenant.lease_end))
  const transferMoveOutDates = relevantTransfers.map((transfer) =>
    parseDate(transfer.move_out_date)
  )

  const latestOccupantLeaseEnd = maxDate(occupantLeaseEndDates)
  const earliestOccupantLeaseEnd = minDate(occupantLeaseEndDates)
  const latestTransferMoveOut = maxDate(transferMoveOutDates)

  if (unitStatus === "vacant") {
    return {
      expectedAvailableDate: today,
      timingReason: "Unit is currently vacant.",
    }
  }

  if (unitStatus === "make_ready") {
    const makeReadyDate = addDays(today, 7)
    return {
      expectedAvailableDate: makeReadyDate,
      timingReason: "Unit is currently in make-ready status. Estimated 7-day prep window.",
    }
  }

  if (unitStatus === "notice") {
    if (earliestOccupantLeaseEnd) {
      const leaseEndDay = startOfDay(earliestOccupantLeaseEnd)
      return {
        expectedAvailableDate:
          leaseEndDay.getTime() < today.getTime() ? today : leaseEndDay,
        timingReason:
          "Unit is on notice. Availability is based on the current resident’s lease end date.",
      }
    }

    if (latestTransferMoveOut) {
      const moveOutDay = startOfDay(latestTransferMoveOut)
      return {
        expectedAvailableDate:
          moveOutDay.getTime() < today.getTime() ? today : moveOutDay,
        timingReason: "Unit is on notice. Availability is based on a scheduled move-out.",
      }
    }

    return {
      expectedAvailableDate: addDays(today, 21),
      timingReason: "Notice unit has no lease or transfer timing, so a fallback estimate is being used.",
    }
  }

  if (unitStatus === "occupied") {
    if (earliestOccupantLeaseEnd) {
      const leaseEndDay = startOfDay(earliestOccupantLeaseEnd)

      if (leaseEndDay.getTime() < today.getTime()) {
        return {
          expectedAvailableDate: today,
          timingReason:
            "The recorded lease end date has already passed, so this unit is treated as effectively available.",
        }
      }

      return {
        expectedAvailableDate: leaseEndDay,
        timingReason:
          "Unit is currently occupied. Future availability is based on the resident’s lease end date.",
      }
    }

    if (latestTransferMoveOut) {
      const moveOutDay = startOfDay(latestTransferMoveOut)
      return {
        expectedAvailableDate:
          moveOutDay.getTime() < today.getTime() ? today : moveOutDay,
        timingReason:
          "Unit is occupied, but a scheduled transfer move-out provides the next known availability date.",
      }
    }

    return {
      expectedAvailableDate: null,
      timingReason: "Unit is occupied and no reliable release date was found.",
    }
  }

  const fallbackDate = maxDate([earliestOccupantLeaseEnd, latestTransferMoveOut])

  return {
    expectedAvailableDate: fallbackDate
      ? startOfDay(fallbackDate).getTime() < today.getTime()
        ? today
        : startOfDay(fallbackDate)
      : null,
    timingReason: fallbackDate
      ? "Availability is based on the next known lease or transfer timing tied to this unit."
      : "No reliable availability timing was found for this unit.",
  }
}

export default function TenantRequestPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [tenant, setTenant] = useState<TenantRow | null>(null)
  const [allTenants, setAllTenants] = useState<TenantRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])

  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [requestedDate, setRequestedDate] = useState("")
  const [moveOutDate, setMoveOutDate] = useState("")
  const [moveInDate, setMoveInDate] = useState("")
  const [reason, setReason] = useState("")

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

      const [allTenantsQuery, propertiesQuery, unitsQuery, transfersQuery] = await Promise.all([
        supabaseClient
          .from("tenants")
          .select(
            "id, first_name, last_name, email, phone, lease_end, property_id, unit_id, status, organization_id"
          )
          .eq("organization_id", nextTenant.organization_id),
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
        supabaseClient
          .from("transfers")
          .select("id, status, tenant_id, from_unit_id, to_unit_id, move_out_date, move_in_date")
          .eq("organization_id", nextTenant.organization_id)
          .order("id", { ascending: false }),
      ])

      if (allTenantsQuery.error) {
        setErrorMessage(allTenantsQuery.error.message)
        setLoading(false)
        return
      }

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

      if (transfersQuery.error) {
        setErrorMessage(transfersQuery.error.message)
        setLoading(false)
        return
      }

      const nextAllTenants = (allTenantsQuery.data ?? []) as TenantRow[]
      const nextProperties = (propertiesQuery.data ?? []) as PropertyRow[]
      const nextUnits = (unitsQuery.data ?? []) as UnitRow[]
      const nextTransfers = (transfersQuery.data ?? []) as TransferRow[]

      setTenant(nextTenant)
      setAllTenants(nextAllTenants)
      setProperties(nextProperties)
      setUnits(nextUnits)
      setTransfers(nextTransfers)

      const today = new Date()
      const defaultMoveOut = addDays(today, 7)
      const defaultMoveIn = addDays(today, 8)

      setRequestedDate(getDateOnlyString(today))
      setMoveOutDate(getDateOnlyString(defaultMoveOut))
      setMoveInDate(getDateOnlyString(defaultMoveIn))

      setLoading(false)
    }

    loadPage()
  }, [])

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

  const scopedUnits = useMemo(() => {
    if (!tenant?.organization_id) return []
    return units.filter((unit) => unit.organization_id === tenant.organization_id)
  }, [units, tenant])

  const scopedTenants = useMemo(() => {
    if (!tenant?.organization_id) return []
    return allTenants.filter(
      (resident) => resident.organization_id === tenant.organization_id
    )
  }, [allTenants, tenant])

  const openTransfers = useMemo(() => {
    return transfers.filter((transfer) =>
      ["requested", "approved", "scheduled"].includes(
        (transfer.status ?? "").toLowerCase()
      )
    )
  }, [transfers])

  const destinationUnits = useMemo<DestinationUnitOption[]>(() => {
    if (!selectedPropertyId || !tenant) return []

    return scopedUnits
      .filter((unit) => unit.property_id === selectedPropertyId)
      .filter((unit) => unit.id !== tenant.unit_id)
      .filter((unit) => !openTransfers.some((transfer) => transfer.to_unit_id === unit.id))
      .map((unit) => {
        const details = getExpectedAvailabilityDetails(unit, scopedTenants, transfers)
        const gapDays = getTimingGapDays(details.expectedAvailableDate, moveInDate)

        return {
          ...unit,
          expectedAvailableDate: details.expectedAvailableDate,
          gapDays,
          timingLabel: getTimingLabel(gapDays),
          timingReason: details.timingReason,
        }
      })
      .filter((unit) => {
        if (!moveInDate) return unit.expectedAvailableDate !== null

        const requestedMoveIn = parseDate(moveInDate)
        if (!requestedMoveIn || !unit.expectedAvailableDate || unit.gapDays === null) {
          return false
        }

        const earliestAcceptableDate = addDays(requestedMoveIn, -45)
        const latestAcceptableDate = addDays(requestedMoveIn, 30)

        return (
          startOfDay(unit.expectedAvailableDate).getTime() >=
            startOfDay(earliestAcceptableDate).getTime() &&
          startOfDay(unit.expectedAvailableDate).getTime() <=
            startOfDay(latestAcceptableDate).getTime()
        )
      })
      .sort((a, b) => {
        if (a.gapDays === null && b.gapDays === null) {
          return a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (a.gapDays === null) return 1
        if (b.gapDays === null) return -1

        const absDifference = Math.abs(a.gapDays) - Math.abs(b.gapDays)
        if (absDifference !== 0) return absDifference

        return a.unit_number.localeCompare(b.unit_number, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })
  }, [selectedPropertyId, tenant, scopedUnits, openTransfers, scopedTenants, transfers, moveInDate])

  const selectedDestinationUnit =
    destinationUnits.find((unit) => unit.id === selectedUnitId) ?? null

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

      const today = new Date()
      const defaultMoveOut = addDays(today, 7)
      const defaultMoveIn = addDays(today, 8)

      setRequestedDate(getDateOnlyString(today))
      setMoveOutDate(getDateOnlyString(defaultMoveOut))
      setMoveInDate(getDateOnlyString(defaultMoveIn))

      if (tenant.organization_id) {
        const refreshedTransfers = await supabaseClient
          .from("transfers")
          .select("id, status, tenant_id, from_unit_id, to_unit_id, move_out_date, move_in_date")
          .eq("organization_id", tenant.organization_id)
          .order("id", { ascending: false })

        if (!refreshedTransfers.error) {
          setTransfers((refreshedTransfers.data ?? []) as TransferRow[])
        }
      }

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
        <p className="mt-6 text-red-400">{errorMessage || "Tenant record not found."}</p>
        <div className="mt-6">
          <Link href="/tenant" className="text-sm text-zinc-300 underline">
            Back to tenant portal
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl">Request a Transfer</h1>
            <p className="mt-3 text-zinc-400">
              Choose where you want to move, pick your preferred timing, and send
              your request for staff review.
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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Current Property</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {currentProperty?.name ?? "Unknown Property"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Current unit: {currentUnit ? `Unit ${currentUnit.unit_number}` : "Unknown"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Lease End</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatDateValue(tenant.lease_end)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Requests are reviewed by staff before approval.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Destination Property
              </label>
              <select
                value={selectedPropertyId}
                onChange={(e) => {
                  setSelectedPropertyId(e.target.value)
                  setSelectedUnitId("")
                }}
                className="w-full rounded border border-white/10 bg-black p-3 text-white"
              >
                <option value="">Select destination property</option>
                {scopedProperties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
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
              <label className="mb-2 block text-sm text-zinc-400">
                Preferred Move-Out Date
              </label>
              <input
                type="date"
                value={moveOutDate}
                onChange={(e) => setMoveOutDate(e.target.value)}
                className="w-full rounded border border-white/10 bg-black p-3 text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Preferred Move-In Date
              </label>
              <input
                type="date"
                value={moveInDate}
                onChange={(e) => {
                  setMoveInDate(e.target.value)
                  setSelectedUnitId("")
                }}
                className="w-full rounded border border-white/10 bg-black p-3 text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Destination Unit
              </label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                disabled={!selectedPropertyId}
                className="w-full rounded border border-white/10 bg-black p-3 text-white disabled:opacity-60"
              >
                <option value="">
                  {!selectedPropertyId
                    ? "Select destination property first"
                    : destinationUnits.length === 0
                      ? "No units close to your requested move-in date"
                      : "Select destination unit"}
                </option>

                {destinationUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unit_number} — {formatUnitStatus(unit.status)} | Available:{" "}
                    {formatDateValue(
                      unit.expectedAvailableDate
                        ? unit.expectedAvailableDate.toISOString().slice(0, 10)
                        : null
                    )}{" "}
                    | {unit.timingLabel}
                    {unit.gapDays !== null && Math.abs(unit.gapDays) <= 60
                      ? ` (${unit.gapDays} days)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedPropertyId && destinationUnits.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-medium text-zinc-200">
                  Best visible options for your requested timing
                </p>
                <div className="mt-3 space-y-2">
                  {destinationUnits.slice(0, 5).map((unit) => (
                    <div
                      key={`${unit.id}-preview`}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                    >
                      <p>
                        Unit {unit.unit_number} • {formatUnitStatus(unit.status)} • Available{" "}
                        {formatDateValue(
                          unit.expectedAvailableDate
                            ? unit.expectedAvailableDate.toISOString().slice(0, 10)
                            : null
                        )}{" "}
                        • {unit.timingLabel}
                        {unit.gapDays !== null && Math.abs(unit.gapDays) <= 60
                          ? ` (${unit.gapDays} days)`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{unit.timingReason}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedDestinationUnit ? (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-sm font-medium text-blue-200">
                  Selected Unit Timing
                </p>
                <p className="mt-2 text-sm text-zinc-100">
                  Unit {selectedDestinationUnit.unit_number} is expected to be available{" "}
                  {formatDateValue(
                    selectedDestinationUnit.expectedAvailableDate
                      ? selectedDestinationUnit.expectedAvailableDate.toISOString().slice(0, 10)
                      : null
                  )}
                  .
                </p>
                <p className="mt-1 text-sm text-zinc-100">
                  Match: {selectedDestinationUnit.timingLabel}
                  {selectedDestinationUnit.gapDays !== null &&
                  Math.abs(selectedDestinationUnit.gapDays) <= 60
                    ? ` (${selectedDestinationUnit.gapDays} days from requested move-in)`
                    : ""}
                </p>
                <p className="mt-2 text-xs text-zinc-300">
                  {selectedDestinationUnit.timingReason}
                </p>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Why do you want to move?
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Example: I want a different layout, lower floor, quieter location, or closer parking."
                className="w-full rounded border border-white/10 bg-black p-3 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded bg-white px-4 py-3 text-black disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Transfer Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}