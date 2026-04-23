import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { getCurrentOrganizationContext } from "@/lib/current-organization"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    const property_id = String(formData.get("property_id") ?? "").trim()
    const unit_id = String(formData.get("unit_id") ?? "").trim()
    const first_name = String(formData.get("first_name") ?? "").trim()
    const last_name = String(formData.get("last_name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const phone = String(formData.get("phone") ?? "").trim()
    const lease_start = String(formData.get("lease_start") ?? "").trim()
    const lease_end = String(formData.get("lease_end") ?? "").trim()

    if (!property_id || !unit_id || !first_name || !last_name) {
      return NextResponse.json(
        { error: "Property, unit, first name, and last name are required." },
        { status: 400 }
      )
    }

    const currentOrg = await getCurrentOrganizationContext()
    const supabase = await createClient()

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, organization_id")
      .eq("id", property_id)
      .eq("organization_id", currentOrg.organizationId)
      .single()

    if (propertyError || !property) {
      return NextResponse.json(
        { error: "Property not found in your organization." },
        { status: 404 }
      )
    }

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, property_id, organization_id, status")
      .eq("id", unit_id)
      .eq("organization_id", currentOrg.organizationId)
      .single()

    if (unitError || !unit) {
      return NextResponse.json(
        { error: "Unit not found in your organization." },
        { status: 404 }
      )
    }

    if (unit.property_id !== property_id) {
      return NextResponse.json(
        { error: "Selected unit does not belong to the selected property." },
        { status: 400 }
      )
    }

    if (!["vacant", "make_ready", "notice"].includes((unit.status ?? "").toLowerCase())) {
      return NextResponse.json(
        { error: "Selected unit is not available." },
        { status: 400 }
      )
    }

    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("unit_id", unit_id)
      .eq("organization_id", currentOrg.organizationId)
      .not("status", "in", '("moved_out","transferred")')
      .maybeSingle()

    if (existingTenant) {
      return NextResponse.json(
        { error: "That unit already has an active tenant." },
        { status: 400 }
      )
    }

    const { error: insertError } = await supabase.from("tenants").insert([
      {
        organization_id: currentOrg.organizationId,
        property_id,
        unit_id,
        first_name,
        last_name,
        email: email || null,
        phone: phone || null,
        lease_start: lease_start || null,
        lease_end: lease_end || null,
        status: "active",
        created_by: currentOrg.userId,
      },
    ])

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    const { error: unitUpdateError } = await supabase
      .from("units")
      .update({ status: "occupied" })
      .eq("id", unit_id)
      .eq("organization_id", currentOrg.organizationId)

    if (unitUpdateError) {
      return NextResponse.json({ error: unitUpdateError.message }, { status: 500 })
    }

    return NextResponse.redirect(new URL("/tenants", request.url))
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create tenant.",
      },
      { status: 500 }
    )
  }
}