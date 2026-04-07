"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { label: "Trip", path: "" },
  { label: "Balances", path: "/balances" },
  { label: "Settle", path: "/settle" }
];

export function BottomNav({ tripId }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Trip sections">
      {links.map((link) => {
        const href = `/trip/${tripId}${link.path}`;
        const active = pathname === href;

        return (
          <Link key={href} className={active ? "active" : ""} href={href}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
