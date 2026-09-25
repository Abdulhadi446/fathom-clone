"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Meetings" },
  { href: "/calendar", label: "Calendar" },
  { href: "/ingest", label: "Add meeting" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-[#0a0a0b]/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-400 text-[13px] font-bold text-black">
            F
          </span>
          Fathom
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" || pathname.startsWith("/meetings") : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-neutral-500 sm:inline">
            demo workspace · seeded data
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-medium text-neutral-300">
            AR
          </div>
        </div>
      </div>
    </header>
  );
}
