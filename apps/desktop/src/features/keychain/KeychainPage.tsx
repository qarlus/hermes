import { KeyRound, PencilLine, Trash2 } from "lucide-react";
import type { KeychainItemRecord } from "@hermes/core";

interface KeychainPageProps {
  items: KeychainItemRecord[];
  search: string;
  onSearchChange: (value: string) => void;
  onRename: (item: KeychainItemRecord) => void;
  onDelete: (id: string) => void;
}

export function KeychainPage({
  items,
  search,
  onSearchChange,
  onRename,
  onDelete
}: KeychainPageProps) {
  return (
    <div className="keychain-page">
      <div className="keychain-page__toolbar">
        <label className="dashboard-search">
          <KeyRound size={14} />
          <input
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Find credential"
            value={search}
          />
        </label>
      </div>

      {items.length === 0 ? (
        <div className="workspace__empty">
          <p>No saved credentials</p>
          <span>Passwords and SSH key paths saved from server setup appear here.</span>
        </div>
      ) : (
        <div className="keychain-list">
          {items.map((item) => (
            <div className="keychain-row" key={item.id}>
              <div className="keychain-row__main">
                <span className="keychain-row__icon">
                  <KeyRound size={14} />
                </span>
                <div className="keychain-row__body">
                  <strong>{item.name}</strong>
                  <span>{item.kind === "password" ? "Password" : "SSH key path"}</span>
                  <span>{item.usageCount} attached server{item.usageCount === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="keychain-row__actions">
                <button
                  className="ghost-button ghost-button--icon"
                  onClick={() => onRename(item)}
                  title="Rename credential"
                  type="button"
                >
                  <PencilLine size={14} />
                </button>
                <button
                  className="ghost-button ghost-button--icon"
                  onClick={() => onDelete(item.id)}
                  title="Delete credential"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
