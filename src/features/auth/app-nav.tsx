"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LogOut, Menu, Users } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { ROLE_LABEL } from "@/shared/constants/domain";
import type { Profile, Role } from "@/shared/types/domain";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/shared/ui/sheet";

const NAV: Record<Role, { href: string; label: string }[]> = {
  student: [
    { href: "/dashboard/estudiante", label: "Mi billetera" },
    { href: "/comunidad", label: "Comunidad" },
    { href: "/offline", label: "Sincronización" },
  ],
  teacher: [
    { href: "/dashboard/profesor", label: "Registro" },
    { href: "/dashboard/profesor/asistencia", label: "Asistencia" },
    { href: "/offline", label: "Sincronización" },
    { href: "/comunidad", label: "Comunidad" },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Panel" },
    { href: "/dashboard/admin/rosters", label: "Padrón" },
    { href: "/dashboard/admin/auditoria", label: "Auditoría" },
    { href: "/dashboard/admin/disputas", label: "Disputas" },
    { href: "/dashboard/admin/canjes", label: "Canjes" },
    { href: "/dashboard/admin/comunidad", label: "Comunidad" },
    { href: "/dashboard/admin/tasas", label: "Tasas" },
  ],
};

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const items = NAV[profile.role];
  const home = items[0].href;

  const isActive = (href: string) =>
    href === home ? pathname === href : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href={home} className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <GraduationCap className="size-4" />
          </span>
          <span className="font-heading font-semibold">ZAMORA</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive(item.href)
                  ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
                  : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            {ROLE_LABEL[profile.role]}
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-verde-osc text-xs font-semibold text-white">
                  {profile.full_name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-32 truncate sm:inline">
                  {profile.full_name.split(" ")[0]}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate">{profile.full_name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {profile.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {profile.career ?? "Sin carrera asignada"}
              </div>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut className="size-4" />
                    Cerrar sesión
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-5" />
                <span className="sr-only">Menú</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-sm hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  {ROLE_LABEL[profile.role]}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
