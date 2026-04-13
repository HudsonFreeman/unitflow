"use client"

import { useEffect, useMemo, useState } from "react"
import { getActiveOrganizationContext } from "@/lib/active-organization"
import { supabaseClient } from "@/lib/supabase-client"

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
  status: string | null
}

type ToastType = "success" | "error"

type ToastState = {
  message: string
  type: ToastType
} | null

function formatUnitStatus(status?: string | null) {
  if (!status) return "unknown"
  return status.replaceAll("_", " ")
}

function normalizeUnitStatus(status?: string | null) {
  const normalized = (status ?? "vacant").trim().toLowerCase()

  if (["vacant", "occupied", "notice", "make_ready"].includes(normalized)) {
    return normalized
  }

  return "vacant"
}

function getStatusClasses(status?: string | null) {
  switch ((status ?? "").toLowerCase()) {
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

function getPropertyHealthLabel(
  vacantCount: number,
  noticeCount: number,
  makeReadyCount: number
) {
  if (vacantCount > 0) {
    return {
      label: "Vacancy risk",
      classes: "border-red-500/20 bg-red-500/10 text-red-300",
    }
  }

  if (noticeCount > 0 || makeReadyCount > 0) {
    return {
      label: "Needs attention",
      classes: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    }
  }

  return {
    label: "Stable",
    classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  }
}

function padUnitNumber(value: number, width: number) {
  return String(value).padStart(width, "0")
}

function parseCsvText(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      rows: [] as Array<{ unit_number: string; status: string }>,
      error: "CSV file is empty.",
    }
  }

  const header = lines[0]
    .split(",")
    .map((cell) => cell.trim().toLowerCase())

  const unitNumberIndex = header.indexOf("unit_number")
  const statusIndex = header.indexOf("status")

  if (unitNumberIndex === -1) {
    return {
      rows: [] as Array<{ unit_number: string; status: string }>,
      error: 'CSV must include a "unit_number" column.',
    }
  }

  const rows: Array<{ unit_number: string; status: string }> = []

  for (let i = 1; i < lines.length; i += 1) {
    const rawCells = lines[i].split(",").map((cell) => cell.trim())

    const unitNumber = rawCells[unitNumberIndex] ?? ""
    const status = statusIndex === -1 ? "vacant" : rawCells[statusIndex] ?? "vacant"

    if (!unitNumber) continue

    rows.push({
      unit_number: unitNumber,
      status: normalizeUnitStatus(status),
    })
  }

  return { rows, error: "" }
}

