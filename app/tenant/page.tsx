import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  lease_start: string | null
  lease_end: string | null
  status: string | null
  property_id: string
  unit_id: string
  user_id: string | null
  organization_id: string | null
}

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  unit_number: string
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

function formatStatus(status?: string | null) {
  if (!status) return "Unknown"
  return status.replaceAll("_", " ")
}

function getStatusClasses(status?: string | null) {
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
    case "active":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    case "notice":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "moved_out":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function getRequestSummaryText(latestTransfer: TransferRow | null) {
  if (!latestTransfer) {
    return "You do not have any transfer requests yet."
  }

  const status = (latestTransfer.status ?? "").toLowerCase()

  if (status === "requested") {
    return "Your request has been submitted and is waiting for staff review."
  }

  if (status === "approved") {
    return "Your request has been approved by staff."
  }

  if (status === "scheduled") {
    return "Your request has been approved and move timing has been scheduled."
  }

  if (status === "completed") {
    return "Your transfer has been completed."
  }

  if (status === "cancelled") {
    return "Your request was denied or cancelled."
  }

  return "Your latest request status is shown below."
}

export default async function TenantHome() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect("/login")
  }

  const tenantQuery = await supabase
    .from("tenants")
    .select(
      "id, first_name, last_name, email, phone, lease_start, lease_end, status, property_id, unit_id, user_id, organization_id"
    )
    .eq("user_id", user.id)
    .single()

  if (tenantQuery.error || !tenantQuery.data) {
    return (
      <div className="min-h-screen bg-black p-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-semibold">Resident Dashboard</h1>

          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
            <p className="text-lg text-red-300">No resident record found for this login.</p>
            <p className="mt-3 text-sm text-zinc-300">Logged in as: {user.email}</p>
            <p className="mt-1 text-sm text-zinc-400">User ID: {user.id}</p>
          </div>

          <div className="mt-6">
            <Link href="/login" className="text-sm text-zinc-300 underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const tenant = tenantQuery.data as TenantRow

  const [propertyQuery, unitQuery, transfersQuery] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("id", tenant.property_id)
      .maybeSingle(),
    supabase
      .from("units")
      .select("id, unit_number")
      .eq("id", tenant.unit_id)
      .maybeSingle(),
    supabase
      .from("transfers")
      .select(
        "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, denial_reason, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
      )
      .eq("tenant_id", tenant.id)
      .order("requested_date", { ascending: false }),
  ])

  const currentProperty = (propertyQuery.data ?? null) as PropertyRow | null
  const currentUnit = (unitQuery.data ?? null) as UnitRow | null
  const transfers = (transfersQuery.data ?? []) as TransferRow[]

  const latestTransfer = transfers.length > 0 ? transfers[0] : null

  let destinationProperty: PropertyRow | null = null
  let destinationUnit: UnitRow | null = null

  if (latestTransfer) {
    const [destinationPropertyQuery, destinationUnitQuery] = await Promise.all([
      supabase
        .from("properties")
        .select("id, name")
        .eq("id", latestTransfer.to_property_id)
        .maybeSingle(),
      supabase
        .from("units")
        .select("id, unit_number")
        .eq("id", latestTransfer.to_unit_id)
        .maybeSingle(),
    ])

    destinationProperty = (destinationPropertyQuery.data ?? null) as PropertyRow | null
    destinationUnit = (destinationUnitQuery.data ?? null) as UnitRow | null
  }

  return (
    <div className="min-h-screen bg-black p-10 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
              UnitFlow
            </p>
            <h1 className="mt-2 text-4xl font-semibold">Resident Dashboard</h1>
            <p className="mt-3 text-zinc-400">
              Welcome back, {tenant.first_name}. Here is your current housing and transfer status.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tenant/request"
              className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Request Transfer
            </Link>

            <Link
              href="/tenant/requests"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
            >
              View My Requests
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Current Property</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {currentProperty?.name ?? "Unknown Property"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">Where you currently live</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Current Unit</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {currentUnit ? `Unit ${currentUnit.unit_number}` : "Unknown"}
            </p>
            <p className="mt-2 text-sm text-zinc-500">Your assigned unit</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Lease End</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {formatDateValue(tenant.lease_end)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">Current lease timeline</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-zinc-400">Latest Request Status</p>
            <div className="mt-3">
              <span
                className={`rounded-full border px-3 py-1 text-sm capitalize ${getStatusClasses(
                  latestTransfer?.status ?? tenant.status
                )}`}
              >
                {latestTransfer ? formatStatus(latestTransfer.status) : "No request"}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              {latestTransfer
                ? "Most recent transfer request"
                : "You have not submitted a transfer request yet"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Latest Transfer Request</h2>
              <p className="mt-2 text-zinc-400">{getRequestSummaryText(latestTransfer)}</p>
            </div>

            {latestTransfer ? (
              <span
                className={`rounded-full border px-3 py-1 text-sm capitalize ${getStatusClasses(
                  latestTransfer.status
                )}`}
              >
                {formatStatus(latestTransfer.status)}
              </span>
            ) : null}
          </div>

          {!latestTransfer ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-5">
              <p className="text-lg text-white">No transfer request submitted yet.</p>
              <p className="mt-2 text-sm text-zinc-400">
                When you submit a request, it will appear here and you can track its status.
              </p>
              <div className="mt-4">
                <Link
                  href="/tenant/request"
                  className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
                >
                  Start a Transfer Request
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Destination</p>
                <p className="mt-3 text-lg font-medium text-white">
                  {destinationProperty?.name ?? "Unknown Property"}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {destinationUnit ? `Unit ${destinationUnit.unit_number}` : "Unknown Unit"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Dates</p>
                <p className="mt-3 text-sm text-zinc-300">
                  Requested: {formatDateValue(latestTransfer.requested_date)}
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Move Out: {formatDateValue(latestTransfer.move_out_date)}
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Move In: {formatDateValue(latestTransfer.move_in_date)}
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Approved: {formatDateValue(latestTransfer.approved_date)}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Request Notes</p>
                <p className="mt-3 text-sm text-zinc-300">
                  {latestTransfer.notes ?? "No notes were saved for this request."}
                </p>

                {latestTransfer.denial_reason ? (
                  <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                    <p className="text-sm font-medium text-red-300">Denial Reason</p>
                    <p className="mt-2 text-sm text-red-200">{latestTransfer.denial_reason}</p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Resident Record</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Name</span>
                <span className="text-white">
                  {tenant.first_name} {tenant.last_name}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Email</span>
                <span className="text-white">{tenant.email ?? "—"}</span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Phone</span>
                <span className="text-white">{tenant.phone ?? "—"}</span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Lease Start</span>
                <span className="text-white">{formatDateValue(tenant.lease_start)}</span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Lease End</span>
                <span className="text-white">{formatDateValue(tenant.lease_end)}</span>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-zinc-400">Resident Status</span>
                <span
                  className={`rounded-full border px-3 py-1 text-xs capitalize ${getStatusClasses(
                    tenant.status
                  )}`}
                >
                  {formatStatus(tenant.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">How Transfer Requests Work</h2>

            <div className="mt-4 space-y-4 text-sm text-zinc-300">
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="font-medium text-white">1. Submit your request</p>
                <p className="mt-2 text-zinc-400">
                  Choose the property, unit, and preferred dates that work best for you.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="font-medium text-white">2. Staff reviews it</p>
                <p className="mt-2 text-zinc-400">
                  Your property team reviews timing, availability, and operations before approval.
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="font-medium text-white">3. Track the outcome</p>
                <p className="mt-2 text-zinc-400">
                  Use your dashboard and request history to see whether your request is pending,
                  approved, denied, or completed.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/tenant/request"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              >
                Request Transfer
              </Link>

              <Link
                href="/tenant/requests"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                View Request History
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}