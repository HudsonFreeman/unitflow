export const ALL_PROPERTIES_VALUE = "all"

const STORAGE_KEY = "unitflow_selected_property_id"

export function getStoredSelectedPropertyId() {
  if (typeof window === "undefined") {
    return ALL_PROPERTIES_VALUE
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? ALL_PROPERTIES_VALUE
}

export function setStoredSelectedPropertyId(propertyId: string) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(STORAGE_KEY, propertyId || ALL_PROPERTIES_VALUE)
}

export function clearStoredSelectedPropertyId() {
  if (typeof window === "undefined") return

  window.localStorage.removeItem(STORAGE_KEY)
}