export default function PropertiesPage() {
  const [loading, setLoading] = useState(true)
  const [submittingProperty, setSubmittingProperty] = useState(false)
  const [submittingUnit, setSubmittingUnit] = useState(false)
  const [submittingBulkUnits, setSubmittingBulkUnits] = useState(false)
  const [submittingCsvUnits, setSubmittingCsvUnits] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastState>(null)

  const [organizationId, setOrganizationId] = useState("")
  const [role, setRole] = useState("")
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  const [propertyName, setPropertyName] = useState("")
  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [unitNumber, setUnitNumber] = useState("")
  const [unitStatus, setUnitStatus] = useState("vacant")

  const [bulkPropertyId, setBulkPropertyId] = useState("")
  const [bulkStartUnit, setBulkStartUnit] = useState("")
  const [bulkEndUnit, setBulkEndUnit] = useState("")
  const [bulkStatus, setBulkStatus] = useState("vacant")

  const [csvPropertyId, setCsvPropertyId] = useState("")
  const [csvFile, setCsvFile] = useState<File | null>(null)

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

  async function loadPropertiesPage() {
    setLoading(true)
    setErrorMessage("")

    const context = await getActiveOrganizationContext()

    if (context.error) {
      setErrorMessage(context.error)
      setLoading(false)
      return
    }

    if (!context.userId) {
      setErrorMessage("You must be logged in to view properties.")
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
      { data: propertiesData, error: propertiesError },
      { data: unitsData, error: unitsError },
    ] = await Promise.all([
      supabaseClient
        .from("properties")
        .select("id, name, organization_id")
        .eq("organization_id", orgId)
        .order("name"),
      supabaseClient
        .from("units")
        .select("id, unit_number, property_id, organization_id, status")
        .eq("organization_id", orgId)
        .order("unit_number"),
    ])

    if (propertiesError || unitsError) {
      setErrorMessage(
        propertiesError?.message || unitsError?.message || "Failed to load properties page data."
      )
      setLoading(false)
      return
    }

    const nextProperties = (propertiesData ?? []) as PropertyRow[]
    const nextUnits = (unitsData ?? []) as UnitRow[]

    setProperties(nextProperties)
    setUnits(nextUnits)

    setSelectedPropertyId((current) => {
      if (current && nextProperties.some((property) => property.id === current)) {
        return current
      }
      return nextProperties[0]?.id ?? ""
    })

    setBulkPropertyId((current) => {
      if (current && nextProperties.some((property) => property.id === current)) {
        return current
      }
      return nextProperties[0]?.id ?? ""
    })

    setCsvPropertyId((current) => {
      if (current && nextProperties.some((property) => property.id === current)) {
        return current
      }
      return nextProperties[0]?.id ?? ""
    })

    setLoading(false)
  }

  useEffect(() => {
    loadPropertiesPage()
  }, [])

  const portfolioTotals = useMemo(() => {
    const occupied = units.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "occupied"
    ).length

    const vacant = units.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "vacant"
    ).length

    const makeReady = units.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "make_ready"
    ).length

    const notice = units.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "notice"
    ).length

    const occupancy =
      units.length > 0 ? Math.round((occupied / units.length) * 100) : 0

    return {
      totalUnits: units.length,
      occupied,
      vacant,
      makeReady,
      notice,
      occupancy,
    }
  }, [units])

  const propertySummaries = useMemo(() => {
    return properties.map((property) => {
      const propertyUnits = units
        .filter((unit) => unit.property_id === property.id)
        .sort((a, b) =>
          a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )

      const occupiedCount = propertyUnits.filter(
        (unit) => (unit.status ?? "").toLowerCase() === "occupied"
      ).length

      const vacantCount = propertyUnits.filter(
        (unit) => (unit.status ?? "").toLowerCase() === "vacant"
      ).length

      const makeReadyCount = propertyUnits.filter(
        (unit) => (unit.status ?? "").toLowerCase() === "make_ready"
      ).length

      const noticeCount = propertyUnits.filter(
        (unit) => (unit.status ?? "").toLowerCase() === "notice"
      ).length

      const occupancy =
        propertyUnits.length > 0
          ? Math.round((occupiedCount / propertyUnits.length) * 100)
          : 0

      const health = getPropertyHealthLabel(vacantCount, noticeCount, makeReadyCount)

      return {
        property,
        units: propertyUnits,
        occupiedCount,
        vacantCount,
        makeReadyCount,
        noticeCount,
        occupancy,
        health,
      }
    })
  }, [properties, units])

  async function handleCreateProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!organizationId) {
      setErrorMessage("Organization not loaded yet.")
      return
    }

    const trimmedName = propertyName.trim()

    if (!trimmedName) {
      setErrorMessage("Property name is required.")
      return
    }

    const duplicateProperty = properties.some(
      (property) => property.name.trim().toLowerCase() === trimmedName.toLowerCase()
    )

    if (duplicateProperty) {
      setErrorMessage("A property with that name already exists.")
      return
    }

    setSubmittingProperty(true)

    const { data, error } = await supabaseClient
      .from("properties")
      .insert([
        {
          organization_id: organizationId,
          name: trimmedName,
        },
      ])
      .select("id, name, organization_id")

    if (error) {
      setErrorMessage(error.message)
      setSubmittingProperty(false)
      return
    }

    const createdProperty = (data?.[0] as PropertyRow | undefined) ?? null

    if (createdProperty) {
      setProperties((current) =>
        [...current, createdProperty].sort((a, b) => a.name.localeCompare(b.name))
      )
      setSelectedPropertyId(createdProperty.id)
      setBulkPropertyId(createdProperty.id)
      setCsvPropertyId(createdProperty.id)
    } else {
      await loadPropertiesPage()
    }

    setPropertyName("")
    setSubmittingProperty(false)
    showToast("Property created.", "success")
  }

  async function handleCreateUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!organizationId) {
      setErrorMessage("Organization not loaded yet.")
      return
    }

    if (!selectedPropertyId) {
      setErrorMessage("Select a property first.")
      return
    }

    const trimmedUnitNumber = unitNumber.trim()

    if (!trimmedUnitNumber) {
      setErrorMessage("Unit number is required.")
      return
    }

    const duplicateUnit = units.some(
      (unit) =>
        unit.property_id === selectedPropertyId &&
        unit.unit_number.trim().toLowerCase() === trimmedUnitNumber.toLowerCase()
    )

    if (duplicateUnit) {
      setErrorMessage("That unit number already exists for this property.")
      return
    }

    setSubmittingUnit(true)

    const { data, error } = await supabaseClient
      .from("units")
      .insert([
        {
          organization_id: organizationId,
          property_id: selectedPropertyId,
          unit_number: trimmedUnitNumber,
          status: unitStatus,
        },
      ])
      .select("id, unit_number, property_id, organization_id, status")

    if (error) {
      setErrorMessage(error.message)
      setSubmittingUnit(false)
      return
    }

    const createdUnit = (data?.[0] as UnitRow | undefined) ?? null

    if (createdUnit) {
      setUnits((current) =>
        [...current, createdUnit].sort((a, b) =>
          a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )
      )
    } else {
      await loadPropertiesPage()
    }

    setUnitNumber("")
    setUnitStatus("vacant")
    setSubmittingUnit(false)
    showToast("Unit created.", "success")
  }

  async function handleBulkCreateUnits(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!organizationId) {
      setErrorMessage("Organization not loaded yet.")
      return
    }

    if (!bulkPropertyId) {
      setErrorMessage("Select a property for bulk creation.")
      return
    }

    const startValue = bulkStartUnit.trim()
    const endValue = bulkEndUnit.trim()

    if (!startValue || !endValue) {
      setErrorMessage("Start unit and end unit are required.")
      return
    }

    if (!/^\d+$/.test(startValue) || !/^\d+$/.test(endValue)) {
      setErrorMessage("Bulk unit creation currently supports numbers only, like 001 to 200.")
      return
    }

    const startNumber = Number(startValue)
    const endNumber = Number(endValue)

    if (!Number.isInteger(startNumber) || !Number.isInteger(endNumber)) {
      setErrorMessage("Start and end units must be whole numbers.")
      return
    }

    if (startNumber <= 0 || endNumber <= 0) {
      setErrorMessage("Start and end units must be greater than 0.")
      return
    }

    if (endNumber < startNumber) {
      setErrorMessage("End unit must be greater than or equal to start unit.")
      return
    }

    const totalToCreate = endNumber - startNumber + 1

    if (totalToCreate > 1000) {
      setErrorMessage("For now, bulk creation is limited to 1000 units at once.")
      return
    }

    const padWidth = Math.max(startValue.length, endValue.length)

    const existingUnitNumbers = new Set(
      units
        .filter((unit) => unit.property_id === bulkPropertyId)
        .map((unit) => unit.unit_number.trim().toLowerCase())
    )

    const newUnitsPayload: Array<{
      organization_id: string
      property_id: string
      unit_number: string
      status: string
    }> = []

    const duplicateNumbers: string[] = []

    for (let i = startNumber; i <= endNumber; i += 1) {
      const generatedUnitNumber = padUnitNumber(i, padWidth)
      const normalizedUnitNumber = generatedUnitNumber.toLowerCase()

      if (existingUnitNumbers.has(normalizedUnitNumber)) {
        duplicateNumbers.push(generatedUnitNumber)
        continue
      }

      newUnitsPayload.push({
        organization_id: organizationId,
        property_id: bulkPropertyId,
        unit_number: generatedUnitNumber,
        status: bulkStatus,
      })
    }

    if (newUnitsPayload.length === 0) {
      setErrorMessage(
        duplicateNumbers.length > 0
          ? "No units created. All units in that range already exist."
          : "No units to create."
      )
      return
    }

    setSubmittingBulkUnits(true)

    const { data, error } = await supabaseClient
      .from("units")
      .insert(newUnitsPayload)
      .select("id, unit_number, property_id, organization_id, status")

    if (error) {
      setErrorMessage(error.message)
      setSubmittingBulkUnits(false)
      return
    }

    const createdUnits = (data ?? []) as UnitRow[]

    if (createdUnits.length > 0) {
      setUnits((current) =>
        [...current, ...createdUnits].sort((a, b) =>
          a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )
      )
    } else {
      await loadPropertiesPage()
    }

    setBulkStartUnit("")
    setBulkEndUnit("")
    setBulkStatus("vacant")
    setSubmittingBulkUnits(false)

    if (duplicateNumbers.length > 0) {
      showToast(
        `Created ${createdUnits.length} units. Skipped ${duplicateNumbers.length} duplicates.`,
        "success"
      )
    } else {
      showToast(`Created ${createdUnits.length} units.`, "success")
    }
  }

  async function handleCsvUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!organizationId) {
      setErrorMessage("Organization not loaded yet.")
      return
    }

    if (!csvPropertyId) {
      setErrorMessage("Select a property for CSV upload.")
      return
    }

    if (!csvFile) {
      setErrorMessage("Choose a CSV file first.")
      return
    }

    setSubmittingCsvUnits(true)

    try {
      const csvText = await csvFile.text()
      const parsed = parseCsvText(csvText)

      if (parsed.error) {
        setErrorMessage(parsed.error)
        setSubmittingCsvUnits(false)
        return
      }

      if (parsed.rows.length === 0) {
        setErrorMessage("No valid rows found in the CSV.")
        setSubmittingCsvUnits(false)
        return
      }

      const existingUnitNumbers = new Set(
        units
          .filter((unit) => unit.property_id === csvPropertyId)
          .map((unit) => unit.unit_number.trim().toLowerCase())
      )

      const seenInFile = new Set<string>()
      const duplicates: string[] = []
      const payload: Array<{
        organization_id: string
        property_id: string
        unit_number: string
        status: string
      }> = []

      for (const row of parsed.rows) {
        const normalizedUnitNumber = row.unit_number.trim().toLowerCase()

        if (!normalizedUnitNumber) continue

        if (existingUnitNumbers.has(normalizedUnitNumber) || seenInFile.has(normalizedUnitNumber)) {
          duplicates.push(row.unit_number)
          continue
        }

        seenInFile.add(normalizedUnitNumber)

        payload.push({
          organization_id: organizationId,
          property_id: csvPropertyId,
          unit_number: row.unit_number.trim(),
          status: normalizeUnitStatus(row.status),
        })
      }

      if (payload.length === 0) {
        setErrorMessage(
          duplicates.length > 0
            ? "No units created. All CSV units already exist or were duplicated."
            : "No valid units found to import."
        )
        setSubmittingCsvUnits(false)
        return
      }

      const { data, error } = await supabaseClient
        .from("units")
        .insert(payload)
        .select("id, unit_number, property_id, organization_id, status")

      if (error) {
        setErrorMessage(error.message)
        setSubmittingCsvUnits(false)
        return
      }

      const createdUnits = (data ?? []) as UnitRow[]

      if (createdUnits.length > 0) {
        setUnits((current) =>
          [...current, ...createdUnits].sort((a, b) =>
            a.unit_number.localeCompare(b.unit_number, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          )
        )
      } else {
        await loadPropertiesPage()
      }

      setCsvFile(null)
      const fileInput = document.getElementById("units-csv-upload") as HTMLInputElement | null
      if (fileInput) fileInput.value = ""

      setSubmittingCsvUnits(false)

      if (duplicates.length > 0) {
        showToast(
          `Imported ${createdUnits.length} units. Skipped ${duplicates.length} duplicates.`,
          "success"
        )
      } else {
        showToast(`Imported ${createdUnits.length} units.`, "success")
      }
    } catch {
      setErrorMessage("Failed to read the CSV file.")
      setSubmittingCsvUnits(false)
    }
  }

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Properties</h1>
        <p className="mt-4 text-zinc-400">Loading properties...</p>
      </div>
    )
  }

  if (errorMessage && properties.length === 0 && units.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Properties</h1>
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

      <h1 className="text-3xl font-semibold">Properties</h1>
      <p className="mt-2 text-zinc-400">
        Manage your portfolio and identify where vacancy risk is building.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-zinc-400">Signed-in role</p>
        <p className="mt-1 text-sm capitalize text-zinc-200">{role}</p>
        <p className="mt-3 text-sm text-zinc-400">Portfolio scope</p>
        <p className="mt-1 text-sm text-zinc-200">
          Properties and units shown here belong only to your active organization.
        </p>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Properties</p>
          <p className="mt-3 text-3xl font-semibold">{properties.length}</p>
          <p className="mt-2 text-sm text-zinc-500">Total communities in this organization</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Units</p>
          <p className="mt-3 text-3xl font-semibold">{portfolioTotals.totalUnits}</p>
          <p className="mt-2 text-sm text-zinc-500">
            {portfolioTotals.occupied} occupied • {portfolioTotals.vacant} vacant
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Occupancy</p>
          <p className="mt-3 text-3xl font-semibold">{portfolioTotals.occupancy}%</p>
          <p className="mt-2 text-sm text-zinc-500">Across all units in this portfolio</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">Attention Needed</p>
          <p className="mt-3 text-3xl font-semibold">
            {portfolioTotals.vacant + portfolioTotals.notice + portfolioTotals.makeReady}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {portfolioTotals.notice} notice • {portfolioTotals.makeReady} make ready
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Setup / Add Inventory
          </p>
          <h2 className="mt-2 text-xl font-semibold">Add New Property</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Start building your portfolio structure.
          </p>

          <form onSubmit={handleCreateProperty} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Property Name
              </label>
              <input
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="Cedar Grove Apartments"
                className="w-full rounded bg-black p-2"
              />
            </div>

            <button
              type="submit"
              disabled={submittingProperty}
              className="w-full rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {submittingProperty ? "Creating..." : "Create Property"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Setup / Add Inventory
          </p>
          <h2 className="mt-2 text-xl font-semibold">Add Single Unit</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Add one unit manually when you only need a single record.
          </p>

          <form onSubmit={handleCreateUnit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Property</label>
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value="">
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Property"}
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Unit Number
              </label>
              <input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="101"
                className="w-full rounded bg-black p-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Starting Status
              </label>
              <select
                value={unitStatus}
                onChange={(e) => setUnitStatus(e.target.value)}
                className="w-full rounded bg-black p-2"
              >
                <option value="vacant">vacant</option>
                <option value="make_ready">make_ready</option>
                <option value="notice">notice</option>
                <option value="occupied">occupied</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submittingUnit || properties.length === 0}
              className="w-full rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {submittingUnit ? "Creating..." : "Create Unit"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Bulk Inventory Setup
          </p>
          <h2 className="mt-2 text-xl font-semibold">Bulk Create Units</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Generate sequential unit ranges fast. Example: 001 to 200.
          </p>

          <form
            onSubmit={handleBulkCreateUnits}
            className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-zinc-400">Property</label>
              <select
                value={bulkPropertyId}
                onChange={(e) => setBulkPropertyId(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value="">
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Property"}
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">Start Unit</label>
              <input
                value={bulkStartUnit}
                onChange={(e) => setBulkStartUnit(e.target.value)}
                placeholder="001"
                className="w-full rounded bg-black p-2"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">End Unit</label>
              <input
                value={bulkEndUnit}
                onChange={(e) => setBulkEndUnit(e.target.value)}
                placeholder="200"
                className="w-full rounded bg-black p-2"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-zinc-400">Starting Status</label>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="w-full rounded bg-black p-2"
              >
                <option value="vacant">vacant</option>
                <option value="make_ready">make_ready</option>
                <option value="notice">notice</option>
                <option value="occupied">occupied</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submittingBulkUnits || properties.length === 0}
                className="w-full rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
              >
                {submittingBulkUnits ? "Generating Units..." : "Generate Units"}
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Bulk Inventory Setup
          </p>
          <h2 className="mt-2 text-xl font-semibold">Upload Units CSV</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Import mixed unit numbers from a CSV file. Best for large existing properties.
          </p>

          <form onSubmit={handleCsvUpload} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Property</label>
              <select
                value={csvPropertyId}
                onChange={(e) => setCsvPropertyId(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value="">
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Property"}
                </option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">CSV File</label>
              <input
                id="units-csv-upload"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="w-full rounded bg-black p-2 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white"
              />
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              CSV format:
              <pre className="mt-2 overflow-x-auto text-xs text-zinc-300">
{`unit_number,status
101,vacant
102,occupied
103,notice
104,make_ready`}
              </pre>
            </div>

            <button
              type="submit"
              disabled={submittingCsvUnits || properties.length === 0}
              className="w-full rounded bg-blue-600 p-2 hover:bg-blue-700 disabled:opacity-60"
            >
              {submittingCsvUnits ? "Uploading CSV..." : "Import CSV Units"}
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        {propertySummaries.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-400">
            No properties yet — create your first property above.
          </div>
        ) : (
          propertySummaries.map(
            ({
              property,
              units: propertyUnits,
              occupiedCount,
              vacantCount,
              makeReadyCount,
              noticeCount,
              occupancy,
              health,
            }) => (
              <div
                key={property.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-medium">{property.name}</h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      {propertyUnits.length} total units • {occupiedCount} occupied • {vacantCount} vacant
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs ${health.classes}`}
                    >
                      {health.label}
                    </span>

                    <div className="text-right">
                      <p className="text-2xl font-semibold">{occupancy}%</p>
                      <p className="text-xs text-zinc-500">occupied</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-zinc-500">Occupied</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {occupiedCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-zinc-500">Vacant</p>
                    <p className="mt-1 text-lg font-semibold text-zinc-200">
                      {vacantCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-zinc-500">Make Ready</p>
                    <p className="mt-1 text-lg font-semibold text-orange-300">
                      {makeReadyCount}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-zinc-500">Notice</p>
                    <p className="mt-1 text-lg font-semibold text-amber-300">
                      {noticeCount}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm text-zinc-400">Unit Board</p>

                  <div className="flex flex-wrap gap-2">
                    {propertyUnits.length === 0 ? (
                      <span className="text-sm text-zinc-500">
                        No units yet for this property.
                      </span>
                    ) : (
                      propertyUnits.map((unit) => (
                        <span
                          key={unit.id}
                          className={`rounded-full border px-3 py-1 text-sm ${getStatusClasses(
                            unit.status
                          )}`}
                        >
                          Unit {unit.unit_number} — {formatUnitStatus(unit.status)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  )
}