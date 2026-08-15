import './global.css';
import { Toaster } from '@kryptr/shared-ui/react/sonner';
import { TooltipProvider } from '@kryptr/shared-ui/react/tooltip';

import { SidebarNav } from '@/components/sidebar-nav';

export const metadata = {
  title: 'Kryptr Backoffice',
  description: 'Kryptr admin & monitoring dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <TooltipProvider>
          <div className="flex min-h-screen">
            <SidebarNav />
            <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
              {children}
            </main>
          </div>
        </TooltipProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
