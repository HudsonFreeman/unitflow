import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

type DestinationOccupant = {
  id: string
  lease_end: string | null
  status: string
}

function parseDate(value?: string | null) {
  if (!value) return null

  const normalizedValue = value.includes("T") ? value : `${value}T12:00:00`
  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) return null

  return date
}

function dateOnlyTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function isAfterDate(a: Date, b: Date) {
  return dateOnlyTime(a) > dateOnlyTime(b)
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
    } = await supabase.auth.getUser()

    if (!user) {
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

    if (transfer.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved transfers can be completed." },
        { status: 400 }
      )
    }

    const moveInDate = parseDate(transfer.move_in_date)

    if (!moveInDate) {
      return NextResponse.json(
        { error: "Transfer is missing a valid move-in date." },
        { status: 400 }
      )
    }

    const { data: destinationOccupantsRaw, error: occupantError } = await supabase
      .from("tenants")
      .select("id, lease_end, status")
      .eq("unit_id", transfer.to_unit_id)
      .neq("id", transfer.tenant_id)
      .not("status", "in", '("moved_out","transferred")')

    if (occupantError) {
      return NextResponse.json({ error: occupantError.message }, { status: 500 })
    }

    const destinationOccupants = (destinationOccupantsRaw ?? []) as DestinationOccupant[]

    const blockingOccupant = destinationOccupants.find((occupant) => {
      const leaseEnd = parseDate(occupant.lease_end)

      // If we don't know when they leave → assume blocking (safe fallback)
      if (!leaseEnd) return true

      // Only block if they are STILL there AFTER move-in date
      return isAfterDate(leaseEnd, moveInDate)
    })

    if (blockingOccupant) {
      return NextResponse.json(
        {
          error:
            "Destination unit still has an active tenant after the requested move-in date.",
        },
        { status: 400 }
      )
    }

    // Move out any existing occupants in that unit
    const { error: destinationUpdateError } = await supabase
      .from("tenants")
      .update({ status: "moved_out" })
      .eq("unit_id", transfer.to_unit_id)
      .neq("id", transfer.tenant_id)
      .not("status", "in", '("moved_out","transferred")')

    if (destinationUpdateError) {
      return NextResponse.json({ error: destinationUpdateError.message }, { status: 500 })
    }

    // Move the transferring tenant in
    const { error: tenantUpdate } = await supabase
      .from("tenants")
      .update({
        property_id: transfer.to_property_id,
        unit_id: transfer.to_unit_id,
        status: "active",
      })
      .eq("id", transfer.tenant_id)

    if (tenantUpdate) {
      return NextResponse.json({ error: tenantUpdate.message }, { status: 500 })
    }

    // Update unit statuses
    const { error: fromUnitError } = await supabase
      .from("units")
      .update({ status: "vacant" })
      .eq("id", transfer.from_unit_id)

    if (fromUnitError) {
      return NextResponse.json({ error: fromUnitError.message }, { status: 500 })
    }

    const { error: toUnitError } = await supabase
      .from("units")
      .update({ status: "occupied" })
      .eq("id", transfer.to_unit_id)

    if (toUnitError) {
      return NextResponse.json({ error: toUnitError.message }, { status: 500 })
    }

    // Mark transfer complete
    const { error: transferUpdate } = await supabase
      .from("transfers")
      .update({ status: "completed" })
      .eq("id", transfer_id)

    if (transferUpdate) {
      return NextResponse.json({ error: transferUpdate.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to complete transfer." }, { status: 500 })
  }
}