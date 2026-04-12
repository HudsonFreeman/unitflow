"use client"

import { useEffect, useState } from "react"
import {
  getActiveOrganizationContext,
  setActiveOrganization,
} from "@/lib/active-organization"

type Org = {
  id: string
  name: string
}

export default function OrganizationSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [activeOrgId, setActiveOrgId] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const context = await getActiveOrganizationContext()

      if (context.error) return

      setActiveOrgId(context.activeOrganizationId)

      setOrgs(
        context.organizations.map((o) => ({
          id: o.id,
          name: o.name,
        }))
      )

      setLoading(false)
    }

    load()
  }, [])

  async function handleChange(orgId: string) {
    setActiveOrgId(orgId)

    const result = await setActiveOrganization(orgId)

    if (result.error) {
      alert(result.error)
      return
    }

    // 🔥 force full refresh so all pages reload correct org
    window.location.reload()
  }

  if (loading) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-400">Org:</span>

      <select
        value={activeOrgId}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded bg-black px-3 py-1 text-sm"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  )
}