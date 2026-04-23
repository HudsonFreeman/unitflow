import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { getCurrentOrganizationContext } from "@/lib/current-organization"

const OPEN_TRANSFER_STATUSES = ["requested", "approved", "scheduled"]

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

    const currentOrg = await getCurrentOrganizationContext()
    const supabase = await createClient()

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, organization_id, property_id, unit_id, status")
      .eq("id", tenant_id)
      .eq("organization_id", currentOrg.organizationId)
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

    const { data: destinationProperty, error: destinationPropertyError } = await supabase
      .from("properties")
      .select("id, organization_id")
      .eq("id", to_property_id)
      .eq("organization_id", currentOrg.organizationId)
      .single()

    if (destinationPropertyError || !destinationProperty) {
      return NextResponse.json(
        { error: "Destination property not found." },
        { status: 404 }
      )
    }

    const { data: destinationUnit, error: destinationUnitError } = await supabase
      .from("units")
      .select("id, organization_id, property_id, status")
      .eq("id", to_unit_id)
      .eq("organization_id", currentOrg.organizationId)
      .single()

    if (destinationUnitError || !destinationUnit) {
      return NextResponse.json({ error: "Destination unit not found." }, { status: 404 })
    }

    if (destinationUnit.property_id !== to_property_id) {
      return NextResponse.json(
        { error: "Destination unit does not belong to the selected property." },
        { status: 400 }
      )
    }

    if (!["vacant", "make_ready", "notice"].includes((destinationUnit.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Destination unit is not available." },
        { status: 400 }
      )
    }

    const { data: existingTenantTransfer } = await supabase
      .from("transfers")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("organization_id", currentOrg.organizationId)
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
      .eq("organization_id", currentOrg.organizationId)
      .in("status", OPEN_TRANSFER_STATUSES)
      .maybeSingle()

    if (existingUnitTransfer) {
      return NextResponse.json(
        { error: "Unit already has an open transfer." },
        { status: 400 }
      )
    }

    const { error: insertError } = await supabase.from("transfers").insert([
      {
        organization_id: currentOrg.organizationId,
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
        created_by: currentOrg.userId,
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