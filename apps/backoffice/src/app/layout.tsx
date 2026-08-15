import './global.css';
import { TooltipProvider } from '@/components/ui/tooltip';

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
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
