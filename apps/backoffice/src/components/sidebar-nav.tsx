'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CommandIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  RocketIcon,
  ShieldCheckIcon,
  WalletIcon,
} from 'lucide-react';

import { Badge } from '@kryptr/shared-ui/react/badge';
import { Button } from '@kryptr/shared-ui/react/button';
import { Separator } from '@kryptr/shared-ui/react/separator';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
  { href: '/intents', label: 'Intents', icon: ShieldCheckIcon },
  { href: '/wallets', label: 'Wallets', icon: WalletIcon },
  { href: '/orders', label: 'Orders', icon: ListOrderedIcon },
  { href: '/launch', label: 'Launch', icon: RocketIcon },
] as const;

/**
 * Sidebar navigation, composed from @kryptr/shared-ui primitives
 * (Button asChild renders the Next.js Link, so nav items keep button
 * focus/keyboard styling without any hand-rolled control markup).
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-muted/30">
      <div className="flex items-center gap-2 px-4 py-4">
        <CommandIcon aria-hidden className="size-5 text-primary" />
        <span className="text-base font-semibold tracking-tight">Kryptr</span>
        <Badge variant="secondary">deck</Badge>
      </div>
      <Separator />
      <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Button
              key={href}
              asChild
              size="sm"
              variant={active ? 'secondary' : 'ghost'}
              className="justify-start"
            >
              <Link href={href} aria-current={active ? 'page' : undefined}>
                <Icon aria-hidden />
                {label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <p className="mt-auto p-4 text-xs text-muted-foreground">
        Backoffice · wave 5
      </p>
    </aside>
  );
}
