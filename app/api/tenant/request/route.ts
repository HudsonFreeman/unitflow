import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]
const DEFAULT_EXPECTED_VACANCY_DAYS = 14

/**
 * Tenant transfer request body.
 * These dates are tenant-selected dates and should remain the source of truth.
 */
type TenantRequestBody = {
  to_property_id?: string
  to_unit_id?: string
  requested_date?: string | null
  move_out_date?: string | null
  move_in_date?: string | null
  reason?: string | null
}

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function getDateOnlyString(value?: string | null) {
  if (!value) return null
  return value.slice(0, 10)
}

function isValidDateString(value?: string | null) {
  if (!value) return true
  return parseDate(value) !== null
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getDaysBetween(start: Date, end: Date) {
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  const diffMs = endOnly.getTime() - startOnly.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

function rangesOverlap(
  startA: Date | null,
  endA: Date | null,
  startB: Date | null,
  endB: Date | null
) {
  if (!startA || !startB) return true

  const safeEndA = endA ?? addDays(startA, 14)
  const safeEndB = endB ?? addDays(startB, 14)

  return startA.getTime() <= safeEndB.getTime() && startB.getTime() <= safeEndA.getTime()
}

function calculateVacancySavings({
  expectedVacancyDays,
  monthlyRent,
  moveOutDate,
  moveInDate,
}: {
  expectedVacancyDays: number | null
  monthlyRent: number | null
  moveOutDate: Date | null
  moveInDate: Date | null
}) {
  const expectedVacancyDaysWithoutTransfer =
    expectedVacancyDays ?? DEFAULT_EXPECTED_VACANCY_DAYS

  const actualVacancyDaysWithTransfer =
    moveOutDate && moveInDate
      ? Math.max(0, getDaysBetween(moveOutDate, moveInDate))
      : null

  const vacancyDaysSaved =
    actualVacancyDaysWithTransfer === null
      ? null
      : Math.max(0, expectedVacancyDaysWithoutTransfer - actualVacancyDaysWithTransfer)

  const estimatedRevenueSaved =
    vacancyDaysSaved === null || monthlyRent === null
      ? null
      : Number(((monthlyRent / 30) * vacancyDaysSaved).toFixed(2))

  return {
    expectedVacancyDaysWithoutTransfer,
    actualVacancyDaysWithTransfer,
    vacancyDaysSaved,
    estimatedRevenueSaved,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TenantRequestBody

    const {
      to_property_id,
      to_unit_id,
      requested_date,
      move_out_date,
      move_in_date,
      reason,
    } = body

    if (!to_property_id || !to_unit_id) {
      return NextResponse.json(
        { error: "Destination property and destination unit are required." },
        { status: 400 }
      )
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: "Reason for transfer is required." },
        { status: 400 }
      )
    }

    if (!isValidDateString(requested_date)) {
      return NextResponse.json({ error: "Requested date is invalid." }, { status: 400 })
    }

    if (!isValidDateString(move_out_date)) {
      return NextResponse.json({ error: "Move-out date is invalid." }, { status: 400 })
    }

    if (!isValidDateString(move_in_date)) {
      return NextResponse.json({ error: "Move-in date is invalid." }, { status: 400 })
    }

    const parsedMoveOut = parseDate(move_out_date)
    const parsedMoveIn = parseDate(move_in_date)

    if (parsedMoveOut && parsedMoveIn && parsedMoveIn.getTime() < parsedMoveOut.getTime()) {
      return NextResponse.json(
        { error: "Move-in date cannot be before move-out date." },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, organization_id, property_id, unit_id, status, lease_end")
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

    if (["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "This tenant is not eligible to submit a transfer request." },
        { status: 400 }
      )
    }

    if (tenant.unit_id === to_unit_id) {
      return NextResponse.json(
        { error: "Destination unit cannot be the same as your current unit." },
        { status: 400 }
      )
    }

    const organizationId = tenant.organization_id

    const { data: destinationProperty, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, organization_id, expected_vacancy_days")
      .eq("id", to_property_id)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 })
    }

    if (!destinationProperty) {
      return NextResponse.json(
        { error: "Destination property not found." },
        { status: 404 }
      )
    }

    const isSamePropertyTransfer = tenant.property_id === to_property_id

    if (!isSamePropertyTransfer) {
      const { data: propertyLink, error: propertyLinkError } = await supabaseAdmin
        .from("property_links")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("from_property_id", tenant.property_id)
        .eq("to_property_id", to_property_id)
        .maybeSingle()

      if (propertyLinkError) {
        return NextResponse.json({ error: propertyLinkError.message }, { status: 500 })
      }

      if (!propertyLink) {
        return NextResponse.json(
          { error: "Transfers between these properties are not allowed." },
          { status: 400 }
        )
      }
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabaseAdmin
      .from("units")
      .select("id, property_id, organization_id, status, monthly_rent")
      .eq("id", to_unit_id)
      .eq("organization_id", organizationId)
      .maybeSingle()

    if (destinationUnitError) {
      return NextResponse.json({ error: destinationUnitError.message }, { status: 500 })
    }

    if (!destinationUnit) {
      return NextResponse.json(
        { error: "Destination unit not found." },
        { status: 404 }
      )
    }

    if (destinationUnit.property_id !== to_property_id) {
      return NextResponse.json(
        { error: "Destination unit does not belong to the selected property." },
        { status: 400 }
      )
    }

    const { data: existingTenantTransfer, error: existingTenantTransferError } =
      await supabaseAdmin
        .from("transfers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("organization_id", organizationId)
        .in("status", OPEN_TRANSFER_STATUSES)
        .maybeSingle()

    if (existingTenantTransferError) {
      return NextResponse.json(
        { error: existingTenantTransferError.message },
        { status: 500 }
      )
    }

    if (existingTenantTransfer) {
      return NextResponse.json(
        { error: "You already have an open transfer request." },
        { status: 400 }
      )
    }

    const { data: existingDestinationTransfers, error: existingDestinationTransferError } =
      await supabaseAdmin
        .from("transfers")
        .select("id, move_in_date, move_out_date, status")
        .eq("to_unit_id", to_unit_id)
        .eq("organization_id", organizationId)
        .in("status", OPEN_TRANSFER_STATUSES)

    if (existingDestinationTransferError) {
      return NextResponse.json(
        { error: existingDestinationTransferError.message },
        { status: 500 }
      )
    }

    const requestedWindowStart = parsedMoveIn
    const requestedWindowEnd = parsedMoveIn ? addDays(parsedMoveIn, 14) : null

    const overlappingDestinationTransfer = (existingDestinationTransfers ?? []).find(
      (transfer) => {
        const existingStart = parseDate(transfer.move_in_date)
        const existingEnd = existingStart ? addDays(existingStart, 14) : null

        return rangesOverlap(
          requestedWindowStart,
          requestedWindowEnd,
          existingStart,
          existingEnd
        )
      }
    )

    if (overlappingDestinationTransfer) {
      return NextResponse.json(
        {
          error:
            "That destination unit already has an open transfer during this move-in window.",
        },
        { status: 400 }
      )
    }

    const destinationStatus = (destinationUnit.status ?? "").toLowerCase()

    const { data: activeDestinationOccupants, error: occupantError } =
      await supabaseAdmin
        .from("tenants")
        .select("id, lease_end, status")
        .eq("unit_id", to_unit_id)
        .eq("organization_id", organizationId)
        .neq("id", tenant.id)
        .not("status", "in", '("moved_out","transferred")')

    if (occupantError) {
      return NextResponse.json({ error: occupantError.message }, { status: 500 })
    }

    const occupants = activeDestinationOccupants ?? []

    if (["vacant", "make_ready", "notice"].includes(destinationStatus)) {
      // allowed
    } else if (destinationStatus === "occupied") {
      if (!parsedMoveIn) {
        return NextResponse.json(
          {
            error:
              "Preferred move-in date is required for occupied units with future availability.",
          },
          { status: 400 }
        )
      }

      if (occupants.length === 0) {
        return NextResponse.json(
          { error: "Destination unit is occupied but no occupant timing was found." },
          { status: 400 }
        )
      }

      const blockingOccupant = occupants.find((occupant) => {
        const leaseEnd = parseDate(occupant.lease_end)
        if (!leaseEnd) return true
        return leaseEnd.getTime() > parsedMoveIn.getTime()
      })

      if (blockingOccupant) {
        return NextResponse.json(
          {
            error:
              "Destination unit is occupied beyond your preferred move-in date.",
          },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: "Destination unit is not available." },
        { status: 400 }
      )
    }

    const monthlyRent =
      destinationUnit.monthly_rent === null || destinationUnit.monthly_rent === undefined
        ? null
        : Number(destinationUnit.monthly_rent)

    const expectedVacancyDays =
      destinationProperty.expected_vacancy_days === null ||
      destinationProperty.expected_vacancy_days === undefined
        ? null
        : Number(destinationProperty.expected_vacancy_days)

    const savings = calculateVacancySavings({
      expectedVacancyDays,
      monthlyRent,
      moveOutDate: parsedMoveOut,
      moveInDate: parsedMoveIn,
    })

    const noteText = `Tenant request: ${reason.trim()}`

    const { data: insertedTransfer, error: insertError } = await supabaseAdmin
      .from("transfers")
      .insert([
        {
          organization_id: organizationId,
          tenant_id: tenant.id,
          from_property_id: tenant.property_id,
          from_unit_id: tenant.unit_id,
          to_property_id,
          to_unit_id,
          requested_date:
            getDateOnlyString(requested_date) ||
            new Date().toISOString().slice(0, 10),
          move_out_date: getDateOnlyString(move_out_date),
          move_in_date: getDateOnlyString(move_in_date),
          notes: noteText,
          status: "requested",
          created_by: user.id,
          expected_vacancy_days_without_transfer:
            savings.expectedVacancyDaysWithoutTransfer,
          expected_vacancy_days_with_transfer:
            savings.actualVacancyDaysWithTransfer,
          vacancy_days_saved: savings.vacancyDaysSaved,
          estimated_revenue_saved: savings.estimatedRevenueSaved,
        },
      ])
      .select("id")
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      transfer_id: insertedTransfer.id,
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to submit tenant transfer request." },
      { status: 500 }
    )
  }
}
