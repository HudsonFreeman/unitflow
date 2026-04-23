import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]

type TenantRequestBody = {
  to_property_id?: string
  to_unit_id?: string
  requested_date?: string | null
  move_out_date?: string | null
  move_in_date?: string | null
  reason?: string | null
}

function isValidDateString(value?: string | null) {
  if (!value) return true
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function getDateOnlyString(value?: string | null) {
  if (!value) return null
  return value.slice(0, 10)
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
      return NextResponse.json(
        { error: "Requested date is invalid." },
        { status: 400 }
      )
    }

    if (!isValidDateString(move_out_date)) {
      return NextResponse.json(
        { error: "Move-out date is invalid." },
        { status: 400 }
      )
    }

    if (!isValidDateString(move_in_date)) {
      return NextResponse.json(
        { error: "Move-in date is invalid." },
        { status: 400 }
      )
    }

    if (move_out_date && move_in_date) {
      const moveOut = new Date(move_out_date)
      const moveIn = new Date(move_in_date)

      if (moveIn.getTime() < moveOut.getTime()) {
        return NextResponse.json(
          { error: "Move-in date cannot be before move-out date." },
          { status: 400 }
        )
      }
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, property_id, unit_id, status, lease_end")
      .eq("user_id", user.id)
      .single()

    if (tenantError || !tenant) {
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

    const { data: destinationUnit, error: destinationUnitError } = await supabase
      .from("units")
      .select("id, property_id, status")
      .eq("id", to_unit_id)
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

    if (
      !["vacant", "make_ready", "notice"].includes(
        (destinationUnit.status ?? "").toLowerCase()
      )
    ) {
      return NextResponse.json(
        { error: "Destination unit is not available." },
        { status: 400 }
      )
    }

    const { data: existingTenantTransfer, error: existingTenantTransferError } = await supabase
      .from("transfers")
      .select("id")
      .eq("tenant_id", tenant.id)
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

    const { data: existingDestinationTransfer, error: existingDestinationTransferError } =
      await supabase
        .from("transfers")
        .select("id")
        .eq("to_unit_id", to_unit_id)
        .in("status", OPEN_TRANSFER_STATUSES)
        .maybeSingle()

    if (existingDestinationTransferError) {
      return NextResponse.json(
        { error: existingDestinationTransferError.message },
        { status: 500 }
      )
    }

    if (existingDestinationTransfer) {
      return NextResponse.json(
        { error: "That destination unit already has an open transfer assigned." },
        { status: 400 }
      )
    }

    const { data: destinationOccupant, error: destinationOccupantError } = await supabase
      .from("tenants")
      .select("id, lease_end, status")
      .eq("unit_id", to_unit_id)
      .neq("id", tenant.id)
      .not("status", "in", '("moved_out","transferred")')
      .maybeSingle()

    if (destinationOccupantError) {
      return NextResponse.json(
        { error: destinationOccupantError.message },
        { status: 500 }
      )
    }

    if (destinationOccupant && move_in_date && destinationOccupant.lease_end) {
      const requestedMoveIn = new Date(move_in_date)
      const occupantLeaseEnd = new Date(destinationOccupant.lease_end)

      if (
        !Number.isNaN(requestedMoveIn.getTime()) &&
        !Number.isNaN(occupantLeaseEnd.getTime()) &&
        occupantLeaseEnd.getTime() > requestedMoveIn.getTime()
      ) {
        return NextResponse.json(
          {
            error:
              "That unit is still occupied beyond your requested move-in date.",
          },
          { status: 400 }
        )
      }
    }

    const noteText = `Tenant request: ${reason.trim()}`

    const { data: insertedTransfer, error: insertError } = await supabase
      .from("transfers")
      .insert([
        {
          tenant_id: tenant.id,
          from_property_id: tenant.property_id,
          from_unit_id: tenant.unit_id,
          to_property_id,
          to_unit_id,
          requested_date: getDateOnlyString(requested_date) || new Date().toISOString().slice(0, 10),
          move_out_date: getDateOnlyString(move_out_date),
          move_in_date: getDateOnlyString(move_in_date),
          notes: noteText,
          status: "requested",
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