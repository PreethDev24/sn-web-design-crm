"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  FileText,
  Receipt,
  UserPlus,
  Menu,
  X,
  Images,
  LogOut,
  ContactRound,
  MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const staffLinks = [
  { href: "/crm/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/crm/leads", label: "Leads", icon: Users },
  { href: "/crm/clients", label: "Clients", icon: Building2 },
  { href: "/crm/projects", label: "Projects", icon: FolderKanban },
  { href: "/crm/messages", label: "Messages", icon: MessageSquare },
  { href: "/crm/contracts", label: "Contracts", icon: FileText },
  { href: "/crm/invoices", label: "Invoices", icon: Receipt },
];

const salesHiddenHrefs = new Set(["/crm/invoices", "/crm/contracts"]);

function SignOutControl({ dark }: { dark?: boolean }) {
  return (
    <SignOutButton redirectUrl="/">
      <Button
        type="button"
        variant={dark ? "ghost" : "outline"}
        size="sm"
        className={
          dark
            ? "w-full justify-start gap-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            : "w-full justify-start gap-2"
        }
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </SignOutButton>
  );
}

function AuthFooter({ demo }: { demo?: boolean }) {
  if (demo) {
    return (
      <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
        Demo persona active
      </div>
    );
  }
  return (
    <div className="space-y-3 border-t border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <UserButton />
        <span className="text-xs text-slate-400">Account</span>
      </div>
      <SignOutControl dark />
    </div>
  );
}

function PortalAuthFooter({ demo }: { demo?: boolean }) {
  if (demo) {
    return (
      <div className="border-t border-slate-200 p-4 text-xs text-slate-500">Demo persona active</div>
    );
  }
  return (
    <div className="space-y-3 border-t border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <UserButton />
        <span className="text-xs text-slate-500">Account</span>
      </div>
      <SignOutControl />
    </div>
  );
}

export function CrmSidebar({ isOwner, demo }: { isOwner: boolean; demo?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    ...staffLinks.filter((link) => isOwner || !salesHiddenHrefs.has(link.href)),
    { href: "/crm/contacts", label: "Contacts", icon: ContactRound },
    { href: "/crm/team", label: "Team", icon: UserPlus },
  ];

  const Nav = (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-teal-700 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
      {!demo && (
        <div className="mt-2 border-t border-slate-800 pt-2 lg:hidden">
          <SignOutControl dark />
        </div>
      )}
    </nav>
  );

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 lg:hidden">
        <Link href="/crm/dashboard" className="font-semibold tracking-tight text-white">
          SN Web Design
        </Link>
        <div className="flex items-center gap-2">
          {!demo && <UserButton />}
          <button type="button" onClick={() => setOpen(!open)} className="text-slate-300">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-b border-slate-800 bg-slate-950 lg:hidden">{Nav}</div>
      )}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-950 text-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-800 px-5">
          <Link href="/crm/dashboard" className="font-semibold tracking-tight">
            SN Web Design
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">{Nav}</div>
        <AuthFooter demo={demo} />
      </aside>
    </>
  );
}

const portalLinks = [
  { href: "/portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portal/projects", label: "Projects", icon: FolderKanban },
  { href: "/portal/deliverables", label: "Deliverables", icon: Images },
  { href: "/portal/messages", label: "Messages", icon: MessageSquare },
  { href: "/portal/contracts", label: "Contracts", icon: FileText },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
];

export function PortalSidebar({ demo }: { demo?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const Nav = (
    <nav className="flex flex-col gap-1 p-3">
      {portalLinks.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
      {!demo && (
        <div className="mt-2 border-t border-slate-200 pt-2 lg:hidden">
          <SignOutControl />
        </div>
      )}
    </nav>
  );

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/portal/dashboard" className="font-semibold text-slate-900">
          SN Client Portal
        </Link>
        <div className="flex items-center gap-2">
          {!demo && <UserButton />}
          <button type="button" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && <div className="border-b border-slate-200 bg-white lg:hidden">{Nav}</div>}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-5">
          <Link href="/portal/dashboard" className="font-semibold text-slate-900">
            SN Client Portal
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">{Nav}</div>
        <PortalAuthFooter demo={demo} />
      </aside>
    </>
  );
}
