"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabaseClient } from "@/lib/supabase-client"
import {
  ALL_PROPERTIES_VALUE,
  getStoredSelectedPropertyId,
  setStoredSelectedPropertyId,
} from "@/lib/selected-property"

type PropertyRow = {
  id: string
  name: string
}

function dedupeProperties(rows: PropertyRow[]) {
  const map = new Map<string, PropertyRow>()

  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, row)
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    })
  )
}

export default function PropertySelector() {
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState(ALL_PROPERTIES_VALUE)
  const [open, setOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabaseClient
        .from("properties")
        .select("id, name")
        .order("id")

      if (!error && data) {
        const cleaned = dedupeProperties(data as PropertyRow[])
        setProperties(cleaned)

        const stored = getStoredSelectedPropertyId()

        if (
          stored === ALL_PROPERTIES_VALUE ||
          cleaned.some((property) => property.id === stored)
        ) {
          setSelectedPropertyId(stored)
        } else {
          setSelectedPropertyId(ALL_PROPERTIES_VALUE)
          setStoredSelectedPropertyId(ALL_PROPERTIES_VALUE)
        }
      } else {
        setProperties([])
        setSelectedPropertyId(ALL_PROPERTIES_VALUE)
      }
    }

    load()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    function handlePropertyChange(e: Event) {
      const customEvent = e as CustomEvent<{ propertyId: string }>
      const nextPropertyId = customEvent.detail?.propertyId ?? ALL_PROPERTIES_VALUE
      setSelectedPropertyId(nextPropertyId)
    }

    window.addEventListener("propertyChanged", handlePropertyChange)

    return () => {
      window.removeEventListener("propertyChanged", handlePropertyChange)
    }
  }, [])

  const selectedLabel = useMemo(() => {
    if (selectedPropertyId === ALL_PROPERTIES_VALUE) return "All Properties"
    const match = properties.find((property) => property.id === selectedPropertyId)
    return match ? match.name : "Select Property"
  }, [properties, selectedPropertyId])

  function handleSelect(value: string) {
    setSelectedPropertyId(value)
    setStoredSelectedPropertyId(value)
    setOpen(false)

    window.dispatchEvent(
      new CustomEvent("propertyChanged", {
        detail: { propertyId: value },
      })
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="
          w-full flex items-center justify-between
          rounded-2xl border border-white/10
          bg-white/[0.04]
          px-4 py-3
          text-sm text-white
          hover:bg-white/[0.06]
          transition
        "
      >
        <span className="truncate">{selectedLabel}</span>
        <span className={`ml-2 text-zinc-400 transition ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {open && (
        <div
          className="
            absolute z-50 mt-2 w-full
            rounded-2xl border border-white/10
            bg-black/95 backdrop-blur-xl
            shadow-[0_0_30px_rgba(0,0,0,0.5)]
            overflow-hidden
          "
        >
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect(ALL_PROPERTIES_VALUE)}
              className={getItemClasses(selectedPropertyId === ALL_PROPERTIES_VALUE)}
            >
              {selectedPropertyId === ALL_PROPERTIES_VALUE ? "✓ " : ""}
              All Properties
            </button>

            {properties.map((property) => (
              <button
                type="button"
                key={property.id}
                onClick={() => handleSelect(property.id)}
                className={getItemClasses(selectedPropertyId === property.id)}
              >
                {selectedPropertyId === property.id ? "✓ " : ""}
                {property.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function getItemClasses(active: boolean) {
  return `
    w-full text-left px-4 py-2.5 text-sm transition
    ${
      active
        ? "bg-blue-600/20 text-blue-300"
        : "text-zinc-300 hover:bg-white/5 hover:text-white"
    }
  `
}