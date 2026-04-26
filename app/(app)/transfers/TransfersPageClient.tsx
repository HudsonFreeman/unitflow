"use client"

import { useEffect, useMemo, useState } from "react"
import VacancySavingsCard from "@/components/VacancySavingsCard"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

type TransferRow = {
  id: string
  status: string
  requested_date: string
  approved_date: string | null
  move_out_date: string | null
  move_in_date: string | null
  notes: string | null
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
}

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status?: string
  monthly_rent?: number | null
}

type Props = {
  transfers: TransferRow[]
  tenants: TenantRow[]
  properties: PropertyRow[]
  units: UnitRow[]
}

type ToastType = "success" | "error"

type ToastState = {
  message: string
  type: ToastType
} | null

function getTransferStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "requested":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "approved":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    case "completed":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function formatUnitStatus(status?: string) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

export default function TransfersPageClient({
  transfers,
  tenants,
  properties,
  units,
}: Props) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [selectedToPropertyId, setSelectedToPropertyId] = useState("")
  const [selectedToUnitId, setSelectedToUnitId] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [requestedDate, setRequestedDate] = useState("")
  const [moveOutDate, setMoveOutDate] = useState("")
  const [moveInDate, setMoveInDate] = useState("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastState>(null)

  useEffect(() => {
    const storedSelectedPropertyId = getStoredSelectedPropertyId()

    if (
      storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
      properties.some((property) => property.id === storedSelectedPropertyId)
    ) {
      setSelectedPropertyId(storedSelectedPropertyId)
      setSelectedToPropertyId(
        storedSelectedPropertyId === ALL_PROPERTIES_VALUE ? "" : storedSelectedPropertyId
      )
    } else if (properties.length > 0) {
      setSelectedPropertyId(properties[0].id)
      setSelectedToPropertyId(properties[0].id)
      setStoredSelectedPropertyId(properties[0].id)
    } else {
      setSelectedPropertyId(ALL_PROPERTIES_VALUE)
      setSelectedToPropertyId("")
      setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
    }
  }, [properties])

  useEffect(() => {
    if (!toast) return

    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 2500)

    return () => window.clearTimeout(timeout)
  }, [toast])

  function clearMessages() {
    setErrorMessage("")
    setToast(null)
  }

  function showToast(message: string, type: ToastType) {
    setToast({ message, type })
  }

  function handleSelectedPropertyChange(nextPropertyId: string) {
    setSelectedPropertyId(nextPropertyId)
    setStoredSelectedPropertyId(nextPropertyId)
    setSelectedTenantId("")
    setSelectedToUnitId("")
    setSelectedToPropertyId(nextPropertyId === ALL_PROPERTIES_VALUE ? "" : nextPropertyId)
  }

  const selectedProperty =
    selectedPropertyId === ALL_PROPERTIES_VALUE
      ? null
      : properties.find((property) => property.id === selectedPropertyId) ?? null

  const scopedTenants = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return tenants
    return tenants.filter((tenant) => tenant.property_id === selectedPropertyId)
  }, [tenants, selectedPropertyId])

  const scopedTransfers = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return transfers

    return transfers.filter(
      (transfer) => transfer.from_property_id === selectedPropertyId
    )
  }, [transfers, selectedPropertyId])

  const destinationPropertyOptions = useMemo(() => {
    return properties
  }, [properties])

  const selectedTenant =
    scopedTenants.find((tenant) => tenant.id === selectedTenantId) ?? null

  const fromUnitId = selectedTenant?.unit_id ?? ""

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

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return scopedTransfers
    return scopedTransfers.filter(
      (transfer) => transfer.status.toLowerCase() === statusFilter
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

  async function handleCreateTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!selectedTenantId) {
      setErrorMessage("Tenant is required.")
      return
    }

    if (!selectedToPropertyId) {
      setErrorMessage("Destination property is required.")
      return
    }

    if (!selectedToUnitId) {
      setErrorMessage("Destination unit is required.")
      return
    }

    if (!selectedTenant) {
      setErrorMessage("Selected tenant not found.")
      return
    }

    if (selectedTenant.unit_id === selectedToUnitId) {
      setErrorMessage("Cannot transfer to the same unit.")
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
          tenant_id: selectedTenantId,
          to_property_id: selectedToPropertyId,
          to_unit_id: selectedToUnitId,
          requested_date: requestedDate || null,
          move_out_date: moveOutDate || null,
          move_in_date: moveInDate || null,
          notes: notes.trim() || null,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setErrorMessage(result?.error || "Failed to create transfer.")
        setSubmitting(false)
        return
      }

      setSelectedTenantId("")
      setSelectedToUnitId("")
      setRequestedDate("")
      setMoveOutDate("")
      setMoveInDate("")
      setNotes("")
      setSubmitting(false)
      showToast("Transfer created.", "success")

      window.location.reload()
    } catch {
      setErrorMessage("Failed to create transfer.")
      setSubmitting(false)
    }
  }

  return (
    <div>
      {toast ? (
        <div className="fixed right-4 top-4 z-50">
          <div
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                : "border-red-500/30 bg-red-500/15 text-red-200"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Transfers</h1>
          <p className="mt-2 text-zinc-400">
            {selectedProperty
              ? `Coordinate transfers for ${selectedProperty.name}.`
              : "Coordinate tenant move-outs and move-ins."}
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

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Current transfer scope</p>
        <p className="mt-1 text-lg text-white">
          {selectedProperty ? selectedProperty.name : "All Properties"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Transfer list is scoped by the tenant’s current property.
        </p>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Create Transfer</h2>

        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Property Context</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => handleSelectedPropertyChange(e.target.value)}
              className="w-full rounded bg-black p-2"
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
                setSelectedTenantId(e.target.value)
                setSelectedToUnitId("")
              }}
            >
              <option value="">
                {scopedTenants.length === 0
                  ? "No tenants in this property scope"
                  : "Select Tenant"}
              </option>
              {scopedTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.first_name} {tenant.last_name}
                </option>
              ))}
            </select>
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
              <option value="">Select Property</option>
              {destinationPropertyOptions.map((property) => (
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
                  {unit.monthly_rent ? ` — $${unit.monthly_rent}/mo` : ""}
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
            className="w-full rounded bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating Transfer..." : "Create Transfer"}
          </button>
        </form>
      </div>

      <div className="mt-6 flex gap-2">
        {[
          { key: "all", label: `All (${scopedTransfers.length})` },
          { key: "requested", label: `Requested (${requestedCount})` },
          { key: "approved", label: `Approved (${approvedCount})` },
          { key: "completed", label: `Completed (${completedCount})` },
        ].map((status) => (
          <button
            key={status.key}
            type="button"
            onClick={() => setStatusFilter(status.key)}
            className={`rounded border px-3 py-1 text-sm ${
              statusFilter === status.key
                ? "border-white/20 bg-white/10 text-white"
                : "border-zinc-700 bg-black/30 text-zinc-400"
            }`}
          >
            {status.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {filteredTransfers.map((transfer) => {
          const tenant = tenants.find((x) => x.id === transfer.tenant_id)
          const fromProperty = properties.find((p) => p.id === transfer.from_property_id)
          const toProperty = properties.find((p) => p.id === transfer.to_property_id)
          const fromUnit = units.find((unit) => unit.id === transfer.from_unit_id)
          const toUnit = units.find((unit) => unit.id === transfer.to_unit_id)
          const toUnitRent =
            toUnit?.monthly_rent === undefined ? null : toUnit.monthly_rent

          return (
            <div key={transfer.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {tenant?.first_name} {tenant?.last_name}
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    {fromProperty?.name ?? "Unknown Property"} • Unit{" "}
                    {fromUnit?.unit_number ?? "?"} →{" "}
                    {toProperty?.name ?? "Unknown Property"} • Unit{" "}
                    {toUnit?.unit_number ?? "?"}
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    Requested: {transfer.requested_date}
                  </p>

                  {transfer.approved_date ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      Approved: {transfer.approved_date}
                    </p>
                  ) : null}

                  {transfer.move_out_date || transfer.move_in_date ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      {transfer.move_out_date && transfer.move_in_date
                        ? `${transfer.move_out_date} → ${transfer.move_in_date}`
                        : transfer.move_out_date
                          ? `Move out: ${transfer.move_out_date}`
                          : `Move in: ${transfer.move_in_date}`}
                    </p>
                  ) : null}

                  {transfer.notes ? (
                    <p className="mt-2 text-sm text-zinc-400">{transfer.notes}</p>
                  ) : null}
                </div>

                <span
                  className={`rounded-full border px-3 py-1 text-xs capitalize ${getTransferStatusClasses(
                    transfer.status
                  )}`}
                >
                  {transfer.status}
                </span>
              </div>

              <div className="mt-4">
                <VacancySavingsCard
                  saved={transfer.vacancy_days_saved}
                  revenue={transfer.estimated_revenue_saved}
                  rent={toUnitRent}
                />
              </div>

              <div className="mt-3 flex gap-2">
                {transfer.status.toLowerCase() === "requested" ? (
                  <form action="/api/transfers/approve" method="POST">
                    <input type="hidden" name="transfer_id" value={transfer.id} />
                    <button className="rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700">
                      Approve
                    </button>
                  </form>
                ) : null}

                {transfer.status.toLowerCase() === "approved" ? (
                  <form action="/api/transfers/complete" method="POST">
                    <input type="hidden" name="transfer_id" value={transfer.id} />
                    <button className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                      Complete
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          )
        })}

        {filteredTransfers.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            No transfers found for this property scope and filter.
          </div>
        ) : null}
      </div>
    </div>
  )
}