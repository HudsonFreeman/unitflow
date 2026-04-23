"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabaseClient } from "@/lib/supabase-client"

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  property_id: string
  unit_id: string
  user_id: string | null
}

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
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

function formatDateValue(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function getStatusClasses(status: string) {
  switch ((status ?? "").toLowerCase()) {
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

export default function TenantRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [tenant, setTenant] = useState<TenantRow | null>(null)
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  useEffect(() => {
    async function loadPage() {
      setLoading(true)
      setErrorMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        setErrorMessage("You must be logged in to view your requests.")
        setLoading(false)
        return
      }

      const tenantQuery = await supabaseClient
        .from("tenants")
        .select("id, first_name, last_name, property_id, unit_id, user_id")
        .eq("user_id", user.id)
        .single()

      if (tenantQuery.error || !tenantQuery.data) {
        setErrorMessage("Tenant record not found for this login.")
        setLoading(false)
        return
      }

      const nextTenant = tenantQuery.data as TenantRow
      setTenant(nextTenant)

      const [transfersQuery, propertiesQuery, unitsQuery] = await Promise.all([
        supabaseClient
          .from("transfers")
          .select(
            "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, denial_reason, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
          )
          .eq("tenant_id", nextTenant.id)
          .order("requested_date", { ascending: false }),
        supabaseClient.from("properties").select("id, name").order("name"),
        supabaseClient.from("units").select("id, unit_number, property_id").order("unit_number"),
      ])

      if (transfersQuery.error) {
        setErrorMessage(transfersQuery.error.message)
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

      setTransfers((transfersQuery.data ?? []) as TransferRow[])
      setProperties((propertiesQuery.data ?? []) as PropertyRow[])
      setUnits((unitsQuery.data ?? []) as UnitRow[])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        <h1 className="text-4xl">My Requests</h1>
        <p className="mt-6 text-zinc-400">Loading your requests...</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        <h1 className="text-4xl">My Requests</h1>
        <p className="mt-6 text-red-400">{errorMessage}</p>
        <div className="mt-6 flex gap-4">
          <Link href="/tenant" className="text-sm text-zinc-300 underline">
            Back to portal
          </Link>
          <Link href="/tenant/request" className="text-sm text-zinc-300 underline">
            Request a transfer
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl">My Requests</h1>
            <p className="mt-3 text-zinc-400">
              Track the status of your submitted transfer requests.
            </p>
          </div>

          <div className="flex gap-4">
            <Link href="/tenant" className="text-sm text-zinc-300 underline">
              Back to portal
            </Link>
            <Link href="/tenant/request" className="text-sm text-zinc-300 underline">
              New request
            </Link>
          </div>
        </div>

        {tenant ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Tenant</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {tenant.first_name} {tenant.last_name}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Current property: {propertyMap.get(tenant.property_id)?.name ?? "Unknown Property"} •
              Current unit: Unit {unitMap.get(tenant.unit_id)?.unit_number ?? "?"}
            </p>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {transfers.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg text-white">No transfer requests yet.</p>
              <p className="mt-2 text-sm text-zinc-400">
                When you submit a request, it will show here.
              </p>
            </div>
          ) : (
            transfers.map((transfer) => {
              const fromProperty = propertyMap.get(transfer.from_property_id)
              const toProperty = propertyMap.get(transfer.to_property_id)
              const fromUnit = unitMap.get(transfer.from_unit_id)
              const toUnit = unitMap.get(transfer.to_unit_id)

              return (
                <div
                  key={transfer.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {fromProperty?.name ?? "Unknown Property"} Unit {fromUnit?.unit_number ?? "?"}
                        {" → "}
                        {toProperty?.name ?? "Unknown Property"} Unit {toUnit?.unit_number ?? "?"}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                          Requested: {formatDateValue(transfer.requested_date)}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                          Move out: {formatDateValue(transfer.move_out_date)}
                        </span>

                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                          Move in: {formatDateValue(transfer.move_in_date)}
                        </span>

                        {transfer.approved_date ? (
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                            Approved: {formatDateValue(transfer.approved_date)}
                          </span>
                        ) : null}
                      </div>

                      {transfer.notes ? (
                        <p className="mt-4 text-sm text-zinc-400">{transfer.notes}</p>
                      ) : null}

                      {transfer.denial_reason ? (
                        <p className="mt-3 text-sm text-red-300">
                          Denial reason: {transfer.denial_reason}
                        </p>
                      ) : null}
                    </div>

                    <div
                      className={`rounded-full border px-3 py-1 text-sm capitalize ${getStatusClasses(
                        transfer.status
                      )}`}
                    >
                      {transfer.status}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}