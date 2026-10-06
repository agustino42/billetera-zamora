import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/shared/lib/supabase/middleware";
import { ACTIVE_ROUTES, PUBLIC_ROUTES, ROLE_HOME, ROLE_PREFIX } from "@/shared/constants/routes";
import type { Role } from "@/shared/types/domain";

const isPublic = (pathname: string) =>
  PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

const requiresActive = (pathname: string) =>
  ACTIVE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/**
 * `createServerClient` lanza si falta URL o key, y eso convertía cada ruta en
 * un 500 con un error de Supabase. Sin configuración no hay nada que ver
 * igual, así que se explica qué hacer en lugar de fallar en seco.
 */
function missingEnvResponse() {
  const body = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZAMORA · falta configuración</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e7ecf3;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:2rem}
  main{max-width:34rem}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{line-height:1.6;color:#b7c2d2}
  code,pre{background:#16202f;border:1px solid #26364d;border-radius:.4rem;
           padding:.15rem .35rem;font-size:.85rem;color:#d9e2ee}
  pre{padding:1rem;overflow-x:auto;line-height:1.7}
  ul{line-height:1.8;color:#b7c2d2}
</style></head>
<body><main>
  <h1>Falta configurar Supabase</h1>
  <p>Copia <code>.env.example</code> a <code>.env.local</code> y completa las
     variables con los valores de tu proyecto (Settings → API). Después
     reinicia el servidor.</p>
  <pre>NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...</pre>
  <p>Las claves <code>NEXT_PUBLIC_*</code> van en el navegador; la
     <code>service_role</code> nunca. Consulta
     <code>docs/QA.md</code> para el orden de migraciones.</p>
</main></body></html>`;

  return new NextResponse(body, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return missingEnvResponse();
  }

  const { supabase, user, supabaseResponse } = await updateSession(request);

  // Sin sesión
  if (!user) {
    if (isPublic(pathname) || pathname === "/auth/activate") {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Con sesión: el perfil decide a dónde puede ir
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "student") as Role;
  const status = profile?.status ?? "pending";

  // Perfil no acreditado: solo puede activar su cuenta
  if (status !== "active") {
    if (pathname === "/auth/activate") {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/activate";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Usuario activo que aún está en login/register → su portal
  if (pathname === "/auth/login" || pathname === "/auth/register") {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[role];
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Guard por rol: cada portal es solo del rol correspondiente
  const prefix = ROLE_PREFIX[role];
  for (const other of Object.values(ROLE_PREFIX)) {
    if (other === prefix) continue;
    if (pathname === other || pathname.startsWith(`${other}/`)) {
      const url = request.nextUrl.clone();
      url.pathname = prefix;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // /dashboard sin destino explícito
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    const url = request.nextUrl.clone();
    url.pathname = prefix;
    return NextResponse.redirect(url);
  }

  // active y con perfil válido
  if (requiresActive(pathname)) {
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Todo excepto estáticos, imágenes, favicon y la API de sync
     * (esa revalida la sesión por su cuenta con la service role).
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
