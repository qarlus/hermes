import { X } from "lucide-react";
import type { ProjectInput } from "@hermes/core";

interface ProjectEditorProps {
  draft: ProjectInput;
  mode: "create" | "edit";
  saving: boolean;
  onChange: <K extends keyof ProjectInput>(field: K, value: ProjectInput[K]) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function ProjectEditor({
  draft,
  mode,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose
}: ProjectEditorProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={mode === "create" ? "Create workspace" : "Edit workspace"}
        className="modal-card modal-card--workspace"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h2>{mode === "create" ? "New workspace" : "Edit workspace"}</h2>
          </div>
          <button
            aria-label="Close workspace modal"
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
              value={draft.name}
              onChange={(event) => onChange("name", event.target.value)}
              placeholder="Production"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => onChange("description", event.target.value)}
              placeholder="Infrastructure, environment, or customer boundary."
              rows={4}
            />
          </label>
        </div>

        <div className="modal-card__actions">
          {mode === "edit" && onDelete ? (
            <button className="danger-button" onClick={onDelete} type="button">
              Delete workspace
            </button>
          ) : (
            <span />
          )}
          <button className="primary-button" onClick={onSave} disabled={saving} type="button">
            {saving ? "Saving..." : mode === "create" ? "Create workspace" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}
