import { KeyRound, LockKeyhole, Shield, X } from "lucide-react";
import type { ProjectRecord, ServerAuthKind, ServerInput } from "@hermes/core";

interface ServerEditorProps {
  draft: ServerInput;
  projects: ProjectRecord[];
  mode: "create" | "edit";
  saving: boolean;
  onChange: <K extends keyof ServerInput>(field: K, value: ServerInput[K]) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

const authOptions: Array<{
  value: ServerAuthKind;
  label: string;
  description: string;
}> = [
  { value: "default", label: "System", description: "Use local ssh config, agent, or prompts." },
  { value: "sshKey", label: "SSH Key", description: "Save a private key path in the keychain." },
  { value: "password", label: "Password", description: "Save a password in the keychain." }
];

export function ServerEditor({
  draft,
  projects,
  mode,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose
}: ServerEditorProps) {
  const secretPlaceholder =
    draft.authKind === "password"
      ? mode === "edit"
        ? "Encrypted in keychain. Enter a new password to replace it."
        : "Password"
      : mode === "edit"
        ? "Encrypted in keychain. Enter a new key path to replace it."
        : "~/.ssh/id_ed25519";

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={mode === "create" ? "Create server" : "Edit server"}
        className="modal-card modal-card--server"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Server</p>
            <h2>{mode === "create" ? "New server" : "Edit server"}</h2>
          </div>
          <button
            aria-label="Close server modal"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-card__body form-grid form-grid--server">
          <section className="form-section field--full">
            <div className="form-section__header">
              <p className="eyebrow">Connection</p>
              <span>Where Hermes connects.</span>
            </div>

            <div className="form-section__grid">
              <label className="field">
                <span>Workspace</span>
                <select
                  value={draft.projectId}
                  onChange={(event) => onChange("projectId", event.target.value)}
                >
                  <option value="" disabled>
                    Select workspace
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Name</span>
                <input
                  autoFocus
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="Root"
                  value={draft.name}
                />
              </label>

              <label className="field field--full">
                <span>Hostname</span>
                <input
                  onChange={(event) => onChange("hostname", event.target.value)}
                  placeholder="100.115.201.75"
                  value={draft.hostname}
                />
              </label>

              <label className="field">
                <span>Port</span>
                <input
                  max={65535}
                  min={1}
                  onChange={(event) => onChange("port", Number(event.target.value || 22))}
                  type="number"
                  value={draft.port}
                />
              </label>

              <label className="field">
                <span>Username</span>
                <input
                  onChange={(event) => onChange("username", event.target.value)}
                  placeholder="root"
                  value={draft.username}
                />
              </label>
            </div>
          </section>

          <section className="form-section field--full">
            <div className="form-section__header">
              <p className="eyebrow">Authentication</p>
              <span>Saved credentials are encrypted and listed on the keychain page.</span>
            </div>

            <div className="auth-options">
              {authOptions.map((option) => (
                <button
                  className={`auth-option ${draft.authKind === option.value ? "auth-option--active" : ""}`}
                  key={option.value}
                  onClick={() => onChange("authKind", option.value)}
                  type="button"
                >
                  <span className="auth-option__icon">
                    {option.value === "password" ? (
                      <LockKeyhole size={14} />
                    ) : option.value === "sshKey" ? (
                      <KeyRound size={14} />
                    ) : (
                      <Shield size={14} />
                    )}
                  </span>
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            {draft.authKind !== "default" ? (
              <div className="form-section__grid">
                <label className="field">
                  <span>Credential name</span>
                  <input
                    onChange={(event) => onChange("credentialName", event.target.value)}
                    placeholder={
                      draft.authKind === "password" ? "Production password" : "Primary SSH key"
                    }
                    value={draft.credentialName}
                  />
                </label>

                <label className="field">
                  <span>{draft.authKind === "password" ? "Password" : "Private key path"}</span>
                  <input
                    onChange={(event) => onChange("credentialSecret", event.target.value)}
                    placeholder={secretPlaceholder}
                    type={draft.authKind === "password" ? "password" : "text"}
                    value={draft.credentialSecret}
                  />
                </label>
              </div>
            ) : null}

          </section>

          <section className="form-section field--full">
            <div className="form-section__header">
              <p className="eyebrow">Tmux</p>
              <span>Disabled by default. Rejoin sessions explicitly from the workspace.</span>
            </div>

            <div className="form-section__grid">
              <label className="field">
                <span>Remote tmux</span>
                <button
                  className={`toggle ${draft.useTmux ? "toggle--active" : ""}`}
                  onClick={() => onChange("useTmux", !draft.useTmux)}
                  type="button"
                >
                  {draft.useTmux ? "Enabled" : "Disabled"}
                </button>
              </label>

              <label className="field">
                <span>Session name</span>
                <input
                  disabled={!draft.useTmux}
                  onChange={(event) => onChange("tmuxSession", event.target.value)}
                  placeholder="main"
                  value={draft.tmuxSession}
                />
              </label>
            </div>
          </section>

          <section className="form-section field--full">
            <div className="form-section__header">
              <p className="eyebrow">Notes</p>
              <span>Optional connection context for this server.</span>
            </div>

            <label className="field">
              <span>Notes</span>
              <textarea
                onChange={(event) => onChange("notes", event.target.value)}
                placeholder="Jump host details, shell hints, or connection context."
                rows={3}
                value={draft.notes}
              />
            </label>
          </section>
        </div>

        <div className="modal-card__actions">
          {mode === "edit" && onDelete ? (
            <button className="danger-button" onClick={onDelete} type="button">
              Delete server
            </button>
          ) : (
            <span />
          )}
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? "Saving..." : mode === "create" ? "Create server" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}
