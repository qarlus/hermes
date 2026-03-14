import {
  Copy,
  GithubLogo,
  Key,
  LockKeyOpen,
  Password,
  PencilSimple,
  ShieldCheck,
  Trash
} from "@phosphor-icons/react";
import type { GitHubAuthSession, KeychainItemRecord } from "@hermes/core";

interface KeychainPageProps {
  items: KeychainItemRecord[];
  gitHubSession: GitHubAuthSession | null;
  onRename: (item: KeychainItemRecord) => void;
  onDelete: (id: string) => void;
  onCopyPublicKey: (id: string) => void;
  copyingPublicKeyId: string | null;
  onCreateCredential: () => void;
  onCreateLocalSshKey: () => void;
}

export function KeychainPage({
  items,
  gitHubSession,
  onRename,
  onDelete,
  onCopyPublicKey,
  copyingPublicKeyId,
  onCreateCredential,
  onCreateLocalSshKey
}: KeychainPageProps) {
  const sshItems = items.filter((item) => item.kind === "sshKey");
  const passwordItems = items.filter((item) => item.kind === "password");
  const attachedServerCount = items.reduce((total, item) => total + item.usageCount, 0);
  const lastUpdatedAt = items
    .map((item) => Date.parse(item.updatedAt))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];
  const sections = [
    {
      id: "ssh",
      eyebrow: "SSH access",
      title: "SSH keys",
      description: "Private key references reused across servers and projects.",
      icon: Key,
      items: sshItems
    },
    {
      id: "passwords",
      eyebrow: "Server access",
      title: "Passwords",
      description: "Encrypted user and service passwords for saved hosts.",
      icon: Password,
      items: passwordItems
    }
  ].filter((section) => section.items.length > 0);

  return (
    <div className="credentials-page">
      <div className="credentials-page__shell">
        <header className="credentials-header">
          <div className="credentials-header__copy">
            <p className="eyebrow">Credentials</p>
            <h1>Credentials</h1>
            <span>SSH keys, server passwords, and Git access in one local vault.</span>
          </div>

          <div className="credentials-header__tools">
            <div className="credentials-header__meta">
              <span className="credentials-inline-stat">
                <Key size={12} weight="bold" />
                {sshItems.length} SSH
              </span>
              <span className="credentials-inline-stat">
                <Password size={12} weight="bold" />
                {passwordItems.length} passwords
              </span>
              <span className="credentials-inline-stat">
                <ShieldCheck size={12} weight="bold" />
                {attachedServerCount} attached
              </span>
            </div>
          </div>
        </header>

        <div className="credentials-layout">
          <section className="credentials-panel credentials-panel--main">
            <div className="credentials-panel__header">
              <div>
                <p className="eyebrow">Stored credentials</p>
                <h2>Reusable secrets</h2>
              </div>
              <span className="credentials-panel__meta">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="credentials-empty">
                <div className="credentials-empty__body">
                  <p className="eyebrow">Start here</p>
                  <h3>No credentials stored yet.</h3>
                  <span>
                    Add a password, save an SSH key path, or generate a local SSH key for reuse
                    across saved hosts.
                  </span>
                </div>
                <div className="credentials-empty__actions">
                  <button className="primary-button" onClick={onCreateCredential} type="button">
                    Add credential
                  </button>
                  <button className="ghost-button" onClick={onCreateLocalSshKey} type="button">
                    Create SSH key
                  </button>
                </div>
              </div>
            ) : (
              <div className="credentials-groups">
                {sections.map((section) => (
                  <section className="credentials-group" key={section.id}>
                    <header className="credentials-group__header">
                      <div className="credentials-group__headline">
                        <span className="credentials-group__icon">
                          <section.icon size={16} weight="bold" />
                        </span>
                        <div>
                          <p className="eyebrow">{section.eyebrow}</p>
                          <h3>{section.title}</h3>
                          <span>{section.description}</span>
                        </div>
                      </div>
                      <span className="credentials-group__count">
                        {section.items.length} item{section.items.length === 1 ? "" : "s"}
                      </span>
                    </header>

                    <div className="credentials-group__list">
                      {section.items.map((item) => (
                        <article className="credential-row" key={item.id}>
                          <div className="credential-row__main">
                            <span className="credential-row__icon">
                              {item.kind === "password" ? (
                                <Password size={16} weight="bold" />
                              ) : (
                                <Key size={16} weight="bold" />
                              )}
                            </span>
                            <div className="credential-row__body">
                              <div className="credential-row__title-row">
                                <strong>{item.name}</strong>
                                <span className={`credential-kind credential-kind--${item.kind}`}>
                                  {item.kind === "password" ? "Password" : "SSH key"}
                                </span>
                              </div>
                              <span>
                                {item.kind === "password"
                                  ? "Encrypted secret for remote logins and service users."
                                  : "Private key path stored for servers, projects, and deploy flows."}
                              </span>
                              <div className="credential-row__meta">
                                <span>
                                  {item.usageCount} attached server{item.usageCount === 1 ? "" : "s"}
                                </span>
                                <span>Updated {formatDateLabel(item.updatedAt)}</span>
                                <span>Created {formatDateLabel(item.createdAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="credential-row__actions">
                            {item.kind === "sshKey" ? (
                              <button
                                className="ghost-button credential-row__copy-button"
                                disabled={copyingPublicKeyId === item.id}
                                onClick={() => onCopyPublicKey(item.id)}
                                title="Copy public key"
                                type="button"
                              >
                                <Copy size={14} weight="bold" />
                                {copyingPublicKeyId === item.id ? "Copying..." : "Copy public key"}
                              </button>
                            ) : null}
                            <button
                              className="ghost-button ghost-button--icon"
                              onClick={() => onRename(item)}
                              title="Rename credential"
                              type="button"
                            >
                              <PencilSimple size={14} weight="bold" />
                            </button>
                            <button
                              className="ghost-button ghost-button--icon"
                              onClick={() => onDelete(item.id)}
                              title="Delete credential"
                              type="button"
                            >
                              <Trash size={14} weight="bold" />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          <aside className="credentials-panel credentials-panel--sidebar">
            <article className="credentials-sidebar-block">
              <p className="eyebrow">Overview</p>
              <div className="credentials-sidebar-stats">
                <div className="credentials-sidebar-stat">
                  <span>Total stored</span>
                  <strong>{items.length}</strong>
                </div>
                <div className="credentials-sidebar-stat">
                  <span>Attached servers</span>
                  <strong>{attachedServerCount}</strong>
                </div>
                <div className="credentials-sidebar-stat">
                  <span>Last update</span>
                  <strong>{lastUpdatedAt ? formatDateLabel(lastUpdatedAt) : "Not yet"}</strong>
                </div>
              </div>
            </article>

            <article className="credentials-sidebar-block">
              <div className="credentials-sidebar-block__header">
                <GithubLogo size={16} weight="bold" />
                <div>
                  <p className="eyebrow">Git access</p>
                  <h3>{gitHubSession ? "GitHub connected" : "Git token ready"}</h3>
                </div>
              </div>
              <span className="credentials-sidebar-copy">
                {gitHubSession
                  ? `Signed in as @${gitHubSession.login}. Hermes can reuse that secure token state for repository access.`
                  : "Connect GitHub from the Git page and Hermes will keep that provider token alongside the rest of these credentials."}
              </span>
            </article>

            <article className="credentials-sidebar-block">
              <div className="credentials-sidebar-block__header">
                <LockKeyOpen size={16} weight="bold" />
                <div>
                  <p className="eyebrow">Security model</p>
                  <h3>Local-first storage</h3>
                </div>
              </div>
              <span className="credentials-sidebar-copy">
                Credentials stay local, are reused intentionally, and only expose SSH public key
                material when you explicitly copy it.
              </span>
            </article>

            <article className="credentials-sidebar-block">
              <p className="eyebrow">Coverage</p>
              <div className="credentials-sidebar-list">
                <div className="credentials-sidebar-list__row">
                  <strong>SSH access</strong>
                  <span>Personal keys, deploy keys, runtime access</span>
                </div>
                <div className="credentials-sidebar-list__row">
                  <strong>Server passwords</strong>
                  <span>Saved users, fallback auth, simple rotation</span>
                </div>
                <div className="credentials-sidebar-list__row">
                  <strong>Git providers</strong>
                  <span>GitHub today, more credential types can land here next</span>
                </div>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
}

function formatDateLabel(value: string | number) {
  const numericValue = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}
