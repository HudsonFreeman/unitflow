declare module "@supabase/ssr" {
    export type CookieOptions = {
      domain?: string
      expires?: Date
      httpOnly?: boolean
      maxAge?: number
      path?: string
      sameSite?: boolean | "lax" | "strict" | "none"
      secure?: boolean
      priority?: "low" | "medium" | "high"
    }
  
    export function createBrowserClient(
      supabaseUrl: string,
      supabaseKey: string,
      options?: unknown
    ): any
  
    export function createServerClient(
      supabaseUrl: string,
      supabaseKey: string,
      options?: unknown
    ): any
  }