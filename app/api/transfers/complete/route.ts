import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

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

    const { error } = await supabase.rpc("complete_transfer_atomic", {
      transfer_id_input: transfer_id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
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