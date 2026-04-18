"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

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
  created_by: string
}

type PropertyRow = {
  id: string
  name: string
  created_by: string
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string
  created_by: string
}

type ToastType = "success" | "error"

type ToastState = {
  message: string
  type: ToastType
} | null

type TenantRisk = {
  label: string
  tone: "red" | "amber" | "blue" | "zinc" | "emerald"
}

type QuickView = "all" | "action_needed" | "lease_soon" | "notice" | "missing_info"

type BulkTenantCsvRow = {
  lineNumber: number
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  leaseStart: string | null
  leaseEnd: string | null
  propertyName: string | null
  unitNumber: string
  status: "active" | "notice"
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
    case "emerald":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
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

function getDaysRemainingLabel(days: number | null) {
  if (days === null) return "—"
  if (days < 0) return "Expired"
  if (days === 0) return "Today"
  if (days === 1) return "1 day"
  return `${days} days`
}

function getDaysRemainingClasses(days: number | null) {
  if (days === null) return "text-zinc-400"
  if (days < 0) return "text-red-300"
  if (days <= 30) return "text-amber-300"
  return "text-zinc-200"
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

  if (risks.length === 0) {
    risks.push({
      label: "Stable",
      tone: "emerald",
    })
  }

  return risks
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function cleanCsvValue(value?: string) {
  if (!value) return ""
  return value.trim().replace(/^"(.*)"$/, "$1").trim()
}

function parseBulkTenantCsv(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error(
      "CSV must include a header row and at least one tenant row."
    )
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader)

  const firstNameIndex = headers.findIndex((header) =>
    ["firstname", "first"].includes(header)
  )
  const lastNameIndex = headers.findIndex((header) =>
    ["lastname", "last"].includes(header)
  )
  const emailIndex = headers.findIndex((header) => header === "email")
  const phoneIndex = headers.findIndex((header) => header === "phone")
  const leaseStartIndex = headers.findIndex((header) =>
    ["leasestart", "startdate"].includes(header)
  )
  const leaseEndIndex = headers.findIndex((header) =>
    ["leaseend", "enddate"].includes(header)
  )
  const propertyIndex = headers.findIndex((header) =>
    ["property", "propertyname"].includes(header)
  )
  const unitIndex = headers.findIndex((header) =>
    ["unit", "unitnumber"].includes(header)
  )
  const statusIndex = headers.findIndex((header) => header === "status")

  if (firstNameIndex === -1 || lastNameIndex === -1 || unitIndex === -1) {
    throw new Error(
      "CSV must include First Name, Last Name, and Unit columns."
    )
  }

  const rows: BulkTenantCsvRow[] = []

  for (let i = 1; i < lines.length; i += 1) {
    const rawValues = parseCsvLine(lines[i])

    const firstName = cleanCsvValue(rawValues[firstNameIndex])
    const lastName = cleanCsvValue(rawValues[lastNameIndex])
    const unitNumber = cleanCsvValue(rawValues[unitIndex])
    const propertyName =
      propertyIndex === -1 ? null : cleanCsvValue(rawValues[propertyIndex]) || null
    const rawStatus =
      statusIndex === -1 ? "active" : cleanCsvValue(rawValues[statusIndex]).toLowerCase()

    if (!firstName || !lastName || !unitNumber) {
      throw new Error(
        `Row ${i + 1}: First Name, Last Name, and Unit are required.`
      )
    }

    if (!["active", "notice", ""].includes(rawStatus)) {
      throw new Error(
        `Row ${i + 1}: Status must be active or notice.`
      )
    }

    rows.push({
      lineNumber: i + 1,
      firstName,
      lastName,
      email: emailIndex === -1 ? null : cleanCsvValue(rawValues[emailIndex]) || null,
      phone: phoneIndex === -1 ? null : cleanCsvValue(rawValues[phoneIndex]) || null,
      leaseStart:
        leaseStartIndex === -1 ? null : cleanCsvValue(rawValues[leaseStartIndex]) || null,
      leaseEnd:
        leaseEndIndex === -1 ? null : cleanCsvValue(rawValues[leaseEndIndex]) || null,
      propertyName,
      unitNumber,
      status: rawStatus === "notice" ? "notice" : "active",
    })
  }

  return rows
}

async function fetchAllTenants(): Promise<TenantRow[]> {
  const pageSize = 1000
  let from = 0
  let keepGoing = true
  const allRows: TenantRow[] = []

  while (keepGoing) {
    const { data, error } = await supabaseClient
      .from("tenants")
      .select(
        "id, first_name, last_name, email, phone, lease_start, lease_end, status, property_id, unit_id, created_by"
      )
      .order("id")
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

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

    if (error) {
      throw new Error(error.message)
    }

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

    if (error) {
      throw new Error(error.message)
    }

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

export default function TenantsPage() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState("")
  const [bulkLoading, setBulkLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastState>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)

  const [selectedUnitId, setSelectedUnitId] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [phone, setPhone] = useState("")
  const [leaseStart, setLeaseStart] = useState("")
  const [leaseEnd, setLeaseEnd] = useState("")

  const [statusFilter, setStatusFilter] = useState("all")
  const [searchText, setSearchText] = useState("")
  const [debouncedSearchText, setDebouncedSearchText] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [quickView, setQuickView] = useState<QuickView>("all")
  const [showHistory, setShowHistory] = useState(false)
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkCsvText, setBulkCsvText] = useState("")
  const [bulkFileName, setBulkFileName] = useState("")

  const PAGE_SIZE = 12

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [searchText])

  useEffect(() => {
    setCurrentPage(1)
    setSelectedTenantIds([])
  }, [selectedPropertyId, statusFilter, debouncedSearchText, riskFilter, quickView, showHistory])

  async function loadTenantsPage() {
    setLoading(true)
    setErrorMessage("")

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      setErrorMessage("You must be logged in to view tenants.")
      setLoading(false)
      return
    }

    try {
      const [tenantsData, propertiesData, unitsData] = await Promise.all([
        fetchAllTenants(),
        fetchAllProperties(),
        fetchAllUnits(),
      ])

      setTenants(tenantsData)
      setProperties(propertiesData)
      setUnits(unitsData)

      const storedSelectedPropertyId = getStoredSelectedPropertyId()

      if (
        storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
        propertiesData.some((property) => property.id === storedSelectedPropertyId)
      ) {
        setSelectedPropertyId(storedSelectedPropertyId)
      } else if (propertiesData.length > 0) {
        setSelectedPropertyId(propertiesData[0].id)
        setStoredSelectedPropertyId(propertiesData[0].id)
      } else {
        setSelectedPropertyId(ALL_PROPERTIES_VALUE)
        setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
      }

      setLoading(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load tenants page data."
      )
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTenantsPage()
  }, [])

  useEffect(() => {
    function handlePropertyChange(e: Event) {
      const customEvent = e as CustomEvent<{ propertyId: string }>
      const newPropertyId = customEvent.detail?.propertyId ?? ALL_PROPERTIES_VALUE

      setSelectedPropertyId(newPropertyId)
      setSelectedUnitId("")
    }

    window.addEventListener("propertyChanged", handlePropertyChange)

    return () => {
      window.removeEventListener("propertyChanged", handlePropertyChange)
    }
  }, [])

  function handleSelectedPropertyChange(nextPropertyId: string) {
    setSelectedPropertyId(nextPropertyId)
    setStoredSelectedPropertyId(nextPropertyId)
    setSelectedUnitId("")
  }

  const selectedProperty =
    selectedPropertyId === ALL_PROPERTIES_VALUE
      ? null
      : properties.find((property) => property.id === selectedPropertyId) ?? null

  const propertyMap = useMemo(
    () => new Map(properties.map((property) => [property.id, property])),
    [properties]
  )

  const unitMap = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units]
  )

  const scopedUnits = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return units
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const scopedTenants = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return tenants
    return tenants.filter((tenant) => tenant.property_id === selectedPropertyId)
  }, [tenants, selectedPropertyId])

  const availableUnits = useMemo(() => {
    if (!selectedProperty || selectedPropertyId === ALL_PROPERTIES_VALUE) return []

    return units.filter((unit) => {
      const status = (unit.status ?? "").toLowerCase()

      return (
        unit.property_id === selectedPropertyId &&
        ["vacant", "make_ready", "notice"].includes(status)
      )
    })
  }, [units, selectedProperty, selectedPropertyId])

  const tenantSummaries = useMemo(() => {
    return scopedTenants.map((tenant) => {
      const risks = getTenantRisks(tenant)
      const leaseEndDays = getDaysUntil(tenant.lease_end)

      return {
        tenant,
        risks,
        leaseEndDays,
      }
    })
  }, [scopedTenants])

  const filteredTenantSummaries = useMemo(() => {
    return tenantSummaries.filter(({ tenant, risks }) => {
      const tenantStatus = tenant.status.toLowerCase()

      if (!showHistory && tenantStatus === "moved_out") {
        return false
      }

      const matchesStatus =
        statusFilter === "all" ||
        tenantStatus === statusFilter.toLowerCase()

      const search = debouncedSearchText.trim().toLowerCase()
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
        (riskFilter === "at_risk" && risks.some((risk) => risk.tone !== "emerald")) ||
        (riskFilter === "lease_soon" &&
          risks.some((risk) => risk.label === "Lease ending soon")) ||
        (riskFilter === "notice" && tenantStatus === "notice") ||
        (riskFilter === "missing_info" &&
          risks.some((risk) => risk.label === "Missing contact info"))

      const matchesQuickView =
        quickView === "all" ||
        (quickView === "action_needed" &&
          (tenantStatus === "notice" ||
            risks.some(
              (risk) =>
                risk.label === "Lease ending soon" ||
                risk.label === "Lease expired" ||
                risk.label === "Missing contact info"
            ))) ||
        (quickView === "lease_soon" &&
          risks.some((risk) => risk.label === "Lease ending soon")) ||
        (quickView === "notice" && tenantStatus === "notice") ||
        (quickView === "missing_info" &&
          risks.some((risk) => risk.label === "Missing contact info"))

      return matchesStatus && matchesSearch && matchesRisk && matchesQuickView
    })
  }, [
    tenantSummaries,
    statusFilter,
    debouncedSearchText,
    riskFilter,
    propertyMap,
    unitMap,
    quickView,
    showHistory,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredTenantSummaries.length / PAGE_SIZE))

  const paginatedTenantSummaries = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTenantSummaries.slice(start, start + PAGE_SIZE)
  }, [filteredTenantSummaries, currentPage])

  const visibleTenantIds = useMemo(
    () => paginatedTenantSummaries.map(({ tenant }) => tenant.id),
    [paginatedTenantSummaries]
  )

  const allVisibleSelected =
    visibleTenantIds.length > 0 &&
    visibleTenantIds.every((tenantId) => selectedTenantIds.includes(tenantId))

  const selectedTenantSummaries = tenantSummaries.filter(({ tenant }) =>
    selectedTenantIds.includes(tenant.id)
  )

  const selectedActiveIds = selectedTenantSummaries
    .filter(({ tenant }) => tenant.status.toLowerCase() === "active")
    .map(({ tenant }) => tenant.id)

  const selectedNoticeIds = selectedTenantSummaries
    .filter(({ tenant }) => tenant.status.toLowerCase() === "notice")
    .map(({ tenant }) => tenant.id)

  const activeCount = scopedTenants.filter(
    (tenant) => tenant.status.toLowerCase() === "active"
  ).length

  const noticeCount = scopedTenants.filter(
    (tenant) => tenant.status.toLowerCase() === "notice"
  ).length

  const riskCount = tenantSummaries.filter((summary) =>
    summary.risks.some((risk) => risk.tone !== "emerald")
  ).length

  const leaseEndingSoonCount = tenantSummaries.filter((summary) =>
    summary.risks.some((risk) => risk.label === "Lease ending soon")
  ).length

  async function handleCreateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!selectedProperty || selectedPropertyId === ALL_PROPERTIES_VALUE) {
      setErrorMessage("Select a specific property first.")
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

    const unitAlreadyHasTenant = tenants.some(
      (tenant) =>
        tenant.unit_id === selectedUnitId &&
        !["moved_out", "transferred"].includes(tenant.status.toLowerCase())
    )

    if (unitAlreadyHasTenant) {
      setErrorMessage("That unit already has a tenant.")
      return
    }

    setSubmitting(true)

    const { error: tenantInsertError } = await supabaseClient.from("tenants").insert([
      {
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

    setSelectedTenantIds((current) => current.filter((id) => id !== tenantId))
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

    setSelectedTenantIds((current) => current.filter((id) => id !== tenantId))
    setActionLoadingId("")
    showToast("Tenant moved out.", "success")
  }

  async function handleBulkGiveNotice() {
    clearMessages()

    if (selectedActiveIds.length === 0) {
      setErrorMessage("Select at least one active tenant.")
      return
    }

    const confirmed = window.confirm(
      `Put ${selectedActiveIds.length} tenant${selectedActiveIds.length === 1 ? "" : "s"} on notice?`
    )

    if (!confirmed) return

    setBulkLoading(true)

    const selectedActiveSet = new Set(selectedActiveIds)
    const affectedUnitIds = tenants
      .filter((tenant) => selectedActiveSet.has(tenant.id))
      .map((tenant) => tenant.unit_id)

    const { error: tenantError } = await supabaseClient
      .from("tenants")
      .update({ status: "notice" })
      .in("id", selectedActiveIds)

    if (tenantError) {
      setErrorMessage(tenantError.message)
      setBulkLoading(false)
      return
    }

    const { error: unitError } = await supabaseClient
      .from("units")
      .update({ status: "notice" })
      .in("id", affectedUnitIds)

    if (unitError) {
      setErrorMessage(unitError.message)
      setBulkLoading(false)
      return
    }

    setTenants((current) =>
      current.map((tenant) =>
        selectedActiveSet.has(tenant.id) ? { ...tenant, status: "notice" } : tenant
      )
    )
    setUnits((current) =>
      current.map((unit) =>
        affectedUnitIds.includes(unit.id) ? { ...unit, status: "notice" } : unit
      )
    )

    setSelectedTenantIds([])
    setBulkLoading(false)
    showToast("Selected tenants marked as notice.", "success")
  }

  async function handleBulkMoveOut() {
    clearMessages()

    if (selectedNoticeIds.length === 0) {
      setErrorMessage("Select at least one notice tenant.")
      return
    }

    const confirmed = window.confirm(
      `Move out ${selectedNoticeIds.length} tenant${selectedNoticeIds.length === 1 ? "" : "s"}?`
    )

    if (!confirmed) return

    setBulkLoading(true)

    const selectedNoticeSet = new Set(selectedNoticeIds)
    const affectedUnitIds = tenants
      .filter((tenant) => selectedNoticeSet.has(tenant.id))
      .map((tenant) => tenant.unit_id)

    const { error: tenantError } = await supabaseClient
      .from("tenants")
      .update({ status: "moved_out" })
      .in("id", selectedNoticeIds)

    if (tenantError) {
      setErrorMessage(tenantError.message)
      setBulkLoading(false)
      return
    }

    const { error: unitError } = await supabaseClient
      .from("units")
      .update({ status: "vacant" })
      .in("id", affectedUnitIds)

    if (unitError) {
      setErrorMessage(unitError.message)
      setBulkLoading(false)
      return
    }

    setTenants((current) =>
      current.map((tenant) =>
        selectedNoticeSet.has(tenant.id) ? { ...tenant, status: "moved_out" } : tenant
      )
    )
    setUnits((current) =>
      current.map((unit) =>
        affectedUnitIds.includes(unit.id) ? { ...unit, status: "vacant" } : unit
      )
    )

    setSelectedTenantIds([])
    setBulkLoading(false)
    showToast("Selected tenants moved out.", "success")
  }

  function toggleTenantSelection(tenantId: string) {
    setSelectedTenantIds((current) =>
      current.includes(tenantId)
        ? current.filter((id) => id !== tenantId)
        : [...current, tenantId]
    )
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedTenantIds((current) =>
        current.filter((id) => !visibleTenantIds.includes(id))
      )
      return
    }

    setSelectedTenantIds((current) => {
      const next = new Set(current)
      for (const id of visibleTenantIds) {
        next.add(id)
      }
      return Array.from(next)
    })
  }

  async function handleBulkFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const textValue = await file.text()
    setBulkCsvText(textValue)
    setBulkFileName(file.name)
  }

  async function handleBulkUpload() {
    clearMessages()

    if (!bulkCsvText.trim()) {
      setErrorMessage("Paste CSV data or choose a CSV file first.")
      return
    }

    setBulkUploading(true)

    try {
      const parsedRows = parseBulkTenantCsv(bulkCsvText)

      const propertyNameMap = new Map(
        properties.map((property) => [property.name.trim().toLowerCase(), property])
      )

      const existingUnitOccupancy = new Set(
        tenants
          .filter(
            (tenant) =>
              !["moved_out", "transferred"].includes(tenant.status.toLowerCase())
          )
          .map((tenant) => tenant.unit_id)
      )

      const reservedUnitIds = new Set<string>()
      const rowsToInsert: Array<{
        first_name: string
        last_name: string
        email: string | null
        phone: string | null
        property_id: string
        unit_id: string
        lease_start: string | null
        lease_end: string | null
        status: "active" | "notice"
      }> = []

      const unitStatusUpdates = new Map<string, "occupied" | "notice">()

      for (const row of parsedRows) {
        let resolvedPropertyId = selectedPropertyId

        if (selectedPropertyId === ALL_PROPERTIES_VALUE) {
          if (!row.propertyName) {
            throw new Error(
              `Row ${row.lineNumber}: Property is required when All Properties is selected.`
            )
          }

          const matchedProperty = propertyNameMap.get(row.propertyName.trim().toLowerCase())

          if (!matchedProperty) {
            throw new Error(
              `Row ${row.lineNumber}: Property "${row.propertyName}" was not found.`
            )
          }

          resolvedPropertyId = matchedProperty.id
        } else if (row.propertyName) {
          const matchedProperty = propertyNameMap.get(row.propertyName.trim().toLowerCase())

          if (!matchedProperty) {
            throw new Error(
              `Row ${row.lineNumber}: Property "${row.propertyName}" was not found.`
            )
          }

          if (matchedProperty.id !== selectedPropertyId) {
            throw new Error(
              `Row ${row.lineNumber}: Property "${row.propertyName}" does not match the selected property scope.`
            )
          }
        }

        const matchedUnit = units.find(
          (unit) =>
            unit.property_id === resolvedPropertyId &&
            unit.unit_number.trim().toLowerCase() === row.unitNumber.trim().toLowerCase()
        )

        if (!matchedUnit) {
          throw new Error(
            `Row ${row.lineNumber}: Unit "${row.unitNumber}" was not found for that property.`
          )
        }

        if (!["vacant", "make_ready", "notice"].includes(matchedUnit.status.toLowerCase())) {
          throw new Error(
            `Row ${row.lineNumber}: Unit "${row.unitNumber}" is not available.`
          )
        }

        if (existingUnitOccupancy.has(matchedUnit.id) || reservedUnitIds.has(matchedUnit.id)) {
          throw new Error(
            `Row ${row.lineNumber}: Unit "${row.unitNumber}" already has a tenant assigned.`
          )
        }

        reservedUnitIds.add(matchedUnit.id)

        rowsToInsert.push({
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          phone: row.phone,
          property_id: resolvedPropertyId,
          unit_id: matchedUnit.id,
          lease_start: row.leaseStart,
          lease_end: row.leaseEnd,
          status: row.status,
        })

        unitStatusUpdates.set(matchedUnit.id, row.status === "notice" ? "notice" : "occupied")
      }

      const { error: insertError } = await supabaseClient.from("tenants").insert(rowsToInsert)

      if (insertError) {
        throw new Error(insertError.message)
      }

      const occupiedUnitIds = Array.from(unitStatusUpdates.entries())
        .filter(([, status]) => status === "occupied")
        .map(([unitId]) => unitId)

      const noticeUnitIds = Array.from(unitStatusUpdates.entries())
        .filter(([, status]) => status === "notice")
        .map(([unitId]) => unitId)

      if (occupiedUnitIds.length > 0) {
        const { error: occupiedError } = await supabaseClient
          .from("units")
          .update({ status: "occupied" })
          .in("id", occupiedUnitIds)

        if (occupiedError) {
          throw new Error(occupiedError.message)
        }
      }

      if (noticeUnitIds.length > 0) {
        const { error: noticeError } = await supabaseClient
          .from("units")
          .update({ status: "notice" })
          .in("id", noticeUnitIds)

        if (noticeError) {
          throw new Error(noticeError.message)
        }
      }

      const createdCount = rowsToInsert.length
      setBulkCsvText("")
      setBulkFileName("")
      showToast(
        `${createdCount} tenant${createdCount === 1 ? "" : "s"} uploaded successfully.`,
        "success"
      )
      await loadTenantsPage()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Bulk upload failed."
      )
    } finally {
      setBulkUploading(false)
    }
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

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Tenants</h1>
          <p className="mt-2 text-zinc-400">
            {selectedProperty
              ? `Monitor tenants for ${selectedProperty.name}.`
              : "Monitor tenant risk, lease timelines, and take action before vacancy occurs."}
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

          <a
            href="#add-tenant-form"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            + Add Tenant
          </a>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setQuickView("all")}
          className={`rounded-full border px-4 py-2 text-sm ${
            quickView === "all"
              ? "border-white/20 bg-white/10 text-white"
              : "border-zinc-700 bg-black/30 text-zinc-400"
          }`}
        >
          All
        </button>

        <button
          type="button"
          onClick={() => setQuickView("action_needed")}
          className={`rounded-full border px-4 py-2 text-sm ${
            quickView === "action_needed"
              ? "border-red-500/20 bg-red-500/10 text-red-300"
              : "border-zinc-700 bg-black/30 text-zinc-400"
          }`}
        >
          Action Needed
        </button>

        <button
          type="button"
          onClick={() => setQuickView("lease_soon")}
          className={`rounded-full border px-4 py-2 text-sm ${
            quickView === "lease_soon"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
              : "border-zinc-700 bg-black/30 text-zinc-400"
          }`}
        >
          Lease Ending Soon
        </button>

        <button
          type="button"
          onClick={() => setQuickView("notice")}
          className={`rounded-full border px-4 py-2 text-sm ${
            quickView === "notice"
              ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
              : "border-zinc-700 bg-black/30 text-zinc-400"
          }`}
        >
          On Notice
        </button>

        <button
          type="button"
          onClick={() => setQuickView("missing_info")}
          className={`rounded-full border px-4 py-2 text-sm ${
            quickView === "missing_info"
              ? "border-blue-500/20 bg-blue-500/10 text-blue-300"
              : "border-zinc-700 bg-black/30 text-zinc-400"
          }`}
        >
          Missing Info
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">
            {selectedProperty ? "Tenants in Property" : "Total Tenants"}
          </p>
          <p className="mt-3 text-3xl font-semibold">{scopedTenants.length}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {selectedProperty ? selectedProperty.name : "All tenant records"}
          </p>
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

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Tenant Filters</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Search by tenant, email, phone, property, or unit.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-black"
              />
              Show History
            </label>

            <p className="text-sm text-zinc-500">
              {filteredTenantSummaries.length} shown
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search tenant, email, property, or unit"
            className="rounded bg-black p-2"
          />

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Tenant Table</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Action-ready tenant list.
            </p>
          </div>

          {selectedTenantIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-400">
                {selectedTenantIds.length} selected
              </span>

              <button
                type="button"
                onClick={handleBulkGiveNotice}
                disabled={bulkLoading || selectedActiveIds.length === 0}
                className="rounded bg-amber-600 px-3 py-2 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {bulkLoading ? "Working..." : "Bulk Give Notice"}
              </button>

              <button
                type="button"
                onClick={handleBulkMoveOut}
                disabled={bulkLoading || selectedNoticeIds.length === 0}
                className="rounded bg-zinc-700 px-3 py-2 text-xs text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {bulkLoading ? "Working..." : "Bulk Move Out"}
              </button>
            </div>
          ) : null}
        </div>

        {filteredTenantSummaries.length === 0 ? (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            No tenants match your current filters.
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead className="sticky top-0">
                  <tr>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="h-4 w-4 rounded border-white/10 bg-black"
                        aria-label="Select all visible tenants"
                      />
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Tenant
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Property
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Unit
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Status
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Lease End
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Days Left
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Risk
                    </th>
                    <th className="border-b border-white/10 bg-zinc-950/90 px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedTenantSummaries.map(({ tenant, risks, leaseEndDays }) => {
                    const property = propertyMap.get(tenant.property_id)
                    const unit = unitMap.get(tenant.unit_id)
                    const status = tenant.status.toLowerCase()
                    const isActionLoading = actionLoadingId === tenant.id
                    const isSelected = selectedTenantIds.includes(tenant.id)

                    return (
                      <tr
                        key={tenant.id}
                        className="transition hover:bg-white/[0.03]"
                      >
                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTenantSelection(tenant.id)}
                            className="h-4 w-4 rounded border-white/10 bg-black"
                            aria-label={`Select ${tenant.first_name} ${tenant.last_name}`}
                          />
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <div className="min-w-[220px]">
                            <p className="font-medium text-white">
                              {tenant.first_name} {tenant.last_name}
                            </p>
                            {tenant.email ? (
                              <p className="mt-1 text-sm text-zinc-400">{tenant.email}</p>
                            ) : null}
                            {tenant.phone ? (
                              <p className="mt-1 text-sm text-zinc-500">{tenant.phone}</p>
                            ) : null}
                          </div>
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top text-sm text-zinc-200">
                          {property?.name ?? "Unknown Property"}
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top text-sm text-zinc-200">
                          Unit {unit?.unit_number ?? "?"}
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs capitalize ${getTenantStatusClasses(
                              tenant.status
                            )}`}
                          >
                            {tenant.status}
                          </span>
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top text-sm text-zinc-200">
                          {formatDate(tenant.lease_end)}
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <span className={`text-sm ${getDaysRemainingClasses(leaseEndDays)}`}>
                            {getDaysRemainingLabel(leaseEndDays)}
                          </span>
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <div className="flex min-w-[200px] flex-wrap gap-2">
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
                        </td>

                        <td className="border-b border-white/5 px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <Link
                              href="/transfers"
                              className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                            >
                              Start Transfer
                            </Link>

                            {status === "active" ? (
                              <button
                                type="button"
                                onClick={() => handleGiveNotice(tenant.id)}
                                disabled={isActionLoading}
                                className="rounded bg-amber-600 px-3 py-2 text-xs text-white hover:bg-amber-700 disabled:opacity-60"
                              >
                                {isActionLoading ? "Updating..." : "Give Notice"}
                              </button>
                            ) : null}

                            {status === "notice" ? (
                              <button
                                type="button"
                                onClick={() => handleMoveOut(tenant.id)}
                                disabled={isActionLoading}
                                className="rounded bg-zinc-700 px-3 py-2 text-xs text-white hover:bg-zinc-600 disabled:opacity-60"
                              >
                                {isActionLoading ? "Updating..." : "Move Out"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-500">
                Page {currentPage} of {totalPages}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Units Available for Transfer</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Select a unit when initiating a tenant transfer.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {scopedUnits.filter((unit) =>
            ["vacant", "make_ready", "notice"].includes(unit.status.toLowerCase())
          ).length === 0 ? (
            <p className="text-sm text-zinc-500">No available units right now.</p>
          ) : (
            scopedUnits
              .filter((unit) =>
                ["vacant", "make_ready", "notice"].includes(unit.status.toLowerCase())
              )
              .map((unit) => {
                const property = propertyMap.get(unit.property_id)

                return (
                  <span
                    key={`${unit.id}-available`}
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

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Bulk Tenant Upload</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Upload many tenants at once with a CSV file or pasted spreadsheet data.
            </p>
          </div>

          <button
            type="button"
            onClick={handleBulkUpload}
            disabled={bulkUploading}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {bulkUploading ? "Uploading..." : "Upload CSV"}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-medium text-zinc-200">CSV columns</p>
          <p className="mt-2 text-sm text-zinc-400">
            Required: <span className="text-zinc-200">First Name, Last Name, Unit</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Optional: Property, Email, Phone, Lease Start, Lease End, Status
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Status can be active or notice. If you keep the page scoped to one property, the Property column can be left blank.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-zinc-400">Choose CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleBulkFileChange}
              className="block w-full rounded border border-white/10 bg-black p-2 text-sm text-zinc-200 file:mr-4 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:text-white"
            />
            {bulkFileName ? (
              <p className="mt-2 text-xs text-zinc-500">Loaded file: {bulkFileName}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">Sample format</label>
            <div className="rounded border border-white/10 bg-black p-3 text-xs text-zinc-300">
              <p>First Name,Last Name,Property,Unit,Email,Phone,Lease Start,Lease End,Status</p>
              <p>John,Smith,Cedar Grove Apartments,101,john@email.com,2055551111,2026-04-01,2027-03-31,active</p>
              <p>Sarah,Lee,Cedar Grove Apartments,102,sarah@email.com,2055552222,2026-04-01,2027-03-31,notice</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm text-zinc-400">Paste CSV data</label>
          <textarea
            value={bulkCsvText}
            onChange={(e) => setBulkCsvText(e.target.value)}
            placeholder="Paste CSV rows here"
            className="min-h-[180px] w-full rounded bg-black p-3 text-sm"
          />
        </div>
      </div>

      <div
        id="add-tenant-form"
        className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6"
      >
        <h2 className="mb-1 text-xl font-semibold">Add Tenant</h2>
        <p className="mb-4 text-sm text-zinc-400">
          Add a resident into an available unit after reviewing the current tenant list.
        </p>

        <form onSubmit={handleCreateTenant} className="grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">Property</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => handleSelectedPropertyChange(e.target.value)}
              className="w-full rounded bg-black p-2"
            >
              <option value={ALL_PROPERTIES_VALUE}>Select Specific Property</option>
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
              disabled={!selectedProperty}
            >
              <option value="">
                {!selectedProperty
                  ? "Select Specific Property First"
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
            disabled={submitting || !selectedProperty}
            className="mt-2 rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create Tenant"}
          </button>
        </form>
      </div>
    </div>
  )
}