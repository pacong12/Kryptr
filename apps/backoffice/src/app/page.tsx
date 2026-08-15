import { Button } from '@kryptr/shared-ui/react/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kryptr/shared-ui/react/card';
import { Badge } from '@kryptr/shared-ui/react/badge';

export default function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Kryptr Backoffice</h1>
        <Badge variant="secondary">scaffold</Badge>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>shadcn/ui ready</CardTitle>
          <CardDescription>
            Base component set installed: button, card, input, label, badge,
            table, select, dialog, separator, skeleton, tabs, dropdown-menu,
            sonner, avatar, tooltip, sheet. The deck agent builds the real
            dashboard on feat/backoffice-dashboard.
          </CardDescription>
        </CardHeader>
      </Card>
      <Button variant="outline" disabled>
        Dashboard coming in Wave 1
      </Button>
    </main>
  );
}
