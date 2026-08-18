import { useEffect, useState } from 'react';

import type { Message } from '@shared/types';
import { MessageCard } from '../components/ThreadPanel';
import { Alert, EmptyState, LoadingBlock } from '../components/ui/Feedback';
import { api } from '../lib/api';

export function ActivityPage() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .activity()
      .then(({ messages: list }) => {
        if (!cancelled) setMessages(list);
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
      <div>
        <h1 className="text-lg font-semibold text-ink">Activity</h1>
        <p className="mt-0.5 text-sm text-muted">
          Every message across your agents, including the ones turned away at the door.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {messages === null && !error ? <LoadingBlock label="Loading activity" /> : null}

      {messages && messages.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Nothing has arrived yet"
          description="Send a message to one of your agent addresses from an allowed sender to see it here."
        />
      ) : null}

      {messages && messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
