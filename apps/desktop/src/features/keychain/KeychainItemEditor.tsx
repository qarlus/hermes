import { X } from "lucide-react";

interface KeychainItemEditorProps {
  name: string;
  saving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}

export function KeychainItemEditor({
  name,
  saving,
  onChange,
  onClose,
  onDelete,
  onSave
}: KeychainItemEditorProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal-card modal-card--workspace" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Keychain</p>
            <h2>Edit credential</h2>
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
              onChange={(event) => onChange(event.target.value)}
              placeholder="Production password"
              value={name}
            />
          </label>
        </div>

        <div className="modal-card__actions">
          <button className="danger-button" onClick={onDelete} type="button">
            Delete credential
          </button>
          <button className="primary-button" disabled={saving} onClick={onSave} type="button">
            {saving ? "Saving..." : "Save name"}
          </button>
        </div>
      </section>
    </div>
  );
}
