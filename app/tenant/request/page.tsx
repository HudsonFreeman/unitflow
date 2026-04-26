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
                onChange={(e) => setMoveInDate(e.target.value)}
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
                disabled={!selectedPropertyId || loadingUnits}
                className="w-full rounded border border-white/10 bg-black p-3 text-white disabled:opacity-60"
              >
                <option value="">
                  {!selectedPropertyId
                    ? "Select destination property first"
                    : loadingUnits
                      ? "Loading available units..."
                      : availableUnits.length === 0
                        ? "No units available around your preferred move-in date"
                        : "Select destination unit"}
                </option>

                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unit_number} — {formatUnitStatus(unit.status)} | Available:{" "}
                    {formatDateValue(unit.expected_available_date)} | {unit.timing_label}
                  </option>
                ))}
              </select>
            </div>

            {selectedPropertyId && availableUnits.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-medium text-zinc-200">
                  Best units around your preferred move-in date
                </p>
                <div className="mt-3 space-y-2">
                  {availableUnits.slice(0, 5).map((unit) => (
                    <div
                      key={`${unit.id}-preview`}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200"
                    >
                      <p>
                        Unit {unit.unit_number} • {formatUnitStatus(unit.status)} • Available{" "}
                        {formatDateValue(unit.expected_available_date)} • {unit.timing_label}
                        {unit.gap_days !== null && Math.abs(unit.gap_days) <= 60
                          ? ` (${unit.gap_days} days)`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{unit.timing_reason}</p>
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
                  {formatDateValue(selectedDestinationUnit.expected_available_date)}.
                </p>
                <p className="mt-1 text-sm text-zinc-100">
                  Match: {selectedDestinationUnit.timing_label}
                  {selectedDestinationUnit.gap_days !== null &&
                  Math.abs(selectedDestinationUnit.gap_days) <= 60
                    ? ` (${selectedDestinationUnit.gap_days} days from preferred move-in)`
                    : ""}
                </p>
                <p className="mt-2 text-xs text-zinc-300">
                  {selectedDestinationUnit.timing_reason}
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