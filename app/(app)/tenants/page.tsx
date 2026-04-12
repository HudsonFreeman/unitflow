"use client"

import { useEffect, useMemo, useState } from "react"
import { getActiveOrganizationContext } from "@/lib/active-organization"
import { supabaseClient } from "@/lib/supabase-client"

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  lease_start: string | null
  lease_end: string | null
  status: string
  property_id: string
  unit_id: string
  organization_id: string
}

type PropertyRow = {
  id: string
  name: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string
}

type ToastType = "success" | "error"

type ToastState = {
  message: string
  type: ToastType
} | null

type TenantRisk = {
  label: string
  tone: "red" | "amber" | "blue" | "zinc"
}

function getTenantStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    case "notice":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "transferred":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300"
    case "moved_out":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function getUnitStatusClasses(status: string) {
  switch (status.toLowerCase()) {
    case "occupied":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    case "vacant":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
    case "make_ready":
      return "border-orange-500/20 bg-orange-500/10 text-orange-300"
    case "notice":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    default:
      return "border-white/10 bg-white/5 text-zinc-300"
  }
}

function getRiskClasses(tone: TenantRisk["tone"]) {
  switch (tone) {
    case "red":
      return "border-red-500/20 bg-red-500/10 text-red-300"
    case "amber":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300"
    case "blue":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300"
    default:
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300"
  }
}

function formatUnitStatus(status: string) {
  return status.replaceAll("_", " ")
}

