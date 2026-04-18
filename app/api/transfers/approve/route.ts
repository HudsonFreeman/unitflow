import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

type TransferRow = {
  id: string
  status: string
  tenant_id: string
  from_property_id: string
  from_unit_id: string
  to_property_id: string
  to_unit_id: string
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

    const { data: transferRows, error: transferError } = await supabase
      .from("transfers")
      .select(
        "id, status, tenant_id, from_property_id, from_unit_id, to_property_id, to_unit_id"
      )
      .eq("id", transfer_id)

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
      .eq("status", "requested")

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
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