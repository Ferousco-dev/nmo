import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isPublic =
    pathname === '/' ||
    pathname === '/confirm' ||
    isAuthPage ||
    pathname.startsWith('/api/skool/search') ||
    // Cron routes authenticate themselves via CRON_SECRET; they're hit
    // by Vercel's cron infra with no Supabase session. Without this the
    // middleware 307s them to /login and the cron never runs.
    pathname.startsWith('/api/cron/') ||
    // Locale switcher writes a cookie via POST /api/locale. Anonymous
    // visitors on the welcome page must be able to call it — otherwise
    // the switcher silently no-ops because the response is a redirect.
    pathname === '/api/locale';

  // Not signed in & trying to access protected route → redirect to login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Signed in & on auth page → redirect to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // /admin/* — admin gate. Non-admins bounce to /dashboard.
  if (user && pathname.startsWith('/admin')) {
    const { data } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
