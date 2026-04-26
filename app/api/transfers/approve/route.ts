import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]
const TURNOVER_DAYS = 2

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
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

export async function POST(request: NextRequest) {
  try {
    const { transfer_id } = await request.json()

    if (!transfer_id) {
      return NextResponse.json({ error: "Transfer ID required." }, { status: 400 })
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
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

    const { data: transfer, error: transferError } = await supabaseAdmin
    .from("transfers")
    .select("*")
    .eq("id", transfer_id)
    .eq("organization_id", organizationId)
    .single()
  
  if (transferError || !transfer) {
    return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
  }
  
  const { data: propertyAccess } = await supabaseAdmin
    .from("property_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("property_id", transfer.to_property_id)
    .maybeSingle()
  
  if (!propertyAccess) {
    return NextResponse.json(
      { error: "Only destination property staff can approve this transfer." },
      { status: 403 }
    )
  }
  
    if (transferError || !transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
    }

    if ((transfer.status ?? "").toLowerCase() !== "requested") {
      return NextResponse.json(
        { error: "Only requested transfers can be approved." },
        { status: 400 }
      )
    }

    const { data: tenantConflict, error: tenantConflictError } = await supabaseAdmin
      .from("transfers")
      .select("id")
      .eq("tenant_id", transfer.tenant_id)
      .eq("organization_id", organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .neq("id", transfer.id)
      .maybeSingle()

    if (tenantConflictError) {
      return NextResponse.json({ error: tenantConflictError.message }, { status: 500 })
    }

    if (tenantConflict) {
      return NextResponse.json(
        { error: "Tenant has another open transfer." },
        { status: 400 }
      )
    }

    const { data: unitConflicts, error: unitConflictError } = await supabaseAdmin
      .from("transfers")
      .select("id, move_in_date, move_out_date, status")
      .eq("to_unit_id", transfer.to_unit_id)
      .eq("organization_id", organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .neq("id", transfer.id)

    if (unitConflictError) {
      return NextResponse.json({ error: unitConflictError.message }, { status: 500 })
    }

    const currentMoveIn = parseDate(transfer.move_in_date)
    const currentWindowEnd = currentMoveIn ? addDays(currentMoveIn, 14) : null

    const overlappingUnitConflict = (unitConflicts ?? []).find((conflict) => {
      const conflictMoveIn = parseDate(conflict.move_in_date)
      const conflictWindowEnd = conflictMoveIn ? addDays(conflictMoveIn, 14) : null

      return rangesOverlap(
        currentMoveIn,
        currentWindowEnd,
        conflictMoveIn,
        conflictWindowEnd
      )
    })

    if (overlappingUnitConflict) {
      return NextResponse.json(
        {
          error: "Unit already has another open transfer during this move-in window.",
        },
        { status: 400 }
      )
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabaseAdmin
      .from("units")
      .select("id, property_id, organization_id, status")
      .eq("id", transfer.to_unit_id)
      .eq("organization_id", organizationId)
      .single()

    if (destinationUnitError || !destinationUnit) {
      return NextResponse.json({ error: "Destination unit not found." }, { status: 404 })
    }

    const destinationStatus = (destinationUnit.status ?? "").toLowerCase()

    const { data: activeOccupants, error: occupantError } = await supabaseAdmin
      .from("tenants")
      .select("id, first_name, last_name, lease_end, status")
      .eq("unit_id", transfer.to_unit_id)
      .eq("organization_id", organizationId)
      .neq("id", transfer.tenant_id)
      .not("status", "in", '("moved_out","transferred")')

    if (occupantError) {
      return NextResponse.json({ error: occupantError.message }, { status: 500 })
    }

    const occupants = activeOccupants ?? []

    if (["vacant", "make_ready", "notice"].includes(destinationStatus)) {
      // allowed
    } else if (destinationStatus === "occupied") {
      if (!currentMoveIn) {
        return NextResponse.json(
          {
            error:
              "Cannot approve transfer. Move-in date is required for an occupied destination unit.",
          },
          { status: 400 }
        )
      }

      if (occupants.length === 0) {
        return NextResponse.json(
          {
            error:
              "Cannot approve transfer. Destination unit is occupied but no occupant timing was found.",
          },
          { status: 400 }
        )
      }

      const blockingOccupant = occupants.find((occupant) => {
        const leaseEnd = parseDate(occupant.lease_end)

        if (!leaseEnd) return true

        const readyDate = addDays(leaseEnd, TURNOVER_DAYS)

        return readyDate.getTime() > currentMoveIn.getTime()
      })

      if (blockingOccupant) {
        return NextResponse.json(
          {
            error: `Cannot approve transfer. Destination unit needs ${TURNOVER_DAYS} turnover day(s) after the current lease ends.`,
          },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: "Destination unit is no longer available." },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from("transfers")
      .update({
        status: "approved",
        approved_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", transfer_id)
      .eq("organization_id", organizationId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to approve transfer." }, { status: 500 })
  }
}