import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

type OrganizationMemberRow = {
  user_id: string
  organization_id: string
  role: string
}

type TenantRow = {
  id: string
  organization_id: string
  property_id: string
  unit_id: string
}

type UnitRow = {
  id: string
  organization_id: string
  property_id: string
  status: string | null
}

type ActiveOrgRow = {
  organization_id: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const tenant_id = String(body.tenant_id ?? "").trim()
    const to_property_id = String(body.to_property_id ?? "").trim()
    const to_unit_id = String(body.to_unit_id ?? "").trim()
    const requested_date = String(body.requested_date ?? "").trim()
    const move_out_date = String(body.move_out_date ?? "").trim()
    const move_in_date = String(body.move_in_date ?? "").trim()
    const notes = String(body.notes ?? "").trim()

    if (!tenant_id) {
      return NextResponse.json({ error: "Tenant is required." }, { status: 400 })
    }

    if (!to_property_id) {
      return NextResponse.json(
        { error: "Destination property is required." },
        { status: 400 }
      )
    }

    if (!to_unit_id) {
      return NextResponse.json(
        { error: "Destination unit is required." },
        { status: 400 }
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const { data: activeOrgRow, error: activeOrgError } = await supabase
      .from("user_active_org")
      .select("organization_id")
      .eq("user_id", user.id)
      .single()

    if (activeOrgError || !activeOrgRow) {
      return NextResponse.json(
        { error: "No active organization found." },
        { status: 403 }
      )
    }

    const activeOrg = activeOrgRow as ActiveOrgRow
    const organization_id = activeOrg.organization_id

    const { data: membershipRows, error: membershipError } = await supabase
      .from("organization_members")
      .select("user_id, organization_id, role")
      .eq("user_id", user.id)
      .eq("organization_id", organization_id)

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      )
    }

    if (!membershipRows || membershipRows.length === 0) {
      return NextResponse.json(
        { error: "No organization membership found." },
        { status: 403 }
      )
    }

    const membership = membershipRows[0] as OrganizationMemberRow

    const { data: tenantRows, error: tenantError } = await supabase
      .from("tenants")
      .select("id, organization_id, property_id, unit_id")
      .eq("id", tenant_id)
      .eq("organization_id", organization_id)

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 })
    }

    if (!tenantRows || tenantRows.length === 0) {
      return NextResponse.json(
        { error: "Tenant not found in your organization." },
        { status: 404 }
      )
    }

    const tenant = tenantRows[0] as TenantRow

    const { data: unitRows, error: unitError } = await supabase
      .from("units")
      .select("id, organization_id, property_id, status")
      .eq("id", to_unit_id)
      .eq("organization_id", organization_id)
      .eq("property_id", to_property_id)

    if (unitError) {
      return NextResponse.json({ error: unitError.message }, { status: 500 })
    }

    if (!unitRows || unitRows.length === 0) {
      return NextResponse.json(
        { error: "Destination unit not found in your organization." },
        { status: 404 }
      )
    }

    const unit = unitRows[0] as UnitRow
    const unitStatus = (unit.status ?? "").toLowerCase()

    if (tenant.unit_id === to_unit_id) {
      return NextResponse.json(
        { error: "Destination unit must be different from the current unit." },
        { status: 400 }
      )
    }

    if (!["vacant", "make_ready", "notice"].includes(unitStatus)) {
      return NextResponse.json(
        { error: "Destination unit is not available." },
        { status: 400 }
      )
    }

    const { data: openTransfers, error: openTransfersError } = await supabase
      .from("transfers")
      .select("id, tenant_id, to_unit_id, status")
      .eq("organization_id", organization_id)
      .in("status", ["requested", "approved", "scheduled"])

    if (openTransfersError) {
      return NextResponse.json(
        { error: openTransfersError.message },
        { status: 500 }
      )
    }

    const tenantHasOpenTransfer = (openTransfers ?? []).some(
      (transfer) => transfer.tenant_id === tenant.id
    )

    if (tenantHasOpenTransfer) {
      return NextResponse.json(
        { error: "This tenant already has an open transfer." },
        { status: 400 }
      )
    }

    const destinationUnitAlreadyReserved = (openTransfers ?? []).some(
      (transfer) => transfer.to_unit_id === to_unit_id
    )

    if (destinationUnitAlreadyReserved) {
      return NextResponse.json(
        { error: "That destination unit already has an open transfer." },
        { status: 400 }
      )
    }

    const { data: insertedTransfers, error: insertError } = await supabase
      .from("transfers")
      .insert([
        {
          organization_id: membership.organization_id,
          tenant_id: tenant.id,
          from_property_id: tenant.property_id,
          from_unit_id: tenant.unit_id,
          to_property_id,
          to_unit_id,
          status: "requested",
          requested_date: requested_date || null,
          approved_date: null,
          move_out_date: move_out_date || null,
          move_in_date: move_in_date || null,
          notes: notes || null,
        },
      ])
      .select("id")
      .single()

    if (insertError || !insertedTransfers) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create transfer." },
        { status: 500 }
      )
    }

    const { error: auditError } = await supabase.from("audit_logs").insert([
      {
        organization_id,
        actor_user_id: user.id,
        action: "transfer_created",
        target_type: "transfer",
        target_id: insertedTransfers.id,
        details: {
          tenant_id: tenant.id,
          from_property_id: tenant.property_id,
          from_unit_id: tenant.unit_id,
          to_property_id,
          to_unit_id,
          requested_date: requested_date || null,
          move_out_date: move_out_date || null,
          move_in_date: move_in_date || null,
        },
      },
    ])

    if (auditError) {
      return NextResponse.json(
        { error: auditError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error.",
      },
      { status: 500 }
    )
  }
}