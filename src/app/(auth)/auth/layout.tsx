import Link from "next/link";
import type { ReactNode } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden bg-background px-4 py-8 sm:py-12">
      {/* Luces y acentos atmosféricos institucionales UNELLEZ */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl opacity-75"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 right-1/4 size-[420px] rounded-full bg-gradient-to-t from-secondary/15 via-secondary/5 to-transparent blur-3xl opacity-70"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-card/80 px-4 py-1.5 shadow-xs backdrop-blur-md transition-all hover:border-primary/40 hover:shadow-sm"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs transition-transform group-hover:scale-105">
              <GraduationCap className="size-4" />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight text-foreground">
              ZAMORA
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
              UNELLEZ
            </span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          {children}
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1.5 font-medium text-foreground/80">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>Sistema Verificado del Padrón Académico</span>
          </div>
          <p>
            Universidad Nacional Experimental de los Llanos Occidentales &ldquo;Ezequiel Zamora&rdquo;
          </p>
        </div>
      </div>
    </main>
  );
}
