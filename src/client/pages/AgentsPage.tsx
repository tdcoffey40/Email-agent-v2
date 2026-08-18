import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { Agent } from '@shared/types';
import { findModel } from '@shared/models';
import { CopyButton } from '../components/CopyButton';
import { RoutingBadge } from '../components/RoutingBadge';
import { Badge, Dot } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Alert, EmptyState, LoadingBlock } from '../components/ui/Feedback';
import { api } from '../lib/api';
import { formatRelative } from '../lib/format';

export function AgentsPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listAgents()
      .then(({ agents: list }) => {
        if (!cancelled) setAgents(list);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Agents</h1>
          <p className="mt-0.5 text-sm text-muted">
            Each agent owns an email address and answers the senders you allow.
          </p>
        </div>
        <Button onClick={() => navigate('/agents/new')} icon={<PlusIcon />}>
          New agent
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {agents === null && !error ? <LoadingBlock label="Loading agents" /> : null}

      {agents !== null && agents.length === 0 ? (
        <EmptyState
          icon="📬"
          title="No agents yet"
          description="Create your first agent to give it an address, a prompt, and a list of senders it will answer."
          action={<Button onClick={() => navigate('/agents/new')}>Create an agent</Button>}
        />
      ) : null}

      {agents && agents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const model = findModel(agent.model);
  const openSenders = agent.allowedSenders.includes('*');

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="group flex flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-ink group-hover:text-brand">
          {agent.name}
        </h2>
        <Badge tone={agent.status === 'active' ? 'success' : 'neutral'}>
          <Dot tone={agent.status === 'active' ? 'success' : 'neutral'} />
          {agent.status === 'active' ? 'Active' : 'Paused'}
        </Badge>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <span className="truncate font-mono text-[13px] text-muted">{agent.address}</span>
        <span onClick={(event) => event.preventDefault()}>
          <CopyButton value={agent.address} />
        </span>
      </div>

      {agent.description ? (
        <p className="mt-3 line-clamp-2 text-[13px] text-muted">{agent.description}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{model?.label ?? agent.model}</Badge>
        <Badge tone={openSenders ? 'warning' : 'neutral'}>
          {openSenders
            ? 'Open to anyone'
            : `${agent.allowedSenders.length} allowed sender${agent.allowedSenders.length === 1 ? '' : 's'}`}
        </Badge>
        <RoutingBadge status={agent.routingStatus} />
      </div>

      <p className="mt-4 text-[12px] text-faint">Updated {formatRelative(agent.updatedAt)}</p>
    </Link>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
