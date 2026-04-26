import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]

type TenantRow = {
  id: string
  unit_id: string
  property_id: string
  organization_id: string
  status: string | null
  lease_end: string | null
}

type UnitRow = {
  id: string
  unit_number: string
  property_id: string
  organization_id: string
  status: string | null
}

type TransferRow = {
  id: string
  status: string | null
  tenant_id: string
  from_unit_id: string | null
  to_unit_id: string | null
  move_out_date: string | null
  move_in_date: string | null
  organization_id: string
}

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateOnly(date: Date | null) {
  if (!date) return null
  return date.toISOString().slice(0, 10)
}

function minDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date)

  if (validDates.length === 0) return null

  return validDates.reduce((earliest, current) =>
    current.getTime() < earliest.getTime() ? current : earliest
  )
}

function maxDate(dates: Array<Date | null>) {
  const validDates = dates.filter((date): date is Date => date instanceof Date)

  if (validDates.length === 0) return null

  return validDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  )
}

function getGapDays(availableDate: Date | null, moveInDate: Date | null) {
  if (!availableDate || !moveInDate) return null

  return Math.round(
    (startOfDay(availableDate).getTime() - startOfDay(moveInDate).getTime()) /
      (1000 * 60 * 60 * 24)
  )
}

function getTimingLabel(gapDays: number | null) {
  if (gapDays === null) return "Unknown timing"
  if (gapDays < -14) return "Available early"
  if (gapDays < 0) return "Available slightly early"
  if (gapDays <= 2) return "Best fit"
  if (gapDays <= 7) return "Slight delay"
  if (gapDays <= 14) return "Delayed"
  return "Too late"
}

