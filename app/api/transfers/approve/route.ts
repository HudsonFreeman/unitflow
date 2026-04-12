import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

type OrganizationMemberRow = {
  user_id: string
  organization_id: string
  role: string
}

type TransferRow = {
  id: string
  organization_id: string
  status: string
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
}

type ActiveOrgRow = {
  organization_id: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const transfer_id = String(body.transfer_id ?? "").trim()

    if (!transfer_id) {
      return NextResponse.json(
        { error: "Transfer ID is required." },
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

    const { data: membershipRows, error: membershipError } = await supabase
      .from("organization_members")
      .select("user_id, organization_id, role")
      .eq("user_id", user.id)
      .eq("organization_id", activeOrg.organization_id)

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

    if (membership.role.toLowerCase() !== "manager") {
      return NextResponse.json(
        { error: "Only managers can approve transfers." },
        { status: 403 }
      )
    }

    const { data: transferRows, error: transferError } = await supabase
      .from("transfers")
      .select(
        "id, organization_id, status, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
      )
      .eq("id", transfer_id)
      .eq("organization_id", membership.organization_id)

    if (transferError) {
      return NextResponse.json(
        { error: transferError.message },
        { status: 500 }
      )
    }

    if (!transferRows || transferRows.length === 0) {
      return NextResponse.json(
        { error: "Transfer not found." },
        { status: 404 }
      )
    }

    const transfer = transferRows[0] as TransferRow

    if (transfer.status.toLowerCase() !== "requested") {
      return NextResponse.json(
        { error: "Only requested transfers can be approved." },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)

    const { error: updateError } = await supabase
      .from("transfers")
      .update({
        status: "approved",
        approved_date: today,
      })
      .eq("id", transfer.id)
      .eq("organization_id", membership.organization_id)
      .eq("status", "requested")

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    const { error: auditError } = await supabase.from("audit_logs").insert([
      {
        organization_id: membership.organization_id,
        actor_user_id: user.id,
        action: "transfer_approved",
        target_type: "transfer",
        target_id: transfer.id,
        details: {
          tenant_id: transfer.tenant_id,
          from_property_id: transfer.from_property_id,
          from_unit_id: transfer.from_unit_id,
          to_property_id: transfer.to_property_id,
          to_unit_id: transfer.to_unit_id,
          approved_date: today,
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