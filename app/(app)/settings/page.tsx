"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"

type PropertyRow = {
  id: string
  name: string
  default_monthly_rent: number | null
  turnover_days: number | null
  expected_vacancy_days: number | null
  allow_same_day_transfer: boolean | null
  auto_block_invalid_transfers: boolean | null
  grace_buffer_days: number | null
  daily_rent_mode: string | null
  vacancy_loss_multiplier: number | null
  turnover_cost_per_unit: number | null
  auto_mark_notice_days: number | null
  auto_status_updates: boolean | null
  require_approval: boolean | null
  allow_cross_property_transfers: boolean | null
  minimum_notice_days: number | null
  transfer_readiness_mode: string | null
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  status: string | null
  monthly_rent: number | null
}

type SaveState = "idle" | "saving" | "saved" | "error"

type FormState = {
  default_monthly_rent: string
  turnover_days: string
  expected_vacancy_days: string
  grace_buffer_days: string
  daily_rent_mode: string
  vacancy_loss_multiplier: string
  turnover_cost_per_unit: string
  auto_mark_notice_days: string
  minimum_notice_days: string
  transfer_readiness_mode: string
  allow_same_day_transfer: boolean
  auto_block_invalid_transfers: boolean
  auto_status_updates: boolean
  require_approval: boolean
  allow_cross_property_transfers: boolean
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function money(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `$${Math.round(value).toLocaleString()}`
}

function statusLabel(status?: string | null) {
  return (status ?? "unknown").replaceAll("_", " ")
}

function propertyToForm(property: PropertyRow | null): FormState {
  return {
    default_monthly_rent: String(property?.default_monthly_rent ?? 1500),
    turnover_days: String(property?.turnover_days ?? 2),
    expected_vacancy_days: String(property?.expected_vacancy_days ?? 14),
    grace_buffer_days: String(property?.grace_buffer_days ?? 0),
    daily_rent_mode: property?.daily_rent_mode ?? "monthly_30",
    vacancy_loss_multiplier: String(property?.vacancy_loss_multiplier ?? 1),
    turnover_cost_per_unit: String(property?.turnover_cost_per_unit ?? 0),
    auto_mark_notice_days: String(property?.auto_mark_notice_days ?? 45),
    minimum_notice_days: String(property?.minimum_notice_days ?? 0),
    transfer_readiness_mode: property?.transfer_readiness_mode ?? "strict",
    allow_same_day_transfer: Boolean(property?.allow_same_day_transfer ?? false),
    auto_block_invalid_transfers: Boolean(property?.auto_block_invalid_transfers ?? true),
    auto_status_updates: Boolean(property?.auto_status_updates ?? false),
    require_approval: Boolean(property?.require_approval ?? true),
    allow_cross_property_transfers: Boolean(property?.allow_cross_property_transfers ?? true),
  }
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-left transition hover:bg-white/[0.04]"
    >
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      <span
        className={`flex h-7 w-12 shrink-0 items-center rounded-full border p-1 transition ${
          checked
            ? "justify-end border-emerald-500/30 bg-emerald-500/20"
            : "justify-start border-white/10 bg-white/5"
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  )
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [form, setForm] = useState<FormState>(propertyToForm(null))
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [unitSaveState, setUnitSaveState] = useState<SaveState>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function loadSettings() {
    setLoading(true)
    setErrorMessage("")

    const [propertiesResult, unitsResult] = await Promise.all([
      supabaseClient
        .from("properties")
        .select(
          "id, name, default_monthly_rent, turnover_days, expected_vacancy_days, allow_same_day_transfer, auto_block_invalid_transfers, grace_buffer_days, daily_rent_mode, vacancy_loss_multiplier, turnover_cost_per_unit, auto_mark_notice_days, auto_status_updates, require_approval, allow_cross_property_transfers, minimum_notice_days, transfer_readiness_mode"
        )
        .order("name"),
      supabaseClient
        .from("units")
        .select("id, unit_number, property_id, status, monthly_rent")
        .order("unit_number"),
    ])

    if (propertiesResult.error || unitsResult.error) {
      setErrorMessage(
        propertiesResult.error?.message ||
          unitsResult.error?.message ||
          "Failed to load settings."
      )
      setLoading(false)
      return
    }

    const nextProperties = (propertiesResult.data ?? []) as PropertyRow[]
    const nextUnits = (unitsResult.data ?? []) as UnitRow[]
    const nextSelectedId = selectedPropertyId || nextProperties[0]?.id || ""
    const selected = nextProperties.find((property) => property.id === nextSelectedId) ?? null

    setProperties(nextProperties)
    setUnits(nextUnits)
    setSelectedPropertyId(nextSelectedId)
    setForm(propertyToForm(selected))
    setLoading(false)
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProperty = useMemo(() => {
    return properties.find((property) => property.id === selectedPropertyId) ?? null
  }, [properties, selectedPropertyId])

  const visibleUnits = useMemo(() => {
    return units.filter((unit) => unit.property_id === selectedPropertyId)
  }, [units, selectedPropertyId])

  const averageRent = useMemo(() => {
    if (visibleUnits.length === 0) return numberOrNull(form.default_monthly_rent) ?? 1500
    const fallback = numberOrNull(form.default_monthly_rent) ?? 1500
    const total = visibleUnits.reduce((sum, unit) => sum + (unit.monthly_rent ?? fallback), 0)
    return Math.round(total / visibleUnits.length)
  }, [visibleUnits, form.default_monthly_rent])

  const estimatedBaselineLoss = useMemo(() => {
    const dailyRent =
      form.daily_rent_mode === "actual_days"
        ? averageRent / 30.42
        : averageRent / 30
    const baselineDays = numberOrNull(form.expected_vacancy_days) ?? 14
    const multiplier = numberOrNull(form.vacancy_loss_multiplier) ?? 1
    return Math.round(dailyRent * baselineDays * multiplier)
  }, [averageRent, form.daily_rent_mode, form.expected_vacancy_days, form.vacancy_loss_multiplier])

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setSaveState("idle")
  }

  function handlePropertyChange(propertyId: string) {
    const nextProperty = properties.find((property) => property.id === propertyId) ?? null
    setSelectedPropertyId(propertyId)
    setForm(propertyToForm(nextProperty))
    setSaveState("idle")
    setUnitSaveState("idle")
    setErrorMessage("")
  }

  async function savePropertySettings() {
    if (!selectedPropertyId) return

    const numericFields = {
      default_monthly_rent: numberOrNull(form.default_monthly_rent),
      turnover_days: numberOrNull(form.turnover_days),
      expected_vacancy_days: numberOrNull(form.expected_vacancy_days),
      grace_buffer_days: numberOrNull(form.grace_buffer_days),
      vacancy_loss_multiplier: numberOrNull(form.vacancy_loss_multiplier),
      turnover_cost_per_unit: numberOrNull(form.turnover_cost_per_unit),
      auto_mark_notice_days: numberOrNull(form.auto_mark_notice_days),
      minimum_notice_days: numberOrNull(form.minimum_notice_days),
    }

    if (
      numericFields.default_monthly_rent === null ||
      numericFields.turnover_days === null ||
      numericFields.expected_vacancy_days === null ||
      numericFields.grace_buffer_days === null ||
      numericFields.vacancy_loss_multiplier === null ||
      numericFields.turnover_cost_per_unit === null ||
      numericFields.auto_mark_notice_days === null ||
      numericFields.minimum_notice_days === null
    ) {
      setSaveState("error")
      setErrorMessage("All number fields are required.")
      return
    }

    if (Object.values(numericFields).some((value) => value !== null && value < 0)) {
      setSaveState("error")
      setErrorMessage("Settings cannot be negative.")
      return
    }

    setSaveState("saving")
    setErrorMessage("")

    const payload = {
      default_monthly_rent: numericFields.default_monthly_rent,
      turnover_days: Math.round(numericFields.turnover_days),
      expected_vacancy_days: Math.round(numericFields.expected_vacancy_days),
      allow_same_day_transfer: form.allow_same_day_transfer,
      auto_block_invalid_transfers: form.auto_block_invalid_transfers,
      grace_buffer_days: Math.round(numericFields.grace_buffer_days),
      daily_rent_mode: form.daily_rent_mode,
      vacancy_loss_multiplier: numericFields.vacancy_loss_multiplier,
      turnover_cost_per_unit: numericFields.turnover_cost_per_unit,
      auto_mark_notice_days: Math.round(numericFields.auto_mark_notice_days),
      auto_status_updates: form.auto_status_updates,
      require_approval: form.require_approval,
      allow_cross_property_transfers: form.allow_cross_property_transfers,
      minimum_notice_days: Math.round(numericFields.minimum_notice_days),
      transfer_readiness_mode: form.transfer_readiness_mode,
    }

    const { error } = await supabaseClient
      .from("properties")
      .update(payload)
      .eq("id", selectedPropertyId)

    if (error) {
      setSaveState("error")
      setErrorMessage(error.message)
      return
    }

    setProperties((current) =>
      current.map((property) =>
        property.id === selectedPropertyId ? { ...property, ...payload } : property
      )
    )

    setSaveState("saved")
  }

  function updateUnitRent(unitId: string, value: string) {
    const parsed = numberOrNull(value)
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId ? { ...unit, monthly_rent: parsed } : unit
      )
    )
    setUnitSaveState("idle")
  }

  async function fillEmptyRentsWithDefault() {
    const fallback = numberOrNull(form.default_monthly_rent) ?? 1500
    setUnits((current) =>
      current.map((unit) =>
        unit.property_id === selectedPropertyId &&
        (unit.monthly_rent === null || unit.monthly_rent === undefined)
          ? { ...unit, monthly_rent: fallback }
          : unit
      )
    )
    setUnitSaveState("idle")
  }

  async function saveUnitRents() {
    setUnitSaveState("saving")
    setErrorMessage("")

    const results = await Promise.all(
      visibleUnits.map((unit) =>
        supabaseClient
          .from("units")
          .update({ monthly_rent: unit.monthly_rent })
          .eq("id", unit.id)
      )
    )

    const error = results.find((result) => result.error)?.error

    if (error) {
      setUnitSaveState("error")
      setErrorMessage(error.message)
      return
    }

    setUnitSaveState("saved")
  }

  if (loading) {
    return <div className="min-h-screen bg-black p-8 text-white">Loading settings...</div>
  }

  return (
    <div className="min-h-screen bg-black px-6 py-8 text-white md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              UnitFlow Settings
            </p>
            <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em]">
              Property Rules
            </h1>
            <p className="mt-3 max-w-3xl text-zinc-400">
              Keep this simple: set how your property actually operates. UnitFlow
              uses these numbers for calendar readiness, transfer blocking, and
              vacancy savings.
            </p>
          </div>

          <select
            value={selectedPropertyId}
            onChange={(event) => handlePropertyChange(event.target.value)}
            className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm text-white"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm text-zinc-400">Average Rent</p>
            <p className="mt-2 text-3xl font-semibold">{money(averageRent)}</p>
          </div>

          <div className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-5">
            <p className="text-sm text-violet-300">Turnover Buffer</p>
            <p className="mt-2 text-3xl font-semibold">
              {form.turnover_days || "0"} days
            </p>
          </div>

          <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
            <p className="text-sm text-blue-300">Vacancy Baseline</p>
            <p className="mt-2 text-3xl font-semibold">
              {form.expected_vacancy_days || "0"} days
            </p>
          </div>

          <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-5">
            <p className="text-sm text-orange-300">Baseline Loss</p>
            <p className="mt-2 text-3xl font-semibold">
              {money(estimatedBaselineLoss)}
            </p>
          </div>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Core Assumptions
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                These are the only numbers most staff need to understand.
              </p>
            </div>

            <button
              type="button"
              onClick={savePropertySettings}
              disabled={saveState === "saving"}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-60"
            >
              {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save Settings"}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Default Monthly Rent
              </span>
              <input
                type="number"
                min="0"
                value={form.default_monthly_rent}
                onChange={(event) => updateForm("default_monthly_rent", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Turnover Days
              </span>
              <input
                type="number"
                min="0"
                value={form.turnover_days}
                onChange={(event) => updateForm("turnover_days", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Expected Vacancy Days Without UnitFlow
              </span>
              <input
                type="number"
                min="0"
                value={form.expected_vacancy_days}
                onChange={(event) => updateForm("expected_vacancy_days", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            Transfer Rules
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Control whether UnitFlow blocks bad timing or only warns staff.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Toggle
              label="Require approval before completion"
              description="Recommended. Staff must approve a request before it can be completed."
              checked={form.require_approval}
              onChange={(checked) => updateForm("require_approval", checked)}
            />

            <Toggle
              label="Auto-block invalid transfers"
              description="Blocks move-ins before turnover is complete."
              checked={form.auto_block_invalid_transfers}
              onChange={(checked) => updateForm("auto_block_invalid_transfers", checked)}
            />

            <Toggle
              label="Allow same-day transfer"
              description="Allows move-out and move-in to happen on the same day when rules permit."
              checked={form.allow_same_day_transfer}
              onChange={(checked) => updateForm("allow_same_day_transfer", checked)}
            />

            <Toggle
              label="Allow cross-property transfers"
              description="Allows transfers between properties in the same organization."
              checked={form.allow_cross_property_transfers}
              onChange={(checked) => updateForm("allow_cross_property_transfers", checked)}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Grace Buffer Days
              </span>
              <input
                type="number"
                min="0"
                value={form.grace_buffer_days}
                onChange={(event) => updateForm("grace_buffer_days", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Minimum Notice Days
              </span>
              <input
                type="number"
                min="0"
                value={form.minimum_notice_days}
                onChange={(event) => updateForm("minimum_notice_days", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Readiness Mode
              </span>
              <select
                value={form.transfer_readiness_mode}
                onChange={(event) => updateForm("transfer_readiness_mode", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              >
                <option value="strict">Strict: block before ready</option>
                <option value="warn">Flexible: warn only</option>
              </select>
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            Revenue Model
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Used for vacancy savings, revenue at risk, and calendar overlays.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Daily Rent Mode
              </span>
              <select
                value={form.daily_rent_mode}
                onChange={(event) => updateForm("daily_rent_mode", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              >
                <option value="monthly_30">Monthly rent / 30</option>
                <option value="actual_days">Actual days in month</option>
              </select>
            </label>

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Vacancy Loss Multiplier
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.vacancy_loss_multiplier}
                onChange={(event) => updateForm("vacancy_loss_multiplier", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Turnover Cost Per Unit
              </span>
              <input
                type="number"
                min="0"
                value={form.turnover_cost_per_unit}
                onChange={(event) => updateForm("turnover_cost_per_unit", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            Automation
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Keep these conservative until your data is clean.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Toggle
              label="Auto status updates"
              description="Future feature: update unit status based on dates."
              checked={form.auto_status_updates}
              onChange={(checked) => updateForm("auto_status_updates", checked)}
            />

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                Auto-mark Notice Days Before Lease End
              </span>
              <input
                type="number"
                min="0"
                value={form.auto_mark_notice_days}
                onChange={(event) => updateForm("auto_mark_notice_days", event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
              />
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Unit Rent Data
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Unit rent overrides the property default.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={fillEmptyRentsWithDefault}
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/5"
              >
                Fill Empty With Default
              </button>
              <button
                type="button"
                onClick={saveUnitRents}
                disabled={unitSaveState === "saving"}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {unitSaveState === "saving"
                  ? "Saving..."
                  : unitSaveState === "saved"
                    ? "Saved"
                    : "Save Unit Rents"}
              </button>
            </div>
          </div>

          <div className="mt-6 max-h-[520px] overflow-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Monthly Rent</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleUnits.map((unit) => {
                  const hasRent = unit.monthly_rent !== null && unit.monthly_rent !== undefined

                  return (
                    <tr key={unit.id} className="border-b border-white/5 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-white">
                        Unit {unit.unit_number}
                      </td>
                      <td className="px-4 py-3 capitalize text-zinc-400">
                        {statusLabel(unit.status)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          value={unit.monthly_rent ?? ""}
                          onChange={(event) => updateUnitRent(unit.id, event.target.value)}
                          placeholder={form.default_monthly_rent}
                          className="w-40 rounded-xl border border-white/10 bg-black px-3 py-2 text-white"
                        />
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {hasRent ? "Unit override" : "Property default"}
                      </td>
                    </tr>
                  )
                })}

                {visibleUnits.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      No units found for this property.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
