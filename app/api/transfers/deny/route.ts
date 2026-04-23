import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  try {
    const { transfer_id, denial_reason } = await request.json()

    if (!transfer_id) {
      return NextResponse.json({ error: "Transfer ID is required." }, { status: 400 })
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
      .select("id, status")
      .eq("id", transfer_id)
      .single()

    if (transferError || !transfer) {
      return NextResponse.json({ error: "Transfer not found." }, { status: 404 })
    }

    if ((transfer.status ?? "").toLowerCase() !== "requested") {
      return NextResponse.json(
        { error: "Only requested transfers can be denied." },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from("transfers")
      .update({
        status: "cancelled",
        denial_reason: denial_reason || "Not specified",
      })
      .eq("id", transfer_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to deny transfer." }, { status: 500 })
  }
}