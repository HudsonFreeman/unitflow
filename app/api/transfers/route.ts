import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]

function toDateOnly(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetween(start: Date, end: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const {
      tenant_id,
      to_property_id,
      to_unit_id,
      requested_date,
      move_out_date,
      move_in_date,
      notes,
    } = await request.json()

    if (!tenant_id || !to_property_id || !to_unit_id) {
      return NextResponse.json(
        { error: "Tenant, destination property, and unit are required." },
        { status: 400 }
      )
    }

    if (!move_in_date) {
      return NextResponse.json(
        { error: "Move-in date is required." },
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

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden. Staff access required." },
        { status: 403 }
      )
    }

    const organizationId = membership.organization_id

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, organization_id, property_id, unit_id, status, lease_end")
      .eq("id", tenant_id)
      .eq("organization_id", organizationId)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 })
    }

    if (["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Tenant is not eligible for transfer." },
        { status: 400 }
      )
    }

    if (tenant.unit_id === to_unit_id) {
      return NextResponse.json(
        { error: "Cannot transfer to the same unit." },
        { status: 400 }
      )
    }

    const { data: destinationProperty, error: destinationPropertyError } =
      await supabase
        .from("properties")
        .select("id, organization_id, expected_vacancy_days")
        .eq("id", to_property_id)
        .eq("organization_id", organizationId)
        .single()

    if (destinationPropertyError || !destinationProperty) {
      return NextResponse.json(
        { error: "Destination property not found." },
        { status: 404 }
      )
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabase
      .from("units")
      .select("id, organization_id, property_id, status, monthly_rent")
      .eq("id", to_unit_id)
      .eq("organization_id", organizationId)
      .single()

    if (destinationUnitError || !destinationUnit) {
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

    const destinationStatus = (destinationUnit.status ?? "").toLowerCase()

    if (!["vacant", "make_ready", "notice"].includes(destinationStatus)) {
      return NextResponse.json(
        { error: "Destination unit is not available for transfer planning." },
        { status: 400 }
      )
    }

    const { data: existingTenantTransfer } = await supabase
      .from("transfers")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("organization_id", organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .maybeSingle()

    if (existingTenantTransfer) {
      return NextResponse.json(
        { error: "Tenant already has an open transfer." },
        { status: 400 }
      )
    }

    const { data: existingUnitTransfer } = await supabase
      .from("transfers")
      .select("id")
      .eq("to_unit_id", to_unit_id)
      .eq("organization_id", organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .maybeSingle()

    if (existingUnitTransfer) {
      return NextResponse.json(
        { error: "Unit already has an open transfer." },
        { status: 400 }
      )
    }

    const today = new Date()
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    let destinationAvailableDate: Date | null = null

    if (destinationStatus === "vacant") {
      destinationAvailableDate = todayDateOnly
    }

    if (destinationStatus === "make_ready") {
      destinationAvailableDate = addDays(todayDateOnly, 7)
    }

    const { data: outgoingTransfer } = await supabase
      .from("transfers")
      .select("move_out_date")
      .eq("from_unit_id", to_unit_id)
      .eq("organization_id", organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .not("move_out_date", "is", null)
      .order("move_out_date", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (outgoingTransfer?.move_out_date) {
      const outgoingDate = toDateOnly(outgoingTransfer.move_out_date)
      if (outgoingDate) destinationAvailableDate = outgoingDate
    }

    if (!destinationAvailableDate && ["notice", "occupied"].includes(destinationStatus)) {
      const { data: currentOccupant } = await supabase
        .from("tenants")
        .select("lease_end")
        .eq("unit_id", to_unit_id)
        .eq("organization_id", organizationId)
        .not("status", "in", '("moved_out","transferred")')
        .order("lease_end", { ascending: true })
        .limit(1)
        .maybeSingle()

      const leaseEndDate = toDateOnly(currentOccupant?.lease_end)
      if (leaseEndDate) destinationAvailableDate = leaseEndDate
    }

    if (!destinationAvailableDate) {
      return NextResponse.json(
        {
          error:
            "Destination unit availability is unknown. Add a lease end date or use a vacant/make-ready unit.",
        },
        { status: 400 }
      )
    }

    const requestedMoveInDate = toDateOnly(move_in_date)

    if (!requestedMoveInDate) {
      return NextResponse.json(
        { error: "Move-in date is invalid." },
        { status: 400 }
      )
    }

    if (requestedMoveInDate < destinationAvailableDate) {
      return NextResponse.json(
        {
          error: `This unit is not ready by the selected move-in date. Change move-in date to ${formatDate(
            destinationAvailableDate
          )} or later, or choose another unit.`,
        },
        { status: 400 }
      )
    }

    const expectedVacancyWithoutTransfer =
      destinationProperty.expected_vacancy_days ?? 14

    const actualVacancyWithTransfer = Math.max(
      0,
      daysBetween(destinationAvailableDate, requestedMoveInDate)
    )

    const vacancyDaysSaved = Math.max(
      0,
      expectedVacancyWithoutTransfer - actualVacancyWithTransfer
    )

    const monthlyRent =
      destinationUnit.monthly_rent === null ||
      destinationUnit.monthly_rent === undefined
        ? null
        : Number(destinationUnit.monthly_rent)

    const estimatedRevenueSaved =
      monthlyRent === null
        ? null
        : Number(((monthlyRent / 30) * vacancyDaysSaved).toFixed(2))

    const { error: insertError } = await supabase.from("transfers").insert([
      {
        organization_id: organizationId,
        tenant_id,
        from_property_id: tenant.property_id,
        from_unit_id: tenant.unit_id,
        to_property_id,
        to_unit_id,
        requested_date: requested_date || new Date().toISOString().slice(0, 10),
        move_out_date: move_out_date || null,
        move_in_date: move_in_date || null,
        notes: notes || null,
        status: "requested",
        created_by: user.id,
        expected_vacancy_days_without_transfer: expectedVacancyWithoutTransfer,
        expected_vacancy_days_with_transfer: actualVacancyWithTransfer,
        vacancy_days_saved: vacancyDaysSaved,
        estimated_revenue_saved: estimatedRevenueSaved,
      },
    ])

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create transfer.",
      },
      { status: 500 }
    )
  }
}