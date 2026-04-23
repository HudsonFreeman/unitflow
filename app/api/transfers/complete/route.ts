import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

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

    const { data: transfer } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single()

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
    }

    if (transfer.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved transfers can be completed." },
        { status: 400 }
      )
    }

    const { data: occupant } = await supabase
      .from("tenants")
      .select("id")
      .eq("unit_id", transfer.to_unit_id)
      .not("status", "in", '("moved_out","transferred")')
      .maybeSingle()

    if (occupant) {
      return NextResponse.json(
        { error: "Destination unit already has an active tenant." },
        { status: 400 }
      )
    }

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

    await supabase.from("units").update({ status: "vacant" }).eq("id", transfer.from_unit_id)
    await supabase.from("units").update({ status: "occupied" }).eq("id", transfer.to_unit_id)

    await supabase
      .from("transfers")
      .update({ status: "completed" })
      .eq("id", transfer_id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to complete transfer." }, { status: 500 })
  }
}