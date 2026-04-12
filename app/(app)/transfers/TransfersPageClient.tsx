"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"

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
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  property_id: string
  unit_id: string
  organization_id: string
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
  status?: string
}

type OrganizationMemberRow = {
  user_id: string
  organization_id: string
  role: string
}

type TransfersPageClientProps = {
  transfers: TransferRow[]
  tenants: TenantRow[]
  properties: PropertyRow[]
  units: UnitRow[]
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

function formatUnitStatus(status?: string) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

export default function TransfersPageClient({
  transfers,
  tenants,
  properties,
  units,
}: TransfersPageClientProps) {
  const [selectedTenantId, setSelectedTenantId] = useState("")
  const [selectedToPropertyId, setSelectedToPropertyId] = useState("")
  const [selectedToUnitId, setSelectedToUnitId] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [role, setRole] = useState("")
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    async function loadMembership() {
      setRoleLoading(true)

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        setRole("")
        setRoleLoading(false)
        return
      }

      const { data, error } = await supabaseClient
        .from("organization_members")
        .select("user_id, organization_id, role")
        .eq("user_id", user.id)
        .single()

      if (error || !data) {
        setRole("")
        setRoleLoading(false)
        return
      }

      const membership = data as OrganizationMemberRow
      setRole(membership.role)
      setRoleLoading(false)
    }

    loadMembership()
  }, [])

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) ?? null

  const defaultOrganizationId = selectedTenant?.organization_id ?? ""
  const fromPropertyId = selectedTenant?.property_id ?? ""
  const fromUnitId = selectedTenant?.unit_id ?? ""

  const destinationUnits = useMemo(() => {
    if (!selectedToPropertyId) return []

    return units.filter((unit) => {
      const status = (unit.status ?? "").toLowerCase()

      return (
        unit.property_id === selectedToPropertyId &&
        unit.id !== fromUnitId &&
        (status === "vacant" ||
          status === "make_ready" ||
          status === "notice")
      )
    })
  }, [units, selectedToPropertyId, fromUnitId])

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

  return (
    <div>
      <h1 className="text-3xl font-semibold">Transfers</h1>
      <p className="mt-2 text-zinc-400">
        Coordinate tenant move-outs and move-ins.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Signed-in role</p>
        <p className="mt-1 text-lg font-medium text-white">
          {roleLoading ? "Loading role..." : role || "No role found"}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Staff can create transfer requests. Managers can approve and complete transfers.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Create Transfer Request</h2>

        <form
          action="/api/transfers"
          method="POST"
          className="grid grid-cols-1 gap-4"
        >
          <input type="hidden" name="organization_id" value={defaultOrganizationId} />
          <input type="hidden" name="from_property_id" value={fromPropertyId} />
          <input type="hidden" name="from_unit_id" value={fromUnitId} />

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Tenant</label>
            <select
              name="tenant_id"
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
                ? properties.find((property) => property.id === selectedTenant.property_id)?.name ??
                  "Unknown Property"
                : "Auto-fills after tenant selection"}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Current Unit</label>
            <div className="rounded bg-black p-2 text-zinc-300">
              {selectedTenant
                ? `Unit ${units.find((unit) => unit.id === selectedTenant.unit_id)?.unit_number ?? "?"}`
                : "Auto-fills after tenant selection"}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Destination Property</label>
            <select
              name="to_property_id"
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
              name="to_unit_id"
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
              name="requested_date"
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move Out Date</label>
            <input
              name="move_out_date"
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Move In Date</label>
            <input
              name="move_in_date"
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Notes</label>
            <textarea
              name="notes"
              placeholder="Notes"
              className="w-full rounded bg-black p-2"
              rows={3}
            />
          </div>

          <button
            type="submit"
            className="mt-2 rounded bg-blue-600 p-2 hover:bg-blue-700"
          >
            Create Transfer
          </button>
        </form>
      </div>

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
          const tenant = tenants.find((tenant) => tenant.id === transfer.tenant_id)
          const fromProperty = properties.find(
            (property) => property.id === transfer.from_property_id
          )
          const toProperty = properties.find(
            (property) => property.id === transfer.to_property_id
          )
          const fromUnit = units.find((unit) => unit.id === transfer.from_unit_id)
          const toUnit = units.find((unit) => unit.id === transfer.to_unit_id)

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

                  <p className="mt-2 text-sm text-zinc-500">
                    Requested: {transfer.requested_date}
                  </p>

                  {transfer.approved_date ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      Approved: {transfer.approved_date}
                    </p>
                  ) : null}

                  {transfer.move_out_date && transfer.move_in_date ? (
                    <p className="mt-1 text-sm text-zinc-500">
                      Move Out: {transfer.move_out_date} | Move In: {transfer.move_in_date}
                    </p>
                  ) : null}

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
                    <form action="/api/transfers/approve" method="POST">
                      <input type="hidden" name="transfer_id" value={transfer.id} />
                      <button
                        type="submit"
                        className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700"
                      >
                        Approve Transfer
                      </button>
                    </form>
                  ) : null}

                  {isManager && transfer.status.toLowerCase() === "approved" ? (
                    <form action="/api/transfers/complete" method="POST">
                      <input type="hidden" name="transfer_id" value={transfer.id} />
                      <button
                        type="submit"
                        className="rounded bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700"
                      >
                        Complete Transfer
                      </button>
                    </form>
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
    </div>
  )
}