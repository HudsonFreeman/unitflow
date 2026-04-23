"use client"

import { useEffect, useMemo, useState } from "react"
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

type ToastType = "success" | "error"

type ToastState = {
  message: string
  type: ToastType
} | null

type EditingPropertyState = {
  id: string
  name: string
} | null

type EditingUnitState = {
  id: string
  property_id: string
  unit_number: string
  status: string
} | null

async function getCurrentOrganizationId() {
  const {
    data: { user },
    error: userError,
  } = await supabaseClient.auth.getUser()

  if (userError || !user) {
    throw new Error("Unauthorized")
  }

  const { data, error } = await supabaseClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  const orgId = data?.[0]?.organization_id

  if (!orgId) {
    throw new Error("No organization found")
  }

  return orgId
}

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

export default function PropertiesPage() {
  const [loading, setLoading] = useState(true)
  const [submittingProperty, setSubmittingProperty] = useState(false)
  const [submittingUnit, setSubmittingUnit] = useState(false)
  const [submittingBulkUnits, setSubmittingBulkUnits] = useState(false)
  const [submittingCsvUnits, setSubmittingCsvUnits] = useState(false)
  const [savingPropertyId, setSavingPropertyId] = useState("")
  const [savingUnitId, setSavingUnitId] = useState("")
  const [deletingPropertyId, setDeletingPropertyId] = useState("")
  const [deletingUnitId, setDeletingUnitId] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [toast, setToast] = useState<ToastState>(null)

  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])

  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)
  const [propertyName, setPropertyName] = useState("")
  const [unitNumber, setUnitNumber] = useState("")
  const [unitStatus, setUnitStatus] = useState("vacant")

  const [bulkStartUnit, setBulkStartUnit] = useState("")
  const [bulkEndUnit, setBulkEndUnit] = useState("")
  const [bulkStatus, setBulkStatus] = useState("vacant")

  const [csvFile, setCsvFile] = useState<File | null>(null)

  const [editingProperty, setEditingProperty] = useState<EditingPropertyState>(null)
  const [editingUnit, setEditingUnit] = useState<EditingUnitState>(null)

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

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      setErrorMessage("You must be logged in to view properties.")
      setLoading(false)
      return
    }

    try {
      const [nextProperties, nextUnits] = await Promise.all([
        fetchAllProperties(),
        fetchAllUnits(),
      ])

      setProperties(nextProperties)
      setUnits(nextUnits)

      const storedSelectedPropertyId = getStoredSelectedPropertyId()

      if (
        storedSelectedPropertyId === ALL_PROPERTIES_VALUE ||
        nextProperties.some((property) => property.id === storedSelectedPropertyId)
      ) {
        setSelectedPropertyId(storedSelectedPropertyId)
      } else if (nextProperties.length > 0) {
        setSelectedPropertyId(nextProperties[0].id)
        setStoredSelectedPropertyId(nextProperties[0].id)
      } else {
        setSelectedPropertyId(ALL_PROPERTIES_VALUE)
        setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
      }

      setLoading(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load properties page data."
      )
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPropertiesPage()
  }, [])

  function handleSelectedPropertyChange(nextPropertyId: string) {
    setSelectedPropertyId(nextPropertyId)
    setStoredSelectedPropertyId(nextPropertyId)
  }

  const selectedProperty =
    selectedPropertyId === ALL_PROPERTIES_VALUE
      ? null
      : properties.find((property) => property.id === selectedPropertyId) ?? null

  const scopedUnits = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return units
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const portfolioTotals = useMemo(() => {
    const occupied = scopedUnits.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "occupied"
    ).length

    const vacant = scopedUnits.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "vacant"
    ).length

    const makeReady = scopedUnits.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "make_ready"
    ).length

    const notice = scopedUnits.filter(
      (unit) => (unit.status ?? "").toLowerCase() === "notice"
    ).length

    const occupancy =
      scopedUnits.length > 0 ? Math.round((occupied / scopedUnits.length) * 100) : 0

    return {
      totalUnits: scopedUnits.length,
      occupied,
      vacant,
      makeReady,
      notice,
      occupancy,
    }
  }, [scopedUnits])

  const propertySummaries = useMemo(() => {
    const propertiesToShow =
      selectedPropertyId === ALL_PROPERTIES_VALUE
        ? properties
        : properties.filter((property) => property.id === selectedPropertyId)

    return propertiesToShow.map((property) => {
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
  }, [properties, units, selectedPropertyId])

  async function handleCreateProperty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

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

    let orgId: string

    try {
      orgId = await getCurrentOrganizationId()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to get organization")
      setSubmittingProperty(false)
      return
    }

    const { data, error } = await supabaseClient
      .from("properties")
      .insert([
        {
          name: trimmedName,
          organization_id: orgId,
        },
      ])
      .select("id, name, created_by")

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
      setStoredSelectedPropertyId(createdProperty.id)
    } else {
      await loadPropertiesPage()
    }

    setPropertyName("")
    setSubmittingProperty(false)
    showToast("Property created.", "success")
  }

  async function handleSaveProperty() {
    clearMessages()

    if (!editingProperty) return

    const trimmedName = editingProperty.name.trim()

    if (!trimmedName) {
      setErrorMessage("Property name is required.")
      return
    }

    const duplicateProperty = properties.some(
      (property) =>
        property.id !== editingProperty.id &&
        property.name.trim().toLowerCase() === trimmedName.toLowerCase()
    )

    if (duplicateProperty) {
      setErrorMessage("A property with that name already exists.")
      return
    }

    setSavingPropertyId(editingProperty.id)

    const { error } = await supabaseClient
      .from("properties")
      .update({ name: trimmedName })
      .eq("id", editingProperty.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingPropertyId("")
      return
    }

    setProperties((current) =>
      current
        .map((property) =>
          property.id === editingProperty.id
            ? { ...property, name: trimmedName }
            : property
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    )

    setSavingPropertyId("")
    setEditingProperty(null)
    showToast("Property updated.", "success")
  }

  async function handleDeleteProperty(propertyId: string) {
    clearMessages()

    const property = properties.find((item) => item.id === propertyId)
    if (!property) {
      setErrorMessage("Property not found.")
      return
    }

    const propertyUnitCount = units.filter((unit) => unit.property_id === propertyId).length

    const confirmed = window.confirm(
      propertyUnitCount > 0
        ? `Delete ${property.name}? This will also delete ${propertyUnitCount} unit(s) tied to this property.`
        : `Delete ${property.name}?`
    )

    if (!confirmed) return

    setDeletingPropertyId(propertyId)

    const { error } = await supabaseClient
      .from("properties")
      .delete()
      .eq("id", propertyId)

    if (error) {
      setErrorMessage(error.message)
      setDeletingPropertyId("")
      return
    }

    const remainingProperties = properties.filter((item) => item.id !== propertyId)

    setProperties(remainingProperties)
    setUnits((current) => current.filter((unit) => unit.property_id !== propertyId))

    if (selectedPropertyId === propertyId) {
      const nextSelected = remainingProperties[0]?.id ?? ALL_PROPERTIES_VALUE
      setSelectedPropertyId(nextSelected)
      setStoredSelectedPropertyId(nextSelected)
    }

    if (editingProperty?.id === propertyId) {
      setEditingProperty(null)
    }

    setDeletingPropertyId("")
    showToast("Property deleted.", "success")
  }

  async function handleCreateUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!selectedProperty || selectedPropertyId === ALL_PROPERTIES_VALUE) {
      setErrorMessage("Select a specific property first.")
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

    let orgId: string

    try {
      orgId = await getCurrentOrganizationId()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to get organization")
      setSubmittingUnit(false)
      return
    }

    const { data, error } = await supabaseClient
      .from("units")
      .insert([
        {
          property_id: selectedPropertyId,
          unit_number: trimmedUnitNumber,
          status: unitStatus,
          organization_id: orgId,
        },
      ])
      .select("id, unit_number, property_id, status, created_by")

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

  async function handleSaveUnit() {
    clearMessages()

    if (!editingUnit) return

    const trimmedUnitNumber = editingUnit.unit_number.trim()
    const normalizedStatus = normalizeUnitStatus(editingUnit.status)

    if (!trimmedUnitNumber) {
      setErrorMessage("Unit number is required.")
      return
    }

    const duplicateUnit = units.some(
      (unit) =>
        unit.id !== editingUnit.id &&
        unit.property_id === editingUnit.property_id &&
        unit.unit_number.trim().toLowerCase() === trimmedUnitNumber.toLowerCase()
    )

    if (duplicateUnit) {
      setErrorMessage("That unit number already exists for this property.")
      return
    }

    setSavingUnitId(editingUnit.id)

    const { error } = await supabaseClient
      .from("units")
      .update({
        unit_number: trimmedUnitNumber,
        status: normalizedStatus,
      })
      .eq("id", editingUnit.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingUnitId("")
      return
    }

    setUnits((current) =>
      current
        .map((unit) =>
          unit.id === editingUnit.id
            ? {
                ...unit,
                unit_number: trimmedUnitNumber,
                status: normalizedStatus,
              }
            : unit
        )
        .sort((a, b) =>
          a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        )
    )

    setSavingUnitId("")
    setEditingUnit(null)
    showToast("Unit updated.", "success")
  }

  async function handleDeleteUnit(unitId: string) {
    clearMessages()

    const unit = units.find((item) => item.id === unitId)
    if (!unit) {
      setErrorMessage("Unit not found.")
      return
    }

    const confirmed = window.confirm(`Delete Unit ${unit.unit_number}?`)

    if (!confirmed) return

    setDeletingUnitId(unitId)

    const { error } = await supabaseClient
      .from("units")
      .delete()
      .eq("id", unitId)

    if (error) {
      setErrorMessage(error.message)
      setDeletingUnitId("")
      return
    }

    setUnits((current) => current.filter((existingUnit) => existingUnit.id !== unitId))

    if (editingUnit?.id === unitId) {
      setEditingUnit(null)
    }

    setDeletingUnitId("")
    showToast("Unit deleted.", "success")
  }

  async function handleBulkCreateUnits(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    clearMessages()

    if (!selectedProperty || selectedPropertyId === ALL_PROPERTIES_VALUE) {
      setErrorMessage("Select a specific property for bulk creation.")
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
        .filter((unit) => unit.property_id === selectedPropertyId)
        .map((unit) => unit.unit_number.trim().toLowerCase())
    )

    const newUnitsPayload: Array<{
      property_id: string
      unit_number: string
      status: string
      organization_id: string
    }> = []

    const duplicateNumbers: string[] = []

    let orgId: string

    try {
      orgId = await getCurrentOrganizationId()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to get organization")
      return
    }

    for (let i = startNumber; i <= endNumber; i += 1) {
      const generatedUnitNumber = padUnitNumber(i, padWidth)
      const normalizedUnitNumber = generatedUnitNumber.toLowerCase()

      if (existingUnitNumbers.has(normalizedUnitNumber)) {
        duplicateNumbers.push(generatedUnitNumber)
        continue
      }

      newUnitsPayload.push({
        property_id: selectedPropertyId,
        unit_number: generatedUnitNumber,
        status: bulkStatus,
        organization_id: orgId,
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
      .select("id, unit_number, property_id, status, created_by")

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

    if (!selectedProperty || selectedPropertyId === ALL_PROPERTIES_VALUE) {
      setErrorMessage("Select a specific property for CSV upload.")
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
          .filter((unit) => unit.property_id === selectedPropertyId)
          .map((unit) => unit.unit_number.trim().toLowerCase())
      )

      const seenInFile = new Set<string>()
      const duplicates: string[] = []
      let orgId: string

      try {
        orgId = await getCurrentOrganizationId()
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to get organization")
        setSubmittingCsvUnits(false)
        return
      }

      const payload: Array<{
        property_id: string
        unit_number: string
        status: string
        organization_id: string
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
          property_id: selectedPropertyId,
          unit_number: row.unit_number.trim(),
          status: normalizeUnitStatus(row.status),
          organization_id: orgId,
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
        .select("id, unit_number, property_id, status, created_by")

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

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Properties</h1>
          <p className="mt-2 text-zinc-400">
            {selectedProperty
              ? `Manage ${selectedProperty.name} and its units.`
              : "Manage your portfolio and identify where vacancy risk is building."}
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

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-zinc-400">
            {selectedProperty ? "Selected Property" : "Properties"}
          </p>
          <p className="mt-3 text-3xl font-semibold">
            {selectedProperty ? 1 : properties.length}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {selectedProperty ? selectedProperty.name : "Total communities"}
          </p>
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
          <p className="mt-2 text-sm text-zinc-500">
            {selectedProperty ? "For selected property" : "Across all units"}
          </p>
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
                onChange={(e) => handleSelectedPropertyChange(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value={ALL_PROPERTIES_VALUE}>
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Specific Property"}
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
              disabled={submittingUnit || !selectedProperty}
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
                value={selectedPropertyId}
                onChange={(e) => handleSelectedPropertyChange(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value={ALL_PROPERTIES_VALUE}>
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Specific Property"}
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
                disabled={submittingBulkUnits || !selectedProperty}
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
                value={selectedPropertyId}
                onChange={(e) => handleSelectedPropertyChange(e.target.value)}
                className="w-full rounded bg-black p-2"
                disabled={properties.length === 0}
              >
                <option value={ALL_PROPERTIES_VALUE}>
                  {properties.length === 0
                    ? "Create a property first"
                    : "Select Specific Property"}
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
              disabled={submittingCsvUnits || !selectedProperty}
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
            }) => {
              const isSavingProperty = savingPropertyId === property.id
              const isDeletingProperty = deletingPropertyId === property.id

              return (
                <div
                  key={property.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[260px] flex-1">
                      {editingProperty?.id === property.id ? (
                        <div className="space-y-3">
                          <input
                            value={editingProperty.name}
                            onChange={(e) =>
                              setEditingProperty({
                                ...editingProperty,
                                name: e.target.value,
                              })
                            }
                            className="w-full rounded bg-black p-2 text-white"
                          />

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveProperty}
                              disabled={isSavingProperty}
                              className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {isSavingProperty ? "Saving..." : "Save Property"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingProperty(null)}
                              disabled={isSavingProperty}
                              className="rounded border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-xl font-medium">{property.name}</h2>
                          <p className="mt-2 text-sm text-zinc-400">
                            {propertyUnits.length} total units • {occupiedCount} occupied • {vacantCount} vacant
                          </p>
                        </>
                      )}
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

                      {editingProperty?.id !== property.id ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProperty({
                                id: property.id,
                                name: property.name,
                              })
                              setSelectedPropertyId(property.id)
                              setStoredSelectedPropertyId(property.id)
                            }}
                            disabled={isDeletingProperty}
                            className="rounded border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                          >
                            Edit Property
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteProperty(property.id)}
                            disabled={isDeletingProperty}
                            className="rounded bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {isDeletingProperty ? "Deleting..." : "Delete Property"}
                          </button>
                        </div>
                      ) : null}
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

                    <div className="space-y-3">
                      {propertyUnits.length === 0 ? (
                        <span className="text-sm text-zinc-500">
                          No units yet for this property.
                        </span>
                      ) : (
                        propertyUnits.map((unit) => {
                          const isSavingUnit = savingUnitId === unit.id
                          const isDeletingUnit = deletingUnitId === unit.id

                          if (editingUnit?.id === unit.id) {
                            return (
                              <div
                                key={unit.id}
                                className="rounded-xl border border-white/10 bg-black/20 p-4"
                              >
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                  <input
                                    value={editingUnit.unit_number}
                                    onChange={(e) =>
                                      setEditingUnit({
                                        ...editingUnit,
                                        unit_number: e.target.value,
                                      })
                                    }
                                    placeholder="Unit Number"
                                    className="rounded bg-black p-2 text-white"
                                  />

                                  <select
                                    value={editingUnit.status}
                                    onChange={(e) =>
                                      setEditingUnit({
                                        ...editingUnit,
                                        status: e.target.value,
                                      })
                                    }
                                    className="rounded bg-black p-2 text-white"
                                  >
                                    <option value="vacant">vacant</option>
                                    <option value="make_ready">make_ready</option>
                                    <option value="notice">notice</option>
                                    <option value="occupied">occupied</option>
                                  </select>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={handleSaveUnit}
                                      disabled={isSavingUnit}
                                      className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
                                    >
                                      {isSavingUnit ? "Saving..." : "Save Unit"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setEditingUnit(null)}
                                      disabled={isSavingUnit}
                                      className="flex-1 rounded border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={unit.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-3 py-1 text-sm ${getStatusClasses(
                                    unit.status
                                  )}`}
                                >
                                  Unit {unit.unit_number} — {formatUnitStatus(unit.status)}
                                </span>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUnit({
                                      id: unit.id,
                                      property_id: unit.property_id,
                                      unit_number: unit.unit_number,
                                      status: normalizeUnitStatus(unit.status),
                                    })
                                    setSelectedPropertyId(unit.property_id)
                                    setStoredSelectedPropertyId(unit.property_id)
                                  }}
                                  disabled={isDeletingUnit}
                                  className="rounded border border-white/10 px-3 py-2 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-60"
                                >
                                  Edit Unit
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteUnit(unit.id)}
                                  disabled={isDeletingUnit}
                                  className="rounded bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700 disabled:opacity-60"
                                >
                                  {isDeletingUnit ? "Deleting..." : "Delete Unit"}
                                </button>
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
          )
        )}
      </div>
    </div>
  )
}