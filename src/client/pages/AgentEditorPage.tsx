import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { MODELS } from '@shared/models';
import type { Agent, AgentInput } from '@shared/types';
import {
  normalizeLocalPart,
  normalizeSenderPattern,
  validateAgentInput,
  validateSenderPattern,
} from '@shared/validation';

import { McpServersEditor, SkillsEditor, ToolsEditor } from '../components/CapabilityEditors';
import { CopyButton } from '../components/CopyButton';
import { RoutingBadge } from '../components/RoutingBadge';
import { ThreadPanel } from '../components/ThreadPanel';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Field, Input, Select, SuffixInput, Switch, Textarea } from '../components/ui/Field';
import { Alert, LoadingBlock } from '../components/ui/Feedback';
import { TagInput } from '../components/ui/TagInput';
import { useToast } from '../components/ui/Toast';
import { ApiRequestError, api } from '../lib/api';
import { cn } from '../lib/cn';
import { useSession } from '../lib/session';

type Draft = AgentInput & { status: 'active' | 'paused' };

const BLANK: Draft = {
  name: '',
  emailLocal: '',
  description: '',
  systemPrompt:
    'You are a helpful assistant that answers email on behalf of the team.\n\n' +
    'Answer clearly and concisely, and ask for anything you need that the sender left out.',
  model: MODELS[0].id,
  status: 'active',
  skills: [],
  tools: [],
  mcpServers: [],
  allowedSenders: [],
};

function draftFrom(agent: Agent): Draft {
  return {
    name: agent.name,
    emailLocal: agent.emailLocal,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    status: agent.status,
    skills: agent.skills,
    tools: agent.tools,
    mcpServers: agent.mcpServers,
    allowedSenders: agent.allowedSenders,
  };
}

