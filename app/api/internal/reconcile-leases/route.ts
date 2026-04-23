import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"

type ExpiredTenantRow = {
  id: string
  unit_id: string
  organization_id: string
  lease_end: string | null
  status: string | null
}

function getTodayDateOnly() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured." },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    }

    const today = getTodayDateOnly()

    const { data: expiredTenants, error: expiredTenantsError } = await supabaseAdmin
      .from("tenants")
      .select("id, unit_id, organization_id, lease_end, status")
      .lte("lease_end", today)
      .not("status", "in", '("moved_out","transferred")')

    if (expiredTenantsError) {
      return NextResponse.json(
        { error: expiredTenantsError.message },
        { status: 500 }
      )
    }

    const rows = (expiredTenants ?? []) as ExpiredTenantRow[]

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        processed_tenants: 0,
        updated_units: 0,
      })
    }

    const tenantIds = rows.map((row) => row.id)
    const unitIds = Array.from(new Set(rows.map((row) => row.unit_id).filter(Boolean)))

    const { error: tenantUpdateError } = await supabaseAdmin
      .from("tenants")
      .update({ status: "moved_out" })
      .in("id", tenantIds)

    if (tenantUpdateError) {
      return NextResponse.json(
        { error: tenantUpdateError.message },
        { status: 500 }
      )
    }

    const unitsToVacate: string[] = []

    for (const unitId of unitIds) {
      const { data: remainingOccupant, error: remainingOccupantError } =
        await supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("unit_id", unitId)
          .not("status", "in", '("moved_out","transferred")')
          .maybeSingle()

      if (remainingOccupantError) {
        return NextResponse.json(
          { error: remainingOccupantError.message },
          { status: 500 }
        )
      }

      if (!remainingOccupant) {
        unitsToVacate.push(unitId)
      }
    }

    if (unitsToVacate.length > 0) {
      const { error: unitUpdateError } = await supabaseAdmin
        .from("units")
        .update({ status: "vacant" })
        .in("id", unitsToVacate)

      if (unitUpdateError) {
        return NextResponse.json(
          { error: unitUpdateError.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      processed_tenants: tenantIds.length,
      updated_units: unitsToVacate.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reconcile expired leases.",
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}