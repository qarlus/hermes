import { FolderOpen, KeyRound, X } from "lucide-react";

interface LocalSshKeyEditorProps {
  name: string;
  directory: string;
  fileName: string;
  passphrase: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDirectoryChange: (value: string) => void;
  onFileNameChange: (value: string) => void;
  onPassphraseChange: (value: string) => void;
  onBrowseDirectory: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function LocalSshKeyEditor({
  name,
  directory,
  fileName,
  passphrase,
  saving,
  onNameChange,
  onDirectoryChange,
  onFileNameChange,
  onPassphraseChange,
  onBrowseDirectory,
  onClose,
  onSave
}: LocalSshKeyEditorProps) {
  const separator = directory.includes("\\") ? "\\" : "/";
  const fullPath = directory.trim() && fileName.trim() ? `${directory}${separator}${fileName}` : "";

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal-card modal-card--workspace" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Keychain</p>
            <h2>Create SSH key</h2>
          </div>
          <button
            aria-label="Close SSH key editor"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="modal-card__body form-grid">
          <div className="form-section">
            <div className="form-section__header">
              <p className="eyebrow">Local key</p>
              <span>Generate a new ed25519 key on this device and save its path into Keychain.</span>
            </div>

            <label className="field">
              <span>Credential name</span>
              <input
                autoFocus
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Primary SSH key"
                value={name}
              />
            </label>

            <label className="field">
              <span>Directory</span>
              <div className="field-row">
                <input
                  onChange={(event) => onDirectoryChange(event.target.value)}
                  placeholder="C:\\Users\\karl-\\.ssh"
                  value={directory}
                />
                <button className="ghost-button" onClick={onBrowseDirectory} type="button">
                  <FolderOpen size={14} />
                  Browse
                </button>
              </div>
            </label>

            <label className="field">
              <span>File name</span>
              <input
                onChange={(event) => onFileNameChange(event.target.value)}
                placeholder="id_ed25519"
                value={fileName}
              />
            </label>

            <label className="field">
              <span>Passphrase</span>
              <input
                onChange={(event) => onPassphraseChange(event.target.value)}
                placeholder="Optional"
                type="password"
                value={passphrase}
              />
            </label>

            {fullPath ? (
              <div className="keygen-preview">
                <span className="keygen-preview__icon">
                  <KeyRound size={14} />
                </span>
                <div className="keygen-preview__body">
                  <strong>Private key path</strong>
                  <span>{fullPath}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-card__actions">
          <span />
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? "Creating..." : "Create SSH key"}
          </button>
        </div>
      </section>
    </div>
  );
}
