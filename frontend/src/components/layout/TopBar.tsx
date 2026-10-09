import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface TopBarProps {
  title: string;
  crumb?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, crumb, actions }: TopBarProps) {
  return (
    <header className="vf-top">
      <div style={{ flex: 1 }}>
        {crumb && <div className="vf-crumb">{crumb}</div>}
        <h1 className="vf-top-title">{title}</h1>
      </div>
      {actions}
      <Link href="/shorts/new">
        <Button variant="primary" size="sm">+ Nowy Short</Button>
      </Link>
    </header>
  );
}
