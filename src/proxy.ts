import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/jwt'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes
  if (pathname === '/login') {
    return NextResponse.next()
  }

  // Skip API routes — auth handled in route handlers
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Check session
  const session = request.cookies.get('session')?.value
  const payload = await decrypt(session)

  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin-only routes
  if (pathname.startsWith('/admin') && !payload.isAdmin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