function getExpectedAvailableDate(
  unit: UnitRow,
  tenants: TenantRow[],
  transfers: TransferRow[]
) {
  const today = startOfDay(new Date())
  const unitStatus = (unit.status ?? "").toLowerCase()

  const activeOccupants = tenants.filter(
    (tenant) =>
      tenant.unit_id === unit.id &&
      !["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())
  )

  const relevantMoveOutTransfers = transfers.filter(
    (transfer) =>
      transfer.from_unit_id === unit.id &&
      OPEN_TRANSFER_STATUSES.includes((transfer.status ?? "").toLowerCase())
  )

  const occupantLeaseEnds = activeOccupants.map((tenant) =>
    parseDate(tenant.lease_end)
  )

  const transferMoveOuts = relevantMoveOutTransfers.map((transfer) =>
    parseDate(transfer.move_out_date)
  )

  const earliestLeaseEnd = minDate(occupantLeaseEnds)
  const latestTransferMoveOut = maxDate(transferMoveOuts)

  if (unitStatus === "vacant") {
    return {
      expectedAvailableDate: today,
      reason: "Unit is currently vacant.",
    }
  }

  if (unitStatus === "make_ready") {
    return {
      expectedAvailableDate: addDays(today, 7),
      reason: "Unit is in make-ready status. Estimated 7-day prep window.",
    }
  }

  if (unitStatus === "notice") {
    if (earliestLeaseEnd) {
      const date = startOfDay(earliestLeaseEnd)

      return {
        expectedAvailableDate: date.getTime() < today.getTime() ? today : date,
        reason: "Unit is on notice. Availability is based on lease end timing.",
      }
    }

    if (latestTransferMoveOut) {
      const date = startOfDay(latestTransferMoveOut)

      return {
        expectedAvailableDate: date.getTime() < today.getTime() ? today : date,
        reason: "Unit is on notice. Availability is based on scheduled move-out.",
      }
    }

    return {
      expectedAvailableDate: null,
      reason: "Unit is on notice, but no reliable release date was found.",
    }
  }

  if (unitStatus === "occupied") {
    if (earliestLeaseEnd) {
      const date = startOfDay(earliestLeaseEnd)

      return {
        expectedAvailableDate: date.getTime() < today.getTime() ? today : date,
        reason: "Unit is occupied. Availability is based on lease end timing.",
      }
    }

    if (latestTransferMoveOut) {
      const date = startOfDay(latestTransferMoveOut)

      return {
        expectedAvailableDate: date.getTime() < today.getTime() ? today : date,
        reason:
          "Unit is occupied. Availability is based on scheduled transfer move-out.",
      }
    }

    return {
      expectedAvailableDate: null,
      reason: "Unit is occupied and no reliable release date was found.",
    }
  }

  return {
    expectedAvailableDate: null,
    reason: "No reliable availability timing was found for this unit.",
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const propertyId = searchParams.get("property_id")
    const moveInDateValue = searchParams.get("move_in_date")
    const moveOutDateValue = searchParams.get("move_out_date")

    if (!propertyId) {
      return NextResponse.json(
        { error: "Destination property is required." },
        { status: 400 }
      )
    }

    const preferredMoveIn = parseDate(moveInDateValue)
    const preferredMoveOut = parseDate(moveOutDateValue)

    if (!preferredMoveIn) {
      return NextResponse.json(
        { error: "Preferred move-in date is required." },
        { status: 400 }
      )
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, unit_id, property_id, organization_id, status, lease_end")
      .eq("user_id", user.id)
      .maybeSingle()

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 })
    }

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant record not found for this login." },
        { status: 404 }
      )
    }

    const tenantRow = tenant as TenantRow
    const organizationId = tenantRow.organization_id

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 })
    }

    if (!property) {
      return NextResponse.json(
        { error: "Destination property not found." },
        { status: 404 }
      )
    }

    const [unitsQuery, tenantsQuery, transfersQuery] = await Promise.all([
      supabaseAdmin
        .from("units")
        .select("id, unit_number, property_id, organization_id, status")
        .eq("organization_id", organizationId)
        .eq("property_id", propertyId)
        .order("unit_number"),
      supabaseAdmin
        .from("tenants")
        .select("id, unit_id, property_id, organization_id, status, lease_end")
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("transfers")
        .select(
          "id, status, tenant_id, from_unit_id, to_unit_id, move_out_date, move_in_date, organization_id"
        )
        .eq("organization_id", organizationId)
        .in("status", OPEN_TRANSFER_STATUSES),
    ])

    if (unitsQuery.error) {
      return NextResponse.json({ error: unitsQuery.error.message }, { status: 500 })
    }

    if (tenantsQuery.error) {
      return NextResponse.json(
        { error: tenantsQuery.error.message },
        { status: 500 }
      )
    }

    if (transfersQuery.error) {
      return NextResponse.json(
        { error: transfersQuery.error.message },
        { status: 500 }
      )
    }

    const units = (unitsQuery.data ?? []) as UnitRow[]
    const tenants = (tenantsQuery.data ?? []) as TenantRow[]
    const transfers = (transfersQuery.data ?? []) as TransferRow[]

    const windowStart = preferredMoveOut
      ? startOfDay(preferredMoveOut)
      : startOfDay(addDays(preferredMoveIn, -14))

    const windowEnd = startOfDay(addDays(preferredMoveIn, 14))

    const availableUnits = units
      .filter((unit) => unit.id !== tenantRow.unit_id)
      .filter(
        (unit) =>
          !transfers.some(
            (transfer) =>
              transfer.to_unit_id === unit.id &&
              OPEN_TRANSFER_STATUSES.includes(
                (transfer.status ?? "").toLowerCase()
              )
          )
      )
      .map((unit) => {
        const availability = getExpectedAvailableDate(unit, tenants, transfers)
        const expectedAvailableDate = availability.expectedAvailableDate
        const gapDays = getGapDays(expectedAvailableDate, preferredMoveIn)

        return {
          id: unit.id,
          unit_number: unit.unit_number,
          property_id: unit.property_id,
          status: unit.status,
          expected_available_date: formatDateOnly(expectedAvailableDate),
          gap_days: gapDays,
          timing_label: getTimingLabel(gapDays),
          timing_reason: availability.reason,
        }
      })
      .filter((unit) => {
        if (!unit.expected_available_date) return false

        const expected = parseDate(unit.expected_available_date)
        if (!expected) return false

        const expectedDay = startOfDay(expected)

        return (
          expectedDay.getTime() >= windowStart.getTime() &&
          expectedDay.getTime() <= windowEnd.getTime()
        )
      })
      .sort((a, b) => {
        if (a.gap_days === null && b.gap_days === null) {
          return a.unit_number.localeCompare(b.unit_number, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        }

        if (a.gap_days === null) return 1
        if (b.gap_days === null) return -1

        const gapDifference = Math.abs(a.gap_days) - Math.abs(b.gap_days)

        if (gapDifference !== 0) return gapDifference

        return a.unit_number.localeCompare(b.unit_number, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      })

    return NextResponse.json({
      units: availableUnits,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load available units.",
      },
      { status: 500 }
    )
  }
}