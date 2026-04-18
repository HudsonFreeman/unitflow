"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabaseClient } from "@/lib/supabase-client"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

type PropertyRow = {
  id: string
  name: string
  created_by: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string | null
  created_by: string
}

type TenantRow = {
  id: string
  first_name: string
  last_name: string
  status: string
  property_id: string
  unit_id: string
  created_by: string
}

type TransferRow = {
  id: string
  status: string
  requested_date: string | null
  approved_date: string | null
  move_out_date: string | null
  move_in_date: string | null
  notes: string | null
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
  created_at: string
  created_by: string
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

function getUnitStatusClasses(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "occupied":
      return "text-emerald-300"
    case "vacant":
      return "text-zinc-300"
    case "make_ready":
      return "text-orange-300"
    case "notice":
      return "text-amber-300"
    default:
      return "text-zinc-400"
  }
}

function formatTransferWindow(moveOutDate?: string | null, moveInDate?: string | null) {
  if (moveOutDate && moveInDate) {
    return `${moveOutDate} → ${moveInDate}`
  }
  if (moveOutDate) {
    return `Move out: ${moveOutDate}`
  }
  if (moveInDate) {
    return `Move in: ${moveInDate}`
  }
  return "Dates not scheduled"
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getScoreToneClasses(score: number) {
  if (score >= 80) return "text-emerald-300"
  if (score >= 60) return "text-blue-300"
  if (score >= 40) return "text-amber-300"
  return "text-red-300"
}

function getBarToneClasses(score: number) {
  if (score >= 80) return "bg-emerald-500/80"
  if (score >= 60) return "bg-blue-500/80"
  if (score >= 40) return "bg-amber-500/80"
  return "bg-red-500/80"
}

function getMetricToneClasses(value: number, reverse = false) {
  if (reverse) {
    if (value <= 10) return "text-emerald-300"
    if (value <= 25) return "text-blue-300"
    if (value <= 40) return "text-amber-300"
    return "text-red-300"
  }
  if (value >= 80) return "text-emerald-300"
  if (value >= 60) return "text-blue-300"
  if (value >= 40) return "text-amber-300"
  return "text-red-300"
}

async function fetchAllProperties(): Promise<PropertyRow[]> {
  const pageSize = 1000
  let from = 0
  let keepGoing = true
  const allRows: PropertyRow[] = []

  while (keepGoing) {
    const { data, error } = await supabaseClient
      .from("properties")
      .select("id, name, created_by")
      .order("id")
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as PropertyRow[]
    allRows.push(...rows)

    if (rows.length < pageSize) {
      keepGoing = false
    } else {
      from += pageSize
    }
  }

  return allRows
}

async function fetchAllUnits(): Promise<UnitRow[]> {
  const pageSize = 1000
  let from = 0
  let keepGoing = true
  const allRows: UnitRow[] = []

  while (keepGoing) {
    const { data, error } = await supabaseClient
      .from("units")
      .select("id, unit_number, property_id, status, created_by")
      .order("id")
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as UnitRow[]
    allRows.push(...rows)

    if (rows.length < pageSize) {
      keepGoing = false
    } else {
      from += pageSize
    }
  }

  return allRows
}

async function fetchAllTenants(): Promise<TenantRow[]> {
  const pageSize = 1000
  let from = 0
  let keepGoing = true
  const allRows: TenantRow[] = []

  while (keepGoing) {
    const { data, error } = await supabaseClient
      .from("tenants")
      .select("id, first_name, last_name, status, property_id, unit_id, created_by")
      .order("id")
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as TenantRow[]
    allRows.push(...rows)

    if (rows.length < pageSize) {
      keepGoing = false
    } else {
      from += pageSize
    }
  }

  return allRows
}

async function fetchAllTransfers(): Promise<TransferRow[]> {
  const pageSize = 1000
  let from = 0
  let keepGoing = true
  const allRows: TransferRow[] = []

  while (keepGoing) {
    const { data, error } = await supabaseClient
      .from("transfers")
      .select(
        "id, status, requested_date, approved_date, move_out_date, move_in_date, notes, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id, created_at, created_by"
      )
      .order("id")
      .range(from, from + pageSize - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as TransferRow[]
    allRows.push(...rows)

    if (rows.length < pageSize) {
      keepGoing = false
    } else {
      from += pageSize
    }
  }

  return allRows
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [transfers, setTransfers] = useState<TransferRow[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      setErrorMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser()

      if (userError || !user) {
        setErrorMessage("You must be logged in to view the dashboard.")
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (profileError) {
        setErrorMessage(profileError.message)
        setLoading(false)
        return
      }

      if (!profile) {
        router.replace("/create-profile")
        return
      }

      try {
        const [nextProperties, nextUnits, nextTenants, nextTransfers] = await Promise.all([
          fetchAllProperties(),
          fetchAllUnits(),
          fetchAllTenants(),
          fetchAllTransfers(),
        ])

        setProperties(nextProperties)
        setUnits(nextUnits)
        setTenants(nextTenants)
        setTransfers(nextTransfers)

        const storedSelectedPropertyId = getStoredSelectedPropertyId()

        if (
          storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
          nextProperties.some((property) => property.id === storedSelectedPropertyId)
        ) {
          setSelectedPropertyId(storedSelectedPropertyId)
        } else {
          setSelectedPropertyId(ALL_PROPERTIES_VALUE)
          setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
        }

        setLoading(false)
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load dashboard data."
        )
        setLoading(false)
      }
    }

    loadDashboard()
  }, [router])

  useEffect(() => {
    function handlePropertyChange(e: Event) {
      const customEvent = e as CustomEvent<{ propertyId: string }>
      const newPropertyId = customEvent.detail?.propertyId ?? ALL_PROPERTIES_VALUE
      setSelectedPropertyId(newPropertyId)
    }

    window.addEventListener("propertyChanged", handlePropertyChange)
    return () => window.removeEventListener("propertyChanged", handlePropertyChange)
  }, [])

  function handleSelectedPropertyChange(nextPropertyId: string) {
    setSelectedPropertyId(nextPropertyId)
    setStoredSelectedPropertyId(nextPropertyId)
  }

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const tenantMap = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants]
  )

  const selectedProperty =
    selectedPropertyId === ALL_PROPERTIES_VALUE
      ? null
      : properties.find((property) => property.id === selectedPropertyId) ?? null

  const scopedUnits = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return units
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const scopedTenants = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return tenants
    return tenants.filter((tenant) => tenant.property_id === selectedPropertyId)
  }, [tenants, selectedPropertyId])

  const scopedTransfers = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return transfers
    return transfers.filter(
      (transfer) =>
        transfer.from_property_id === selectedPropertyId ||
        transfer.to_property_id === selectedPropertyId
    )
  }, [transfers, selectedPropertyId])

  const totalUnits = scopedUnits.length
  const occupiedUnits = scopedUnits.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "occupied"
  ).length
  const vacantUnits = scopedUnits.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "vacant"
  ).length
  const makeReadyUnits = scopedUnits.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "make_ready"
  ).length
  const noticeUnits = scopedUnits.filter(
    (unit) => (unit.status ?? "").toLowerCase() === "notice"
  ).length

  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const requestedTransfers = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "requested"
  ).length
  const approvedTransfers = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "approved"
  ).length
  const completedTransfers = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "completed"
  ).length
  const scheduledTransfers = scopedTransfers.filter(
    (transfer) => transfer.status.toLowerCase() === "scheduled"
  ).length

  const openTransfers = requestedTransfers + approvedTransfers + scheduledTransfers

  const activeTenants = scopedTenants.filter(
    (tenant) => tenant.status.toLowerCase() === "active"
  ).length
  const noticeTenants = scopedTenants.filter(
    (tenant) => tenant.status.toLowerCase() === "notice"
  ).length
  const movedOutTenants = scopedTenants.filter(
    (tenant) => tenant.status.toLowerCase() === "moved_out"
  ).length

  const recentTransfers = useMemo(() => {
    return [...scopedTransfers]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
  }, [scopedTransfers])

  const propertySummaries = useMemo(() => {
    const propertiesToShow =
      selectedPropertyId === ALL_PROPERTIES_VALUE
        ? properties
        : properties.filter((property) => property.id === selectedPropertyId)

    return propertiesToShow.map((property) => {
      const propertyUnits = units.filter((unit) => unit.property_id === property.id)
      const propertyTenants = tenants.filter((tenant) => tenant.property_id === property.id)
      const propertyOccupiedUnits = propertyUnits.filter(
        (unit) => (unit.status ?? "").toLowerCase() === "occupied"
      ).length

      const propertyOccupancy =
        propertyUnits.length > 0
          ? Math.round((propertyOccupiedUnits / propertyUnits.length) * 100)
          : 0

      return {
        property,
        totalUnits: propertyUnits.length,
        occupiedUnits: propertyOccupiedUnits,
        tenants: propertyTenants.length,
        occupancy: propertyOccupancy,
      }
    })
  }, [properties, units, tenants, selectedPropertyId])

  const setupChecklist = [
    {
      label: selectedProperty ? "Property selected" : "Create your first property",
      done:
        selectedPropertyId === ALL_PROPERTIES_VALUE
          ? properties.length > 0
          : Boolean(selectedProperty),
      href: "/properties",
    },
    {
      label: "Add your first unit",
      done: scopedUnits.length > 0,
      href: "/properties",
    },
    {
      label: "Add your first tenant",
      done: scopedTenants.length > 0,
      href: "/tenants",
    },
    {
      label: "Create your first transfer",
      done: scopedTransfers.length > 0,
      href: "/transfers",
    },
  ]

  const operationalHealthScore = useMemo(() => {
    if (totalUnits === 0) return 0
    const vacancyPenalty = vacantUnits * 9
    const noticePenalty = noticeUnits * 6
    const transferPenalty = Math.max(0, openTransfers - completedTransfers) * 2
    return clampScore(occupancyRate - vacancyPenalty - noticePenalty - transferPenalty)
  }, [totalUnits, vacantUnits, noticeUnits, openTransfers, completedTransfers, occupancyRate])

  const vacancyRiskScore = useMemo(() => {
    if (totalUnits === 0) return 0
    const exposureUnits = vacantUnits + noticeUnits + makeReadyUnits * 0.5
    return clampScore((exposureUnits / totalUnits) * 100)
  }, [totalUnits, vacantUnits, noticeUnits, makeReadyUnits])

  const transferReadinessScore = useMemo(() => {
    if (totalUnits === 0) return 0
    const readyUnits = vacantUnits + makeReadyUnits + noticeUnits
    const readinessBase = (readyUnits / totalUnits) * 100
    const openTransferBonus = Math.min(openTransfers * 6, 20)
    return clampScore(readinessBase + openTransferBonus)
  }, [totalUnits, vacantUnits, makeReadyUnits, noticeUnits, openTransfers])

  const transferCompletionRate = useMemo(() => {
    const totalTransferActivity = requestedTransfers + approvedTransfers + scheduledTransfers + completedTransfers
    if (totalTransferActivity === 0) return 0
    return Math.round((completedTransfers / totalTransferActivity) * 100)
  }, [requestedTransfers, approvedTransfers, scheduledTransfers, completedTransfers])

  const makeReadyShare = useMemo(() => {
    if (totalUnits === 0) return 0
    return Math.round((makeReadyUnits / totalUnits) * 100)
  }, [makeReadyUnits, totalUnits])

  const noticePressure = useMemo(() => {
    if (scopedTenants.length === 0) return 0
    return Math.round((noticeTenants / scopedTenants.length) * 100)
  }, [scopedTenants.length, noticeTenants])

  const activeTransferPressure = useMemo(() => {
    if (scopedTenants.length === 0) return 0
    return Math.round((openTransfers / scopedTenants.length) * 100)
  }, [scopedTenants.length, openTransfers])

  const analyticsCards = [
    {
      title: "Operational Health",
      value: `${operationalHealthScore}`,
      suffix: "/100",
      subtext:
        operationalHealthScore >= 80
          ? "Property is operating cleanly"
          : operationalHealthScore >= 60
          ? "Stable, but worth watching"
          : operationalHealthScore >= 40
          ? "Pressure is building"
          : "Needs immediate attention",
      valueClasses: getScoreToneClasses(operationalHealthScore),
      barValue: operationalHealthScore,
      barClasses: getBarToneClasses(operationalHealthScore),
    },
    {
      title: "Vacancy Risk",
      value: `${vacancyRiskScore}`,
      suffix: "/100",
      subtext:
        vacancyRiskScore <= 10
          ? "Low vacancy exposure"
          : vacancyRiskScore <= 25
          ? "Manageable risk"
          : vacancyRiskScore <= 40
          ? "Growing exposure"
          : "High risk of lost revenue",
      valueClasses: getMetricToneClasses(100 - vacancyRiskScore),
      barValue: vacancyRiskScore,
      barClasses: getBarToneClasses(100 - vacancyRiskScore),
    },
    {
      title: "Transfer Readiness",
      value: `${transferReadinessScore}`,
      suffix: "/100",
      subtext:
        transferReadinessScore >= 80
          ? "Strong move options available"
          : transferReadinessScore >= 60
          ? "Good operational flexibility"
          : transferReadinessScore >= 40
          ? "Limited move options"
          : "Thin transfer inventory",
      valueClasses: getScoreToneClasses(transferReadinessScore),
      barValue: transferReadinessScore,
      barClasses: getBarToneClasses(transferReadinessScore),
    },
  ]

  const metricTiles = [
    {
      title: "Transfer Completion",
      value: `${transferCompletionRate}%`,
      tone: getMetricToneClasses(transferCompletionRate),
      subtext: `${completedTransfers} completed out of total transfer activity`,
    },
    {
      title: "Notice Pressure",
      value: `${noticePressure}%`,
      tone: getMetricToneClasses(100 - noticePressure),
      subtext: `${noticeTenants} tenant${noticeTenants === 1 ? "" : "s"} on notice`,
    },
    {
      title: "Make Ready Share",
      value: `${makeReadyShare}%`,
      tone: getMetricToneClasses(100 - makeReadyShare),
      subtext: `${makeReadyUnits} unit${makeReadyUnits === 1 ? "" : "s"} currently make-ready`,
    },
    {
      title: "Transfer Pressure",
      value: `${activeTransferPressure}%`,
      tone: getMetricToneClasses(100 - activeTransferPressure),
      subtext: `${openTransfers} open transfer${openTransfers === 1 ? "" : "s"} in progress`,
    },
  ]

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-zinc-400">Loading dashboard...</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-4 text-red-500">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-zinc-400">
            {selectedProperty
              ? `Live view for ${selectedProperty.name}.`
              : "Live portfolio view for your properties, units, tenants, and transfers."}
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

          <Link
            href="/transfers"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Create Transfer
          </Link>
          <Link
            href="/properties"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Add Property
          </Link>
          <Link
            href="/tenants"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            Add Tenant
          </Link>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-zinc-400">Current Scope</p>
            <p className="mt-1 text-sm text-zinc-200">
              {selectedProperty ? selectedProperty.name : "All Properties"}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-400">System</p>
            <p className="mt-1 text-sm text-zinc-200">Property Operations Platform</p>
          </div>
          <div>
            <p className="text-sm text-zinc-400">Focus</p>
            <p className="mt-1 text-sm text-zinc-200">
              Coordinated internal tenant transfers
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Property Analytics</h2>
            <p className="mt-1 text-sm text-zinc-500">
              A live health report for the currently selected property scope.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-400">
            {selectedProperty ? "Property View" : "Portfolio View"}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {analyticsCards.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-400">{card.title}</p>
                  <p className={`mt-2 text-3xl font-semibold ${card.valueClasses}`}>
                    {card.value}
                    <span className="ml-1 text-base text-zinc-500">{card.suffix}</span>
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${card.barClasses}`}
                  style={{ width: `${card.barValue}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-zinc-500">{card.subtext}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricTiles.map((metric) => (
            <div
              key={metric.title}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <p className="text-sm text-zinc-400">{metric.title}</p>
              <p className={`mt-2 text-2xl font-semibold ${metric.tone}`}>{metric.value}</p>
              <p className="mt-2 text-sm text-zinc-500">{metric.subtext}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-lg font-semibold">Action Center</h2>
        <div className="mt-4 space-y-3">
          {vacantUnits > 0 ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="font-medium text-red-300">
                {vacantUnits} vacant unit{vacantUnits === 1 ? "" : "s"} generating no revenue
              </p>
              <p className="mt-1 text-sm text-red-200">
                Review properties and start transfers to reduce empty-unit gaps.
              </p>
              <Link
                href="/properties"
                className="mt-2 inline-block text-xs text-red-200 hover:text-white"
              >
                View units →
              </Link>
            </div>
          ) : null}

          {noticeTenants > 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="font-medium text-amber-300">
                {noticeTenants} tenant{noticeTenants === 1 ? "" : "s"} on notice
              </p>
              <p className="mt-1 text-sm text-amber-200">
                Plan transfers early before notice turns into vacancy loss.
              </p>
              <Link
                href="/tenants"
                className="mt-2 inline-block text-xs text-amber-200 hover:text-white"
              >
                Review tenants →
              </Link>
            </div>
          ) : null}

          {vacantUnits > 0 && scopedTenants.length > 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="font-medium text-emerald-300">
                You have vacant units and active tenants — transfers can reduce vacancy.
              </p>
              <p className="mt-1 text-sm text-emerald-200">
                Move quickly to keep occupancy aligned across the portfolio.
              </p>
              <Link
                href="/transfers"
                className="mt-2 inline-block text-xs text-emerald-200 hover:text-white"
              >
                Start transfer →
              </Link>
            </div>
          ) : null}

          {vacantUnits === 0 && noticeTenants === 0 ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="font-medium text-blue-300">No immediate issues detected</p>
              <p className="mt-1 text-sm text-blue-200">
                No vacancy risk or notice pressure is showing right now.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Occupancy Rate</p>
          <p className="mt-3 text-3xl font-semibold">{occupancyRate}%</p>
          <p className="mt-2 text-sm text-zinc-500">
            {occupiedUnits} occupied out of {totalUnits} units
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Open Transfers</p>
          <p className="mt-3 text-3xl font-semibold">{openTransfers}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {requestedTransfers} requested • {approvedTransfers} approved • {scheduledTransfers} scheduled
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Tenant Health</p>
          <p className="mt-3 text-3xl font-semibold">{activeTenants}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {noticeTenants} on notice • {movedOutTenants} moved out
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">
            {selectedProperty ? "Property" : "Properties"}
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {selectedProperty ? 1 : properties.length}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {completedTransfers} completed transfers total
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Portfolio Snapshot</h2>
            <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
              View
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Total Units</span>
              <span className="font-medium">{totalUnits}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Occupied</span>
              <span className="font-medium">{occupiedUnits}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Vacant</span>
              <span className="font-medium">{vacantUnits}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Make Ready</span>
              <span className="font-medium">{makeReadyUnits}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-zinc-300">Notice Units</span>
              <span className="font-medium">{noticeUnits}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Transfers</h2>
            <Link href="/transfers" className="text-sm text-blue-400 hover:text-blue-300">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentTransfers.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No transfers yet.
              </div>
            ) : (
              recentTransfers.map((transfer) => {
                const tenant = tenantMap.get(transfer.tenant_id)
                const fromProperty = propertyMap.get(transfer.from_property_id)
                const toProperty = propertyMap.get(transfer.to_property_id)

                return (
                  <div
                    key={transfer.id}
                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {tenant
                            ? `${tenant.first_name} ${tenant.last_name}`
                            : "Unknown Tenant"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {fromProperty?.name ?? "Unknown Property"} →{" "}
                          {toProperty?.name ?? "Unknown Property"}
                        </p>
                        <p className="mt-2 text-xs text-zinc-500">
                          {formatTransferWindow(transfer.move_out_date, transfer.move_in_date)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs capitalize ${getTransferStatusClasses(
                          transfer.status
                        )}`}
                      >
                        {transfer.status}
                      </span>
                    </div>
                    {transfer.notes ? (
                      <p className="mt-3 text-sm text-zinc-400">{transfer.notes}</p>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedProperty ? "Selected Property Performance" : "Property Performance"}
            </h2>
            <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
              Manage
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {propertySummaries.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                No properties created yet.
              </div>
            ) : (
              propertySummaries.map((summary) => (
                <div
                  key={summary.property.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{summary.property.name}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {summary.totalUnits} units • {summary.tenants} tenants
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{summary.occupancy}%</p>
                      <p className="text-xs text-zinc-500">occupied</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${getBarToneClasses(summary.occupancy)}`}
                      style={{ width: `${summary.occupancy}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Setup Checklist</h2>
            <span className="text-sm text-zinc-500">
              {setupChecklist.filter((item) => item.done).length}/{setupChecklist.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {setupChecklist.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {item.done ? "Completed" : "Still needed"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      item.done
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {item.done ? "Done" : "Pending"}
                  </span>
                  {!item.done ? (
                    <Link
                      href={item.href}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                    >
                      Go
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Unit Status Board</h2>
          <Link href="/properties" className="text-sm text-blue-400 hover:text-blue-300">
            Open properties
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scopedUnits.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              No units found yet.
            </div>
          ) : (
            scopedUnits.slice(0, 12).map((unit) => {
              const property = propertyMap.get(unit.property_id)
              const tenant = scopedTenants.find((item) => item.unit_id === unit.id)

              return (
                <div
                  key={unit.id}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <p className="font-medium">
                    {property?.name ?? "Unknown Property"} • Unit {unit.unit_number}
                  </p>
                  <p className={`mt-2 text-sm ${getUnitStatusClasses(unit.status)}`}>
                    {unit.status?.replaceAll("_", " ") ?? "unknown"}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    {tenant
                      ? `${tenant.first_name} ${tenant.last_name}`
                      : "No assigned tenant"}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}