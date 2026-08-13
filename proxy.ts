import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  ADMIN_AUTH_COOKIE,
  isAdminAuthCookie,
} from '@/lib/supabase/config'

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

function clearAdminSession(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach(({ name }) => {
    if (isAdminAuthCookie(name)) {
      response.cookies.set(name, '', { maxAge: 0, path: '/' })
    }
  })
}

function redirectToLogin(
  request: NextRequest,
  response: NextResponse,
  error?: string,
) {
  const loginUrl = new URL('/login', request.url)
  if (error) loginUrl.searchParams.set('error', error)
  return copyCookies(response, NextResponse.redirect(loginUrl))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The callback must exchange its code before an admin session exists.
  if (pathname.startsWith('/auth/')) return NextResponse.next()

  let response = NextResponse.next({ request })
  const isLoginPage = pathname === '/login'
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasAdminSession = request.cookies
    .getAll()
    .some(({ name }) => isAdminAuthCookie(name))

  if (!hasSupabaseEnv || !hasAdminSession) {
    return isLoginPage ? response : redirectToLogin(request, response)
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: ADMIN_AUTH_COOKIE,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headersToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          Object.entries(headersToSet).forEach(([name, value]) =>
            response.headers.set(name, value),
          )
        },
      },
    },
  )

  let hasVerifiedIdentity = false
  let isAdmin = false

  try {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims()
    hasVerifiedIdentity =
      !claimsError && typeof claimsData?.claims?.sub === 'string'

    if (hasVerifiedIdentity) {
      const { data: access, error: accessError } = await supabase
        .rpc('my_access')
        .single<{ is_admin: boolean; is_active: boolean }>()

      if (!accessError) isAdmin = access?.is_admin === true
    }
  } catch {
    // Invalid, stale, or missing admin sessions are handled as signed out below.
  }

  if (isLoginPage) {
    if (isAdmin) {
      return copyCookies(response, NextResponse.redirect(new URL('/', request.url)))
    }
    if (hasVerifiedIdentity) clearAdminSession(request, response)
    return response
  }

  if (!isAdmin) {
    clearAdminSession(request, response)
    return redirectToLogin(
      request,
      response,
      hasVerifiedIdentity
        ? 'Access denied. This account does not have Admin privileges.'
        : undefined,
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
