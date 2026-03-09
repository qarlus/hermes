export interface SecretEnvelope {
  scope: "host" | "sync";
  key: string;
  ciphertext: string;
}

export interface SecretStore {
  save(secret: SecretEnvelope): Promise<void>;
  load(scope: SecretEnvelope["scope"], key: string): Promise<SecretEnvelope | null>;
  remove(scope: SecretEnvelope["scope"], key: string): Promise<void>;
}

export const secretStoreStatus = "placeholder";
