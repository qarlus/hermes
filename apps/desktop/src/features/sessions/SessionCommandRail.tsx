import { useState } from "react";
import { Play, Plus, TerminalSquare, Trash2, X } from "lucide-react";
import type { TerminalCommandRecord } from "@hermes/core";

interface SessionCommandRailProps {
  commands: TerminalCommandRecord[];
  canRunCommands: boolean;
  activeTerminalLabel: string | null;
  onCreateCommand: (input: { name: string; command: string }) => void;
  onDeleteCommand: (id: string) => void;
  onRunCommand: (command: string) => void;
}

export function SessionCommandRail({
  commands,
  canRunCommands,
  activeTerminalLabel,
  onCreateCommand,
  onDeleteCommand,
  onRunCommand
}: SessionCommandRailProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");

  const resetComposer = () => {
    setComposerOpen(false);
    setName("");
    setCommand("");
  };

  const handleSave = () => {
    onCreateCommand({ name, command });
    resetComposer();
  };

  return (
    <section aria-label="Quick terminal commands" className="session-command-rail">
      <div className="session-command-rail__header">
        <div>
          <p className="eyebrow">Sessions</p>
          <h3>Quick commands</h3>
        </div>
        {composerOpen ? (
          <button
            aria-label="Close command editor"
            className="ghost-button ghost-button--icon"
            onClick={resetComposer}
            type="button"
          >
            <X size={14} />
          </button>
        ) : (
          <button className="ghost-button" onClick={() => setComposerOpen(true)} type="button">
            <Plus size={14} />
            Add
          </button>
        )}
      </div>

      <div className="session-command-rail__summary">
        <span className="session-command-rail__badge">
          <TerminalSquare size={12} />
          {activeTerminalLabel ?? "No active terminal"}
        </span>
        <p>Clicking a saved command sends it to the active terminal and runs it immediately.</p>
      </div>

      {composerOpen ? (
        <div className="session-command-rail__composer">
          <label className="field">
            <span>Label</span>
            <input
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Update app"
              value={name}
            />
          </label>

          <label className="field">
            <span>Command</span>
            <textarea
              onChange={(event) => setCommand(event.target.value)}
              placeholder="git pull && bun install"
              rows={4}
              value={command}
            />
          </label>

          <div className="session-command-rail__composer-actions">
            <button className="ghost-button" onClick={resetComposer} type="button">
              Cancel
            </button>
            <button className="primary-button" onClick={handleSave} type="button">
              <Plus size={14} />
              Save command
            </button>
          </div>
        </div>
      ) : null}

      {commands.length === 0 ? (
        <div className="session-command-rail__empty">
          <strong>No quick commands yet</strong>
          <span>Save commands for package updates, deploy hooks, or any repeated shell task.</span>
        </div>
      ) : (
        <div className="session-command-rail__list">
          {commands.map((savedCommand) => (
            <article className="session-command-rail__item" key={savedCommand.id}>
              <button
                className="session-command-rail__run"
                disabled={!canRunCommands}
                onClick={() => onRunCommand(savedCommand.command)}
                type="button"
              >
                <div className="session-command-rail__item-copy">
                  <strong>{savedCommand.name}</strong>
                  <code>{savedCommand.command}</code>
                </div>
                <span className="session-command-rail__item-action">
                  <Play size={13} />
                  Run
                </span>
              </button>
              <button
                aria-label={`Delete ${savedCommand.name}`}
                className="session-command-rail__delete"
                onClick={() => onDeleteCommand(savedCommand.id)}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
