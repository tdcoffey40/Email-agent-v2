import type { Agent } from '@shared/types';
import { Badge, Dot, type BadgeTone } from './ui/Badge';

const LABELS: Record<Agent['routingStatus'], { tone: BadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Routing live' },
  pending: { tone: 'warning', label: 'Routing pending' },
  error: { tone: 'danger', label: 'Routing failed' },
  disabled: { tone: 'neutral', label: 'Catch-all routing' },
};

export function RoutingBadge({ status }: { status: Agent['routingStatus'] }) {
  const { tone, label } = LABELS[status] ?? LABELS.pending;
  return (
    <Badge tone={tone}>
      <Dot tone={tone} />
      {label}
    </Badge>
  );
}
