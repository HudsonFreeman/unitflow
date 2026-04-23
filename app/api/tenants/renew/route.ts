import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

type TransferRequestBody = {
  tenant_id?: string
  to_property_id?: string
  to_unit_id?: string
  requested_date?: string | null
  move_out_date?: string | null
  move_in_date?: string | null
  notes?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TransferRequestBody
    const {
      tenant_id,
      to_property_id,
      to_unit_id,
      requested_date,
      move_out_date,
      move_in_date,
      notes,
    } = body

    if (!tenant_id || !to_property_id || !to_unit_id) {
      return NextResponse.json(
        { error: "Tenant, destination property, and destination unit are required." },
        { status: 400 }
      )
    }

    if (move_out_date && move_in_date) {
      const moveOut = new Date(move_out_date)
      const moveIn = new Date(move_in_date)

      if (
        Number.isNaN(moveOut.getTime()) ||
        Number.isNaN(moveIn.getTime()) ||
        moveIn.getTime() < moveOut.getTime()
      ) {
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
      .select("id, property_id, unit_id, status")
      .eq("id", tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 })
    }

    if (["moved_out", "transferred"].includes((tenant.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "This tenant is no longer eligible for transfer." },
        { status: 400 }
      )
    }

    if (tenant.unit_id === to_unit_id) {
      return NextResponse.json(
        { error: "Destination unit cannot be the same as the tenant's current unit." },
        { status: 400 }
      )
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabase
      .from("units")
      .select("id, property_id, status")
      .eq("id", to_unit_id)
      .single()

    if (destinationUnitError || !destinationUnit) {
      return NextResponse.json({ error: "Destination unit not found." }, { status: 404 })
    }

    if (destinationUnit.property_id !== to_property_id) {
      return NextResponse.json(
        { error: "Destination unit does not belong to the selected destination property." },
        { status: 400 }
      )
    }

    if (!["vacant", "make_ready", "notice"].includes((destinationUnit.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Destination unit is not available for transfer." },
        { status: 400 }
      )
    }

    const { data: existingTenantOpenTransfer } = await supabase
      .from("transfers")
      .select("id")
      .eq("tenant_id", tenant_id)
      .in("status", ["requested", "approved"])
      .maybeSingle()

    if (existingTenantOpenTransfer) {
      return NextResponse.json(
        { error: "This tenant already has an open transfer." },
        { status: 400 }
      )
    }

    const { data: existingDestinationOpenTransfer } = await supabase
      .from("transfers")
      .select("id")
      .eq("to_unit_id", to_unit_id)
      .in("status", ["requested", "approved"])
      .maybeSingle()

    if (existingDestinationOpenTransfer) {
      return NextResponse.json(
        { error: "This destination unit already has an open transfer assigned to it." },
        { status: 400 }
      )
    }

    const transferInsert = {
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
    }

    const { data: insertedTransfer, error: insertError } = await supabase
      .from("transfers")
      .insert([transferInsert])
      .select("id")
      .single()

    if (insertError) {
      const message = insertError.message.toLowerCase()

      if (message.includes("duplicate") || message.includes("unique")) {
        return NextResponse.json(
          { error: "A duplicate open transfer was blocked." },
          { status: 400 }
        )
      }

      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, transfer_id: insertedTransfer.id })
  } catch {
    return NextResponse.json({ error: "Failed to create transfer." }, { status: 500 })
  }
}