export function AgentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { config } = useSession();

  const [draft, setDraft] = useState<Draft>(BLANK);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'config' | 'conversations'>('config');
  // While creating, the address tracks the name until it is edited by hand.
  const [addressTouched, setAddressTouched] = useState(false);

  const domain = config?.emailDomain ?? 'example.com';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api
      .getAgent(id)
      .then(({ agent: loaded }) => {
        if (cancelled) return;
        setAgent(loaded);
        setDraft(draftFrom(loaded));
        setAddressTouched(true);
        setLoading(false);
      })
      .catch((caught: Error) => {
        if (cancelled) return;
        setError(caught.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const patch = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  const onNameChange = (name: string) => {
    patch(addressTouched ? { name } : { name, emailLocal: normalizeLocalPart(name) });
  };

  const openToAnyone = draft.allowedSenders.includes('*');
  const anthropicModel = useMemo(
    () => MODELS.find((model) => model.id === draft.model)?.provider === 'anthropic',
    [draft.model],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const check = validateAgentInput(draft);
    if (!check.valid) {
      setFields(check.fields);
      setTab('config');
      return;
    }
    setFields({});
    setSaving(true);

    try {
      const saved = id
        ? await api.updateAgent(id, check.value)
        : await api.createAgent(check.value);
      setAgent(saved.agent);
      setDraft(draftFrom(saved.agent));

      if (saved.agent.routingStatus === 'error') {
        toast.error(`Saved, but email routing failed: ${saved.agent.routingError ?? 'unknown error'}`);
      } else {
        toast.success(id ? 'Agent saved.' : `Agent created at ${saved.agent.address}.`);
      }
      if (!id) navigate(`/agents/${saved.agent.id}`, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setFields(caught.fields);
        if (Object.keys(caught.fields).length === 0) setError(caught.message);
      } else {
        setError('Could not save the agent. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await api.deleteAgent(id);
      toast.success('Agent deleted.');
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the agent.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading agent" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-[13px] text-muted transition-colors hover:text-ink">
          ← Agents
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-ink">
              {draft.name || (isNew ? 'New agent' : 'Untitled agent')}
            </h1>
            <div className="mt-1 flex items-center gap-1">
              <span className="truncate font-mono text-[13px] text-muted">
                {draft.emailLocal ? `${draft.emailLocal}@${domain}` : `…@${domain}`}
              </span>
              {agent ? <CopyButton value={agent.address} /> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {agent ? <RoutingBadge status={agent.routingStatus} /> : null}
            {agent ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            <Button onClick={onSubmit} loading={saving}>
              {isNew ? 'Create agent' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>

      {agent ? (
        <div className="flex gap-1 border-b border-line">
          {(
            [
              ['config', 'Configuration'],
              ['conversations', 'Conversations'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === key
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {agent && agent.routingStatus === 'error' && agent.routingError ? (
        <Alert tone="danger" title="Email routing could not be provisioned">
          {agent.routingError}
        </Alert>
      ) : null}

      {tab === 'conversations' && agent ? (
        <ThreadPanel agentId={agent.id} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <Card>
            <CardHeader
              title="Identity"
              description="The name you see, and the address the agent receives mail on."
            />
            <CardBody className="space-y-5">
              <Field label="Name" htmlFor="name" error={fields.name} required>
                <Input
                  id="name"
                  value={draft.name}
                  onChange={(event) => onNameChange(event.target.value)}
                  invalid={Boolean(fields.name)}
                  placeholder="Support triage"
                />
              </Field>

              <Field
                label="Email address"
                error={fields.emailLocal}
                hint="Lowercase letters, numbers and hyphens. This is what senders write to."
                required
              >
                <SuffixInput
                  suffix={`@${domain}`}
                  value={draft.emailLocal}
                  onChange={(event) => {
                    setAddressTouched(true);
                    patch({ emailLocal: normalizeLocalPart(event.target.value) });
                  }}
                  invalid={Boolean(fields.emailLocal)}
                  placeholder="support-triage"
                  className="font-mono"
                />
              </Field>

              <Field label="Description" htmlFor="description" hint="A note for you. The agent never sees it.">
                <Input
                  id="description"
                  value={draft.description ?? ''}
                  onChange={(event) => patch({ description: event.target.value })}
                  placeholder="Answers first-line support questions from the team"
                />
              </Field>

              <Switch
                checked={draft.status === 'active'}
                onChange={(active) => patch({ status: active ? 'active' : 'paused' })}
                label="Accept incoming email"
                description="When paused, mail to this address is rejected instead of answered."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Behaviour" description="The model, and the instructions it works from." />
            <CardBody className="space-y-5">
              <Field label="Model" htmlFor="model" error={fields.model} required>
                <Select
                  id="model"
                  value={draft.model}
                  onChange={(event) => patch({ model: event.target.value })}
                  invalid={Boolean(fields.model)}
                >
                  {MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} — {model.description}
                    </option>
                  ))}
                </Select>
              </Field>

              {anthropicModel && config && !config.anthropicEnabled ? (
                <Alert tone="warning" title="ANTHROPIC_API_KEY is not set">
                  This agent will fail to reply until the key is added to the Worker with
                  <code className="mx-1 font-mono text-[12px]">wrangler secret put ANTHROPIC_API_KEY</code>.
                </Alert>
              ) : null}

              <Field
                label="Prompt"
                htmlFor="systemPrompt"
                error={fields.systemPrompt}
                hint="Tells the agent who it is and how to answer. Sent with every message."
                required
              >
                <Textarea
                  id="systemPrompt"
                  value={draft.systemPrompt}
                  onChange={(event) => patch({ systemPrompt: event.target.value })}
                  invalid={Boolean(fields.systemPrompt)}
                  rows={10}
                  className="font-mono text-[13px]"
                />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Allowed senders"
              description="Mail from anyone else is rejected before the model ever runs."
            />
            <CardBody className="space-y-4">
              <Field
                error={fields.allowedSenders}
                hint="An exact address (ada@example.com), a whole domain (*@example.com), subdomains (*@*.example.com), or * for anyone."
              >
                <TagInput
                  value={draft.allowedSenders}
                  onChange={(allowedSenders) => patch({ allowedSenders })}
                  validate={(entry) => validateSenderPattern(normalizeSenderPattern(entry))}
                  invalid={Boolean(fields.allowedSenders)}
                  placeholder="ada@example.com"
                  monospace
                />
              </Field>

              {openToAnyone ? (
                <Alert tone="warning" title="This agent answers anyone">
                  A <code className="font-mono">*</code> entry lets any sender on the internet reach
                  the model. Remove it unless that is deliberate.
                </Alert>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Capabilities"
              description="Skills shape the prompt today. Tools and MCP servers are recorded now and executed in a later release."
            />
            <CardBody className="space-y-8">
              <section>
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Skills
                </h3>
                <SkillsEditor value={draft.skills ?? []} onChange={(skills) => patch({ skills })} />
              </section>

              <section>
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Tools
                </h3>
                <ToolsEditor value={draft.tools ?? []} onChange={(tools) => patch({ tools })} />
              </section>

              <section>
                <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  MCP servers
                </h3>
                <McpServersEditor
                  value={draft.mcpServers ?? []}
                  onChange={(mcpServers) => patch({ mcpServers })}
                />
              </section>
            </CardBody>
          </Card>

          <div className="flex justify-end gap-3 pb-4">
            <Button type="button" variant="secondary" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {isNew ? 'Create agent' : 'Save changes'}
            </Button>
          </div>
        </form>
      )}

      <Dialog
        open={confirmDelete}
        title="Delete this agent?"
        description={
          agent
            ? `${agent.address} will stop receiving mail, and its routing rule and conversation history are removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete agent"
        destructive
        busy={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
