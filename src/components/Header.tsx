"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "LaTeX-ify",
    href: "/dashboard/latexify"
  },
  {
    label: "Generate Contracts",
    href: "/dashboard/contractgen"
  },
  {
    label: "Ops Matrix",
    href: "/dashboard"
  },
  {
    label: "Systems Sync",
    href: "/dashboard/systems"
  }
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="hud-header">
      <div className="hud-header__inner">
        <div>
          <span className="hud-badge">DnD Blackline Ops</span>
        </div>
        <nav className="hud-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`hud-nav-link${isActive ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
