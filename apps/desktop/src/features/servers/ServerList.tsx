import { Pencil, Plus, Server, ServerCog, TerminalSquare } from "lucide-react";
import { buildSshTarget, serverDisplayLabel, type ServerRecord } from "@hermes/core";

interface ServerListProps {
  servers: ServerRecord[];
  selectedServerId: string | null;
  onSelect: (serverId: string) => void;
  onConnect: (serverId: string) => void;
  onEdit: (serverId: string) => void;
  onOpenRelaySetup?: (serverId: string) => void;
  onCreate?: () => void;
}

export function ServerList({
  servers,
  selectedServerId,
  onSelect,
  onConnect,
  onEdit,
  onOpenRelaySetup,
  onCreate
}: ServerListProps) {
  if (servers.length === 0) {
    return (
      <div className="server-list server-list--empty">
        <p>No servers in this workspace.</p>
        <span>Add a server and connect through the system SSH binary.</span>
        {onCreate ? (
          <button className="primary-button" onClick={onCreate} type="button">
            <Plus size={14} />
            Add Server
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="server-list">
      {servers.map((server) => (
        <div
          className={`server-row ${selectedServerId === server.id ? "server-row--active" : ""}`}
          key={server.id}
          onClick={() => onSelect(server.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(server.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="server-row__main">
            <span className="server-row__icon">
              <Server size={14} />
            </span>
            <div className="server-row__body">
              <strong>{serverDisplayLabel(server)}</strong>
              <span>{buildSshTarget(server)}</span>
              <span className="server-row__meta">
                {server.hostname}:{server.port}
                {server.authKind === "password"
                  ? " / password"
                  : server.authKind === "sshKey"
                    ? " / ssh key"
                    : " / system auth"}
                {server.useTmux ? ` / tmux:${server.tmuxSession}` : ""}
              </span>
            </div>
          </div>
          <div className="server-row__actions">
            <button
              aria-label={`Edit ${serverDisplayLabel(server)}`}
              className="ghost-button ghost-button--icon"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(server.id);
              }}
              title="Edit server"
              type="button"
            >
              <Pencil size={13} />
            </button>
            <button
              className="ghost-button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRelaySetup?.(server.id);
              }}
              type="button"
            >
              <ServerCog size={14} />
              Relay
            </button>
            <button
              className="connect-chip"
              onClick={(event) => {
                event.stopPropagation();
                onConnect(server.id);
              }}
              type="button"
            >
              <TerminalSquare size={14} />
              Open
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
