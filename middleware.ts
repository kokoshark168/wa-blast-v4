import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const authToken = request.headers.get('authorization');
  const pathname = request.nextUrl.pathname;

  // Allow public routes
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Require auth for protected routes
  if (pathname.startsWith('/api/') && !authToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/:path*'],
};