function formatDate(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString()
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

function getTenantRisks(tenant: TenantRow): TenantRisk[] {
  const risks: TenantRisk[] = []
  const leaseEndDays = getDaysUntil(tenant.lease_end)

  if (!tenant.lease_end) {
    risks.push({
      label: "No lease end date",
      tone: "zinc",
    })
  } else if (leaseEndDays !== null && leaseEndDays < 0) {
    risks.push({
      label: "Lease expired",
      tone: "red",
    })
  } else if (leaseEndDays !== null && leaseEndDays <= 30) {
    risks.push({
      label: "Lease ending soon",
      tone: "amber",
    })
  }

  if (tenant.status.toLowerCase() === "notice") {
    risks.push({
      label: "At risk of vacancy",
      tone: "red",
    })
  }

  if (!tenant.email && !tenant.phone) {
    risks.push({
      label: "Missing contact info",
      tone: "blue",
    })
  }

  return risks
}

export default function TenantsPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastState>(null)
  const [organizationId, setOrganizationId] = useState("")
  const [role, setRole] = useState("")
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [phone, setPhone] = useState("")
  const [leaseStart, setLeaseStart] = useState("")
  const [leaseEnd, setLeaseEnd] = useState("")

  const [propertyFilter, setPropertyFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchText, setSearchText] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")

  function clearMessages() {
    setErrorMessage("")
    setToast(null)
  }

  function showToast(message: string, type: ToastType) {
    setToast({ message, type })
  }

  useEffect(() => {
    if (!toast) return

    const timeout = window.setTimeout(() => {
      setToast(null)
    }, 2500)

    return () => window.clearTimeout(timeout)
  }, [toast])

  async function loadTenantsPage() {
    setLoading(true)
    setErrorMessage("")

    const context = await getActiveOrganizationContext()

    if (context.error) {
      setErrorMessage(context.error)
      setLoading(false)
      return
    }

    if (!context.userId) {
      setErrorMessage("You must be logged in to view tenants.")
      setLoading(false)
      return
    }

    if (!context.membership) {
      setErrorMessage("No organization membership found for this user.")
      setLoading(false)
      return
    }

    const orgId = context.activeOrganizationId

    setOrganizationId(orgId)
    setRole(context.membership.role)

    const [
      { data: tenantsData, error: tenantsError },
      { data: propertiesData, error: propertiesError },
      { data: unitsData, error: unitsError },
    ] = await Promise.all([
      supabaseClient
        .from("tenants")
        .select(
          "id, first_name, last_name, email, phone, lease_start, lease_end, status, property_id, unit_id, organization_id"
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false }),
      supabaseClient
        .from("properties")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
      supabaseClient
        .from("units")
        .select("id, unit_number, property_id, status")
        .eq("organization_id", orgId)
        .order("unit_number"),
    ])

    if (tenantsError || propertiesError || unitsError) {
      setErrorMessage(
        tenantsError?.message ||
          propertiesError?.message ||
          unitsError?.message ||
          "Failed to load tenants page data."
      )
      setLoading(false)
      return
    }

    setTenants((tenantsData ?? []) as TenantRow[])
    setProperties((propertiesData ?? []) as PropertyRow[])
    setUnits((unitsData ?? []) as UnitRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadTenantsPage()
  }, [])

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const unitMap = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units]
  )

  const availableUnits = useMemo(() => {
    if (!selectedPropertyId) return []

    return units.filter((unit) => {
      const status = (unit.status ?? "").toLowerCase()

      return (
        unit.property_id === selectedPropertyId &&
        ["vacant", "make_ready", "notice"].includes(status)
      )
    })
  }, [units, selectedPropertyId])

  const tenantSummaries = useMemo(() => {
    return tenants.map((tenant) => {
      const risks = getTenantRisks(tenant)
      const leaseEndDays = getDaysUntil(tenant.lease_end)

      return {
        tenant,
        risks,
        leaseEndDays,
      }
    })
  }, [tenants])

  const filteredTenantSummaries = useMemo(() => {
    return tenantSummaries.filter(({ tenant, risks }) => {
      const matchesProperty =
        propertyFilter === "all" || tenant.property_id === propertyFilter

      const matchesStatus =
        statusFilter === "all" ||
        tenant.status.toLowerCase() === statusFilter.toLowerCase()

      const search = searchText.trim().toLowerCase()
      const propertyName = propertyMap.get(tenant.property_id)?.name?.toLowerCase() ?? ""
      const unitNumber = unitMap.get(tenant.unit_id)?.unit_number?.toLowerCase() ?? ""

      const matchesSearch =
        search === "" ||
        `${tenant.first_name} ${tenant.last_name}`.toLowerCase().includes(search) ||
        (tenant.email ?? "").toLowerCase().includes(search) ||
        (tenant.phone ?? "").toLowerCase().includes(search) ||
        propertyName.includes(search) ||
        unitNumber.includes(search)

      const matchesRisk =
        riskFilter === "all" ||
        (riskFilter === "at_risk" && risks.length > 0) ||
        (riskFilter === "lease_soon" &&
          risks.some((risk) => risk.label === "Lease ending soon")) ||
        (riskFilter === "notice" &&
          tenant.status.toLowerCase() === "notice") ||
        (riskFilter === "missing_info" &&
          risks.some((risk) => risk.label === "Missing contact info"))

      return matchesProperty && matchesStatus && matchesSearch && matchesRisk
    })
  }, [tenantSummaries, propertyFilter, statusFilter, riskFilter, searchText, propertyMap, unitMap])

  const activeCount = tenants.filter(
    (tenant) => tenant.status.toLowerCase() === "active"
  ).length

  const noticeCount = tenants.filter(
    (tenant) => tenant.status.toLowerCase() === "notice"
  ).length

  const movedOutCount = tenants.filter(
    (tenant) => tenant.status.toLowerCase() === "moved_out"
  ).length

  const riskCount = tenantSummaries.filter((summary) => summary.risks.length > 0).length

  const leaseEndingSoonCount = tenantSummaries.filter((summary) =>
    summary.risks.some((risk) => risk.label === "Lease ending soon")
  ).length

  async function handleCreateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!organizationId) {
      setErrorMessage("Organization not loaded yet.")
      return
    }

    if (!selectedPropertyId) {
      setErrorMessage("Property is required.")
      return
    }

    if (!selectedUnitId) {
      setErrorMessage("Unit is required.")
      return
    }

    if (!firstName.trim()) {
      setErrorMessage("First name is required.")
      return
    }

    if (!lastName.trim()) {
      setErrorMessage("Last name is required.")
      return
    }

    const selectedUnit = units.find((unit) => unit.id === selectedUnitId)

    if (!selectedUnit) {
      setErrorMessage("Selected unit not found.")
      return
    }

    if (!["vacant", "make_ready", "notice"].includes(selectedUnit.status.toLowerCase())) {
      setErrorMessage("Selected unit is not available.")
      return
    }

    const unitAlreadyHasTenant = tenants.some((tenant) => tenant.unit_id === selectedUnitId)

    if (unitAlreadyHasTenant) {
      setErrorMessage("That unit already has a tenant.")
      return
    }

    setSubmitting(true)

    const { error: tenantInsertError } = await supabaseClient.from("tenants").insert([
      {
        organization_id: organizationId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: emailInput.trim() || null,
        phone: phone.trim() || null,
        property_id: selectedPropertyId,
        unit_id: selectedUnitId,
        lease_start: leaseStart || null,
        lease_end: leaseEnd || null,
        status: "active",
      },
    ])

    if (tenantInsertError) {
      setErrorMessage(tenantInsertError.message)
      setSubmitting(false)
      return
    }

    const { error: unitUpdateError } = await supabaseClient
      .from("units")
      .update({ status: "occupied" })
      .eq("id", selectedUnitId)

    if (unitUpdateError) {
      setErrorMessage(unitUpdateError.message)
      setSubmitting(false)
      return
    }

    setSelectedPropertyId("")
    setSelectedUnitId("")
    setFirstName("")
    setLastName("")
    setEmailInput("")
    setPhone("")
    setLeaseStart("")
    setLeaseEnd("")
    setSubmitting(false)

    showToast("Tenant created.", "success")
    await loadTenantsPage()
  }

  async function handleGiveNotice(tenantId: string) {
    clearMessages()

    const tenant = tenants.find((item) => item.id === tenantId)
    if (!tenant) {
      setErrorMessage("Tenant not found.")
      return
    }

    if (tenant.status.toLowerCase() !== "active") {
      setErrorMessage("Only active tenants can be moved to notice.")
      return
    }

    const confirmed = window.confirm(
      `Put ${tenant.first_name} ${tenant.last_name} on notice?`
    )

    if (!confirmed) return

    setActionLoadingId(tenantId)

    const { error: tenantError } = await supabaseClient
      .from("tenants")
      .update({ status: "notice" })
      .eq("id", tenantId)
      .eq("organization_id", organizationId)

    if (tenantError) {
      setErrorMessage(tenantError.message)
      setActionLoadingId("")
      return
    }

    const { error: unitError } = await supabaseClient
      .from("units")
      .update({ status: "notice" })
      .eq("id", tenant.unit_id)

    if (unitError) {
      setErrorMessage(unitError.message)
      setActionLoadingId("")
      return
    }

    setTenants((current) =>
      current.map((item) =>
        item.id === tenantId ? { ...item, status: "notice" } : item
      )
    )
    setUnits((current) =>
      current.map((item) =>
        item.id === tenant.unit_id ? { ...item, status: "notice" } : item
      )
    )

    setActionLoadingId("")
    showToast("Tenant marked as notice.", "success")
  }

  async function handleMoveOut(tenantId: string) {
    clearMessages()

    const tenant = tenants.find((item) => item.id === tenantId)
    if (!tenant) {
      setErrorMessage("Tenant not found.")
      return
    }

    if (tenant.status.toLowerCase() !== "notice") {
      setErrorMessage("Only notice tenants can be moved out.")
      return
    }

    const confirmed = window.confirm(
      `Move out ${tenant.first_name} ${tenant.last_name}? This will make the unit vacant.`
    )

    if (!confirmed) return

    setActionLoadingId(tenantId)

    const { error: tenantError } = await supabaseClient
      .from("tenants")
      .update({ status: "moved_out" })
      .eq("id", tenantId)
      .eq("organization_id", organizationId)

    if (tenantError) {
      setErrorMessage(tenantError.message)
      setActionLoadingId("")
      return
    }

    const { error: unitError } = await supabaseClient
      .from("units")
      .update({ status: "vacant" })
      .eq("id", tenant.unit_id)

    if (unitError) {
      setErrorMessage(unitError.message)
      setActionLoadingId("")
      return
    }

    setTenants((current) =>
      current.map((item) =>
        item.id === tenantId ? { ...item, status: "moved_out" } : item
      )
    )
    setUnits((current) =>
      current.map((item) =>
        item.id === tenant.unit_id ? { ...item, status: "vacant" } : item
      )
    )

    setActionLoadingId("")
    showToast("Tenant moved out.", "success")
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Tenants</h1>
        <p className="mt-4 text-zinc-400">Loading tenants...</p>
      </div>
    )
  }

  if (errorMessage && tenants.length === 0 && properties.length === 0 && units.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Tenants</h1>
        <p className="mt-4 text-red-500">{errorMessage}</p>
      </div>
    )
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

      <h1 className="text-3xl font-semibold">Tenants</h1>
      <p className="mt-2 text-zinc-400">
        Track tenant profiles, lease timelines, and vacancy risk for your active organization.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Organization ID</p>
        <p className="mt-1 text-sm text-zinc-200 break-all">{organizationId}</p>
        <p className="mt-3 text-sm text-zinc-400">Role</p>
        <p className="mt-1 text-sm capitalize text-zinc-200">{role}</p>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Total Tenants</p>
          <p className="mt-3 text-3xl font-semibold">{tenants.length}</p>
          <p className="mt-2 text-sm text-zinc-500">All tenant records</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Active</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-300">{activeCount}</p>
          <p className="mt-2 text-sm text-zinc-500">Currently housed residents</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">On Notice</p>
          <p className="mt-3 text-3xl font-semibold text-amber-300">{noticeCount}</p>
          <p className="mt-2 text-sm text-zinc-500">Potential vacancy exposure</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Lease Ending Soon</p>
          <p className="mt-3 text-3xl font-semibold">{leaseEndingSoonCount}</p>
          <p className="mt-2 text-sm text-zinc-500">Within the next 30 days</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">At Risk</p>
          <p className="mt-3 text-3xl font-semibold text-red-300">{riskCount}</p>
          <p className="mt-2 text-sm text-zinc-500">
            Includes notice, expiring, or incomplete records
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-xl font-semibold">Add Tenant</h2>

        <form onSubmit={handleCreateTenant} className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Property</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => {
                setSelectedPropertyId(e.target.value)
                setSelectedUnitId("")
              }}
              className="w-full rounded bg-black p-2"
            >
              <option value="">Select Property</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Unit</label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full rounded bg-black p-2"
              disabled={!selectedPropertyId}
            >
              <option value="">
                {!selectedPropertyId
                  ? "Select Property First"
                  : availableUnits.length === 0
                  ? "No available units"
                  : "Select Unit"}
              </option>
              {availableUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  Unit {unit.unit_number} — {formatUnitStatus(unit.status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">First Name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Last Name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Email</label>
            <input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Email"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Lease Start</label>
            <input
              value={leaseStart}
              onChange={(e) => setLeaseStart(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-400">Lease End</label>
            <input
              value={leaseEnd}
              onChange={(e) => setLeaseEnd(e.target.value)}
              placeholder="YYYY-MM-DD"
              className="w-full rounded bg-black p-2"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Tenant"}
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Tenant Filters</h2>
          <p className="text-sm text-zinc-500">
            {filteredTenantSummaries.length} shown
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search tenant, email, property, or unit"
            className="rounded bg-black p-2"
          />

          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="rounded bg-black p-2"
          >
            <option value="all">All Properties</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded bg-black p-2"
          >
            <option value="all">All Statuses</option>
            <option value="active">active</option>
            <option value="notice">notice</option>
            <option value="moved_out">moved_out</option>
            <option value="transferred">transferred</option>
          </select>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded bg-black p-2"
          >
            <option value="all">All Risk Levels</option>
            <option value="at_risk">At risk</option>
            <option value="lease_soon">Lease ending soon</option>
            <option value="notice">On notice</option>
            <option value="missing_info">Missing contact info</option>
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-xl font-semibold">Available Units</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {units.filter((unit) =>
            ["vacant", "make_ready", "notice"].includes(unit.status.toLowerCase())
          ).length === 0 ? (
            <p className="text-sm text-zinc-500">No available units right now.</p>
          ) : (
            units
              .filter((unit) =>
                ["vacant", "make_ready", "notice"].includes(unit.status.toLowerCase())
              )
              .map((unit) => {
                const property = propertyMap.get(unit.property_id)

                return (
                  <span
                    key={unit.id}
                    className={`rounded-full border px-3 py-1 text-sm ${getUnitStatusClasses(
                      unit.status
                    )}`}
                  >
                    {property?.name ?? "Unknown Property"} • Unit {unit.unit_number} —{" "}
                    {formatUnitStatus(unit.status)}
                  </span>
                )
              })
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {filteredTenantSummaries.map(({ tenant, risks, leaseEndDays }) => {
          const property = propertyMap.get(tenant.property_id)
          const unit = unitMap.get(tenant.unit_id)
          const status = tenant.status.toLowerCase()
          const isActionLoading = actionLoadingId === tenant.id

          return (
            <div
              key={tenant.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-medium">
                      {tenant.first_name} {tenant.last_name}
                    </h2>

                    <div
                      className={`rounded-full border px-3 py-1 text-sm capitalize ${getTenantStatusClasses(
                        tenant.status
                      )}`}
                    >
                      {tenant.status}
                    </div>
                  </div>

                  <p className="mt-2 text-zinc-300">
                    {property?.name ?? "Unknown Property"} • Unit{" "}
                    {unit?.unit_number ?? "?"}
                  </p>

                  {tenant.email ? (
                    <p className="mt-2 text-sm text-zinc-400">{tenant.email}</p>
                  ) : null}

                  {tenant.phone ? (
                    <p className="mt-1 text-sm text-zinc-400">{tenant.phone}</p>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-zinc-500">Lease Start</p>
                      <p className="mt-1 text-sm text-zinc-200">{formatDate(tenant.lease_start)}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-zinc-500">Lease End</p>
                      <p className="mt-1 text-sm text-zinc-200">{formatDate(tenant.lease_end)}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-zinc-500">Days to Lease End</p>
                      <p className="mt-1 text-sm text-zinc-200">
                        {leaseEndDays === null ? "—" : leaseEndDays}
                      </p>
                    </div>
                  </div>

                  {risks.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {risks.map((risk) => (
                        <span
                          key={`${tenant.id}-${risk.label}`}
                          className={`rounded-full border px-3 py-1 text-xs ${getRiskClasses(
                            risk.tone
                          )}`}
                        >
                          {risk.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4">
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                        Stable tenant record
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-3">
                  {status === "active" ? (
                    <button
                      type="button"
                      onClick={() => handleGiveNotice(tenant.id)}
                      disabled={isActionLoading}
                      className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-700 disabled:opacity-60"
                    >
                      {isActionLoading ? "Updating..." : "Give Notice"}
                    </button>
                  ) : null}

                  {status === "notice" ? (
                    <button
                      type="button"
                      onClick={() => handleMoveOut(tenant.id)}
                      disabled={isActionLoading}
                      className="rounded bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-60"
                    >
                      {isActionLoading ? "Updating..." : "Move Out"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {filteredTenantSummaries.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            No tenants match your current filters.
          </div>
        ) : null}
      </div>
    </div>
  )
}