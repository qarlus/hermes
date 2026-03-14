import { useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DesktopTower,
  FolderOpen,
  HardDrives,
  Key,
  ShieldCheck,
  X
} from "@phosphor-icons/react";
import type {
  GitHubRepositoryRecord,
  KeychainItemRecord,
  ProjectInput
} from "@hermes/core";
import { ProjectRemoteDirectoryDialog } from "./ProjectRemoteDirectoryDialog";

interface ProjectEditorProps {
  draft: ProjectInput;
  keychainItems: KeychainItemRecord[];
  gitHubRepositories: GitHubRepositoryRecord[];
  mode: "create" | "edit";
  saving: boolean;
  onChange: <K extends keyof ProjectInput>(field: K, value: ProjectInput[K]) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

const authOptions = [
  {
    value: "default" as const,
    label: "System SSH",
    description: "Use your local ssh config, agent, or default identity."
  },
  {
    value: "sshKey" as const,
    label: "Saved SSH key",
    description: "Pick a stored key or add a private key path for this project."
  }
];

export function ProjectEditor({
  draft,
  keychainItems,
  gitHubRepositories,
  mode,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose
}: ProjectEditorProps) {
  const sshKeyItems = useMemo(
    () => keychainItems.filter((item) => item.kind === "sshKey"),
    [keychainItems]
  );
  const hasSelectedCredential =
    draft.serverCredentialId.trim().length > 0 &&
    sshKeyItems.some((item) => item.id === draft.serverCredentialId.trim());
  const canBrowseRemote =
    draft.serverHostname.trim().length > 0 &&
    (draft.serverAuthKind === "default" ||
      hasSelectedCredential ||
      draft.serverCredentialSecret.trim().length > 0);

  const handleBrowseLocalPath = async () => {
    const selection = await open({
      directory: true,
      multiple: false,
      defaultPath: draft.path.trim() || undefined
    });

    if (typeof selection === "string") {
      onChange("path", selection);
    }
  };

  const handleBrowseKeyPath = async () => {
    const selection = await open({
      directory: false,
      multiple: false
    });

    if (typeof selection === "string") {
      onChange("serverCredentialSecret", selection);
    }
  };

  const handleCredentialPick = (credentialId: string) => {
    if (!credentialId) {
      onChange("serverCredentialId", "");
      onChange("serverCredentialName", "");
      onChange("serverCredentialSecret", "");
      return;
    }

    const selectedCredential = sshKeyItems.find((item) => item.id === credentialId);
    if (!selectedCredential) {
      return;
    }

    onChange("serverCredentialId", selectedCredential.id);
    onChange("serverCredentialName", selectedCredential.name);
    onChange("serverCredentialSecret", "");
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={mode === "create" ? "Create project" : "Edit project"}
        className="modal-card modal-card--workspace"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Project</p>
            <h2>{mode === "create" ? "New project" : "Edit project"}</h2>
          </div>
          <button
            aria-label="Close project modal"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-card__body form-grid form-grid--server">
          <section className="form-section field--full">
            <div className="form-section__header">
              <p className="eyebrow">Project</p>
              <span>GitHub repo, branch, and working directory.</span>
            </div>

            <div className="form-section__grid">
              <label className="field">
                <span>Name</span>
                <input
                  autoFocus
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="Hermes"
                  value={draft.name}
                />
              </label>

              <label className="field">
                <span>Runtime</span>
                <div className="runtime-switch" role="tablist" aria-label="Project runtime">
                  <button
                    aria-selected={draft.targetKind === "local"}
                    className={`runtime-switch__option ${
                      draft.targetKind === "local" ? "runtime-switch__option--active" : ""
                    }`}
                    onClick={() => onChange("targetKind", "local")}
                    role="tab"
                    type="button"
                  >
                    <span className="runtime-switch__icon">
                      <HardDrives size={13} />
                    </span>
                    <span className="runtime-switch__label">Local</span>
                  </button>
                  <button
                    aria-selected={draft.targetKind === "server"}
                    className={`runtime-switch__option ${
                      draft.targetKind === "server" ? "runtime-switch__option--active" : ""
                    }`}
                    onClick={() => onChange("targetKind", "server")}
                    role="tab"
                    type="button"
                  >
                    <span className="runtime-switch__icon">
                      <DesktopTower size={13} />
                    </span>
                    <span className="runtime-switch__label">Server</span>
                  </button>
                </div>
                <small className="field-hint">
                  {draft.targetKind === "local"
                    ? "Use a local folder on this machine."
                    : "Use SSH and a remote project directory."}
                </small>
              </label>

              <label className="field field--full">
                <span>Description</span>
                <textarea
                  onChange={(event) => onChange("description", event.target.value)}
                  placeholder="Repository, environment, or delivery context."
                  rows={4}
                  value={draft.description}
                />
              </label>

              <label className="field field--full">
                <span>GitHub repository</span>
                <input
                  list="project-github-repositories"
                  onChange={(event) => onChange("githubRepoFullName", event.target.value)}
                  placeholder="owner/repo"
                  value={draft.githubRepoFullName}
                />
                <datalist id="project-github-repositories">
                  {gitHubRepositories.map((repository) => (
                    <option key={repository.id} value={repository.fullName} />
                  ))}
                </datalist>
              </label>

              <label className="field">
                <span>Default branch</span>
                <input
                  onChange={(event) => onChange("githubDefaultBranch", event.target.value)}
                  placeholder="main"
                  value={draft.githubDefaultBranch}
                />
              </label>

              {draft.targetKind === "local" ? (
                <label className="field field--full">
                  <span>Local path</span>
                  <button className="path-picker-field" onClick={() => void handleBrowseLocalPath()} type="button">
                    <span className="path-picker-field__icon">
                      <HardDrives size={16} />
                    </span>
                    <span className="path-picker-field__copy">
                      <strong>{draft.path || "Choose a local project folder"}</strong>
                      <span>Opens the system directory picker.</span>
                    </span>
                    <span className="path-picker-field__action">Browse</span>
                  </button>
                </label>
              ) : null}
            </div>
          </section>

          {draft.targetKind === "server" ? (
            <>
              <section className="form-section field--full">
                <div className="form-section__header">
                  <p className="eyebrow">SSH</p>
                  <span>Enter the host first, then browse the remote directory over SSH.</span>
                </div>

                <div className="form-section__grid">
                  <label className="field field--full">
                    <span>Host or IP</span>
                    <input
                      onChange={(event) => onChange("serverHostname", event.target.value)}
                      placeholder="100.115.201.75"
                      value={draft.serverHostname}
                    />
                  </label>

                  <label className="field">
                    <span>Port</span>
                    <input
                      max={65535}
                      min={1}
                      onChange={(event) => onChange("serverPort", Number(event.target.value || 22))}
                      type="number"
                      value={draft.serverPort}
                    />
                  </label>

                  <label className="field">
                    <span>Login</span>
                    <input
                      onChange={(event) => onChange("serverUsername", event.target.value)}
                      placeholder="root"
                      value={draft.serverUsername}
                    />
                  </label>

                  <div className="field field--full">
                    <span>Authentication</span>
                    <div className="auth-options">
                      {authOptions.map((option) => (
                        <button
                          className={`auth-option ${
                            draft.serverAuthKind === option.value ? "auth-option--active" : ""
                          }`}
                          key={option.value}
                          onClick={() => onChange("serverAuthKind", option.value)}
                          type="button"
                        >
                          <span className="auth-option__icon">
                            {option.value === "sshKey" ? <Key size={14} /> : <ShieldCheck size={14} />}
                          </span>
                          <strong>{option.label}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {draft.serverAuthKind === "sshKey" ? (
                    <>
                      <label className="field field--full">
                        <span>Saved key</span>
                        <div className="field-select">
                          <select
                            onChange={(event) => handleCredentialPick(event.target.value)}
                            value={draft.serverCredentialId}
                          >
                            <option value="">Add a key path for this project</option>
                            {sshKeyItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.usageCount})
                              </option>
                            ))}
                          </select>
                          <span aria-hidden="true" className="field-select__chevron" />
                        </div>
                        <small className="field-hint">
                          Choose an existing saved SSH key or add a new key path below.
                        </small>
                      </label>

                      <label className="field">
                        <span>Key label</span>
                        <input
                          onChange={(event) => onChange("serverCredentialName", event.target.value)}
                          placeholder="Primary deploy key"
                          readOnly={hasSelectedCredential}
                          value={draft.serverCredentialName}
                        />
                      </label>

                      <label className="field">
                        <span>Private key path</span>
                        <div className="inline-field-action">
                          <input
                            onChange={(event) => onChange("serverCredentialSecret", event.target.value)}
                            placeholder={
                              hasSelectedCredential
                                ? "Saved in credentials. Pick another key to switch."
                                : "~/.ssh/id_ed25519"
                            }
                            readOnly={hasSelectedCredential}
                            value={draft.serverCredentialSecret}
                          />
                          <button
                            className="ghost-button"
                            disabled={hasSelectedCredential}
                            onClick={() => void handleBrowseKeyPath()}
                            type="button"
                          >
                            <FolderOpen size={16} />
                            Key
                          </button>
                        </div>
                      </label>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="form-section field--full">
                <div className="form-section__header">
                  <p className="eyebrow">Remote path</p>
                  <span>Browse the server after the SSH details are in place.</span>
                </div>

                <div className="field field--full">
                  <span>Project directory</span>
                  <ProjectRemoteDirectoryDialog
                    connection={{
                      hostname: draft.serverHostname,
                      port: draft.serverPort,
                      username: draft.serverUsername,
                      authKind: draft.serverAuthKind,
                      credentialId: draft.serverCredentialId.trim() || null,
                      credentialName: draft.serverCredentialName,
                      credentialSecret: draft.serverCredentialSecret
                    }}
                    currentPath={draft.path}
                    disabled={!canBrowseRemote}
                    onChoose={(path) => onChange("path", path)}
                  />
                </div>
              </section>
            </>
          ) : null}
        </div>

        <div className="modal-card__actions">
          {mode === "edit" && onDelete ? (
            <button className="danger-button" onClick={onDelete} type="button">
              Delete project
            </button>
          ) : (
            <span />
          )}
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? "Saving..." : mode === "create" ? "Create project" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}
