import { Copy, KeyRound, PencilLine, Trash2 } from "lucide-react";
import type { KeychainItemRecord } from "@hermes/core";

interface KeychainPageProps {
  items: KeychainItemRecord[];
  search: string;
  onSearchChange: (value: string) => void;
  onRename: (item: KeychainItemRecord) => void;
  onDelete: (id: string) => void;
  onCopyPublicKey: (id: string) => void;
  copyingPublicKeyId: string | null;
}

export function KeychainPage({
  items,
  search,
  onSearchChange,
  onRename,
  onDelete,
  onCopyPublicKey,
  copyingPublicKeyId
}: KeychainPageProps) {
  return (
    <div className="keychain-page">
      <div className="keychain-page__board">
        <section className="keychain-page__section">
          <div className="keychain-page__header">
            <div>
              <p className="eyebrow">Credentials</p>
              <h2>Saved credentials</h2>
              <span>Passwords and SSH key paths stored from server setup appear here.</span>
            </div>
            <div className="keychain-page__header-actions">
              <span className="keychain-page__meta">
                {items.length} credential{items.length === 1 ? "" : "s"}
              </span>
              <label className="dashboard-search keychain-page__search">
                <KeyRound size={14} />
                <input
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Find credential"
                  value={search}
                />
              </label>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="keychain-page__empty">
              <span className="keychain-row__icon">
                <KeyRound size={14} />
              </span>
              <div className="keychain-page__empty-body">
                <strong>No saved credentials</strong>
                <span>
                  Passwords and SSH key paths saved from server setup or resolved from this
                  device&apos;s SSH config appear here.
                </span>
              </div>
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
                      <span>
                        {item.usageCount} attached server{item.usageCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="keychain-row__actions">
                    {item.kind === "sshKey" ? (
                      <button
                        className="ghost-button keychain-row__copy-button"
                        disabled={copyingPublicKeyId === item.id}
                        onClick={() => onCopyPublicKey(item.id)}
                        title="Copy public key"
                        type="button"
                      >
                        <Copy size={14} />
                        {copyingPublicKeyId === item.id ? "Copying..." : "Copy public key"}
                      </button>
                    ) : null}
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
        </section>
      </div>
    </div>
  );
}
