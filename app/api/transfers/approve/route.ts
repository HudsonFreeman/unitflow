import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]

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

    const { data: transfer, error: transferError } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single()

    if (transferError || !transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
    }

    if ((transfer.status ?? "").toLowerCase() !== "requested") {
      return NextResponse.json(
        { error: "Only requested transfers can be approved." },
        { status: 400 }
      )
    }

    const { data: tenantConflict } = await supabase
      .from("transfers")
      .select("id")
      .eq("tenant_id", transfer.tenant_id)
      .in("status", OPEN_TRANSFER_STATUSES)
      .neq("id", transfer.id)
      .maybeSingle()

    if (tenantConflict) {
      return NextResponse.json(
        { error: "Tenant has another open transfer." },
        { status: 400 }
      )
    }

    const { data: unitConflict } = await supabase
      .from("transfers")
      .select("id")
      .eq("to_unit_id", transfer.to_unit_id)
      .in("status", OPEN_TRANSFER_STATUSES)
      .neq("id", transfer.id)
      .maybeSingle()

    if (unitConflict) {
      return NextResponse.json(
        { error: "Unit already reserved by another transfer." },
        { status: 400 }
      )
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabase
      .from("units")
      .select("id, status")
      .eq("id", transfer.to_unit_id)
      .single()

    if (destinationUnitError || !destinationUnit) {
      return NextResponse.json({ error: "Destination unit not found." }, { status: 404 })
    }

    if (!["vacant", "make_ready", "notice"].includes((destinationUnit.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Destination unit is no longer available." },
        { status: 400 }
      )
    }

    const { data: currentOccupant } = await supabase
      .from("tenants")
      .select("id, first_name, last_name, lease_end, status")
      .eq("unit_id", transfer.to_unit_id)
      .neq("id", transfer.tenant_id)
      .not("status", "in", '("moved_out","transferred")')
      .maybeSingle()

    if (currentOccupant && transfer.move_in_date) {
      const occupantLeaveDate = transfer.move_out_date || currentOccupant.lease_end

      if (occupantLeaveDate) {
        const requestedMoveIn = new Date(transfer.move_in_date)
        const availableDate = new Date(occupantLeaveDate)

        if (
          !Number.isNaN(requestedMoveIn.getTime()) &&
          !Number.isNaN(availableDate.getTime()) &&
          availableDate.getTime() > requestedMoveIn.getTime()
        ) {
          const overlapDays = Math.round(
            (availableDate.getTime() - requestedMoveIn.getTime()) / (1000 * 60 * 60 * 24)
          )

          return NextResponse.json(
            {
              error: `Cannot approve transfer. Destination unit is still occupied for ${overlapDays} more day(s).`,
            },
            { status: 400 }
          )
        }
      }
    }

    const { error } = await supabase
      .from("transfers")
      .update({
        status: "approved",
        approved_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", transfer_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to approve transfer." }, { status: 500 })
  }
}
