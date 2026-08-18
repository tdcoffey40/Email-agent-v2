import type { AgentSkill, AgentTool, McpServer } from '@shared/types';
import { Button } from './ui/Button';
import { Input, Switch, Textarea } from './ui/Field';

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick} icon={<PlusIcon />}>
      {label}
    </Button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-faint transition-colors hover:bg-danger/10 hover:text-danger"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Named instruction bundles layered onto the agent's prompt. */
export function SkillsEditor({
  value,
  onChange,
}: {
  value: AgentSkill[];
  onChange: (next: AgentSkill[]) => void;
}) {
  const update = (index: number, patch: Partial<AgentSkill>) =>
    onChange(value.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)));

  return (
    <div className="space-y-3">
      {value.map((skill, index) => (
        <div key={index} className="rounded-control border border-line bg-raised/40 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={skill.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Skill name, e.g. Triage rules"
              className="h-9"
            />
            <RemoveButton
              label={`Remove skill ${skill.name || index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            />
          </div>
          <Textarea
            value={skill.instructions}
            onChange={(event) => update(index, { instructions: event.target.value })}
            placeholder="What this skill tells the agent to do, and when it applies."
            rows={3}
            className="mt-2"
          />
          <div className="mt-3">
            <Switch
              checked={skill.enabled}
              onChange={(enabled) => update(index, { enabled })}
              label="Enabled"
            />
          </div>
        </div>
      ))}
      <AddRowButton
        label="Add skill"
        onClick={() => onChange([...value, { name: '', instructions: '', enabled: true }])}
      />
    </div>
  );
}

export function ToolsEditor({
  value,
  onChange,
}: {
  value: AgentTool[];
  onChange: (next: AgentTool[]) => void;
}) {
  const update = (index: number, patch: Partial<AgentTool>) =>
    onChange(value.map((tool, i) => (i === index ? { ...tool, ...patch } : tool)));

  return (
    <div className="space-y-3">
      {value.map((tool, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 space-y-2">
            <Input
              value={tool.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Tool name"
              className="h-9"
            />
            <Input
              value={tool.description ?? ''}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="What it does"
              className="h-9"
            />
            <Switch
              checked={tool.enabled}
              onChange={(enabled) => update(index, { enabled })}
              label="Enabled"
            />
          </div>
          <RemoveButton
            label={`Remove tool ${tool.name || index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label="Add tool"
        onClick={() => onChange([...value, { name: '', description: '', enabled: true }])}
      />
    </div>
  );
}

export function McpServersEditor({
  value,
  onChange,
}: {
  value: McpServer[];
  onChange: (next: McpServer[]) => void;
}) {
  const update = (index: number, patch: Partial<McpServer>) =>
    onChange(value.map((server, i) => (i === index ? { ...server, ...patch } : server)));

  return (
    <div className="space-y-3">
      {value.map((server, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1 space-y-2">
            <Input
              value={server.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder="Server name"
              className="h-9"
            />
            <Input
              value={server.url}
              onChange={(event) => update(index, { url: event.target.value })}
              placeholder="https://mcp.example.com/sse"
              className="h-9 font-mono text-[13px]"
            />
            <Switch
              checked={server.enabled}
              onChange={(enabled) => update(index, { enabled })}
              label="Enabled"
            />
          </div>
          <RemoveButton
            label={`Remove server ${server.name || index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          />
        </div>
      ))}
      <AddRowButton
        label="Add MCP server"
        onClick={() => onChange([...value, { name: '', url: '', transport: 'sse', enabled: true }])}
      />
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
