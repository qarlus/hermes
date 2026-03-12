import { FolderOpen, FolderPlus, X } from "lucide-react";

interface LocalSessionPresetEditorProps {
  name: string;
  path: string;
  saving: boolean;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onBrowsePath: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function LocalSessionPresetEditor({
  name,
  path,
  saving,
  onNameChange,
  onPathChange,
  onBrowsePath,
  onClose,
  onSave
}: LocalSessionPresetEditorProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label="Save path shortcut"
        className="modal-card modal-card--workspace"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Sessions</p>
            <h2>Save path shortcut</h2>
          </div>
          <button
            aria-label="Close local path editor"
            className="ghost-button ghost-button--icon"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Shortcut label</span>
            <input
              autoFocus
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Hermes repo"
              value={name}
            />
            <span className="field-hint">Shows up as a one-click button in Sessions.</span>
          </label>

          <label className="field">
            <span>Folder to open</span>
            <div className="field-row">
              <input
                onChange={(event) => onPathChange(event.target.value)}
                placeholder="C:\\Users\\karl-\\Documents\\hermes"
                value={path}
              />
              <button className="ghost-button" onClick={onBrowsePath} type="button">
                <FolderOpen size={14} />
                Browse
              </button>
            </div>
            <span className="field-hint">
              Hermes starts a local shell in this folder when you use the shortcut.
            </span>
          </label>
        </div>

        <div className="modal-card__actions">
          <span />
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            <FolderPlus size={14} />
            {saving ? "Saving..." : "Save shortcut"}
          </button>
        </div>
      </section>
    </div>
  );
}
