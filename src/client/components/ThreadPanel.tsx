import { useEffect, useState } from 'react';

import type { Message, Thread } from '@shared/types';
import { cn } from '../lib/cn';
import { formatDateTime, formatRelative } from '../lib/format';
import { api } from '../lib/api';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Alert, EmptyState, LoadingBlock } from './ui/Feedback';

export function ThreadPanel({ agentId }: { agentId: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listThreads(agentId)
      .then(({ threads: list }) => {
        if (cancelled) return;
        setThreads(list);
        setSelected(list[0]?.id ?? null);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (threads === null) return <LoadingBlock label="Loading conversations" />;
  if (threads.length === 0) {
    return (
      <EmptyState
        icon="✉️"
        title="No conversations yet"
        description="Once someone on the allowed list writes to this address, the exchange shows up here."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit overflow-hidden">
        <ul className="divide-y divide-line">
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                onClick={() => setSelected(thread.id)}
                className={cn(
                  'w-full px-4 py-3 text-left transition-colors',
                  selected === thread.id ? 'bg-brand-soft' : 'hover:bg-raised',
                )}
              >
                <p className="truncate text-[13px] font-medium text-ink">
                  {thread.subject || '(no subject)'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[12px] text-muted">
                  {thread.participant}
                </p>
                <p className="mt-1 text-[11px] text-faint">
                  {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'} ·{' '}
                  {formatRelative(thread.lastActivityAt)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {selected ? <ThreadMessages threadId={selected} /> : null}
    </div>
  );
}

function ThreadMessages({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    api
      .listMessages(threadId)
      .then(({ messages: list }) => {
        if (!cancelled) setMessages(list);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (messages === null) return <LoadingBlock label="Loading messages" />;

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <MessageCard key={message.id} message={message} />
      ))}
    </div>
  );
}

export function MessageCard({ message }: { message: Message }) {
  const outbound = message.direction === 'outbound';

  return (
    <Card
      className={cn(
        'overflow-hidden',
        outbound && 'border-brand/25',
        message.status === 'rejected' && 'border-danger/30',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Badge tone={outbound ? 'brand' : 'neutral'}>{outbound ? 'Agent' : 'Inbound'}</Badge>
        <StatusBadge status={message.status} />
        <span className="truncate font-mono text-[12px] text-muted">
          {outbound ? `to ${message.to}` : `from ${message.from}`}
        </span>
        <span className="ml-auto shrink-0 text-[12px] text-faint">
          {formatDateTime(message.createdAt)}
        </span>
      </div>

      <div className="px-4 py-3">
        {message.subject ? (
          <p className="mb-2 text-[13px] font-medium text-ink">{message.subject}</p>
        ) : null}
        {message.error ? (
          <p className="mb-2 rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {message.error}
          </p>
        ) : null}
        {message.body ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-muted">
            {message.body}
          </pre>
        ) : (
          <p className="text-[13px] italic text-faint">No body recorded.</p>
        )}
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: Message['status'] }) {
  const tones = {
    received: { tone: 'neutral' as const, label: 'Received' },
    replied: { tone: 'success' as const, label: 'Replied' },
    rejected: { tone: 'danger' as const, label: 'Rejected' },
    failed: { tone: 'danger' as const, label: 'Failed' },
  };
  const entry = tones[status] ?? tones.received;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
