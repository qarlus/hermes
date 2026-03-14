import { FolderOpen, KeyRound, LockKeyhole, X } from "lucide-react";
import type { KeychainItemKind } from "@hermes/core";

interface KeychainItemEditorProps {
  mode: "create" | "edit";
  name: string;
  kind: KeychainItemKind;
  secret: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onKindChange: (value: KeychainItemKind) => void;
  onSecretChange: (value: string) => void;
  onBrowseSecret?: () => void;
  onClose: () => void;
  onDelete?: () => void;
  onSave: () => void;
}

export function KeychainItemEditor({
  mode,
  name,
  kind,
  secret,
  saving,
  onNameChange,
  onKindChange,
  onSecretChange,
  onBrowseSecret,
  onClose,
  onDelete,
  onSave
}: KeychainItemEditorProps) {
  const secretLabel = kind === "password" ? "Password" : "SSH key path";
  const secretPlaceholder =
    kind === "password" ? "Password" : "C:\\Users\\karl-\\.ssh\\id_ed25519";

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal-card modal-card--workspace" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Credentials</p>
            <h2>{mode === "create" ? "Add credential" : "Edit credential"}</h2>
          </div>
          <button
            aria-label="Close credential editor"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-card__body form-grid">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Production password"
              value={name}
            />
          </label>

          {mode === "create" ? (
            <>
              <div className="field">
                <span>Kind</span>
                <div className="auth-options auth-options--compact">
                  <button
                    className={`auth-option ${kind === "sshKey" ? "auth-option--active" : ""}`}
                    onClick={() => onKindChange("sshKey")}
                    type="button"
                  >
                    <span className="auth-option__icon">
                      <KeyRound size={14} />
                    </span>
                    <strong>SSH Key</strong>
                    <span>Save a private key path from this device.</span>
                  </button>
                  <button
                    className={`auth-option ${kind === "password" ? "auth-option--active" : ""}`}
                    onClick={() => onKindChange("password")}
                    type="button"
                  >
                    <span className="auth-option__icon">
                      <LockKeyhole size={14} />
                    </span>
                    <strong>Password</strong>
                    <span>Save a password for reuse across saved servers.</span>
                  </button>
                </div>
              </div>

              <label className="field">
                <span>{secretLabel}</span>
                {kind === "sshKey" ? (
                  <div className="field-row">
                    <input
                      onChange={(event) => onSecretChange(event.target.value)}
                      placeholder={secretPlaceholder}
                      value={secret}
                    />
                    <button className="ghost-button" onClick={onBrowseSecret} type="button">
                      <FolderOpen size={14} />
                      Browse
                    </button>
                  </div>
                ) : (
                  <input
                    onChange={(event) => onSecretChange(event.target.value)}
                    placeholder={secretPlaceholder}
                    type="password"
                    value={secret}
                  />
                )}
              </label>
            </>
          ) : null}
        </div>

        <div className="modal-card__actions">
          {mode === "edit" && onDelete ? (
            <button className="danger-button" onClick={onDelete} type="button">
              Delete credential
            </button>
          ) : (
            <span />
          )}
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? "Saving..." : mode === "create" ? "Add credential" : "Save name"}
          </button>
        </div>
      </section>
    </div>
  );
}
