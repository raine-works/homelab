import * as gcp from "@pulumi/gcp";
import { project } from "./config";

/**
 * Homelab GCP Secrets Reference Module
 *
 * References existing GCP Secret Manager secret versions for NetBird Auth, Store Encryption,
 * and Proxy tokens. Secrets are created and managed by the user in GCP project `homelab-497021`.
 */

/**
 * Reference to existing GCP Secret Manager secret version for NetBird Auth Secret.
 * Secret ID: `netbird-auth-secret`
 */
export const netbirdAuthSecret = gcp.secretmanager.getSecretVersionOutput({
  secret: "netbird-auth-secret",
  project: project,
});

/**
 * Reference to existing GCP Secret Manager secret version for NetBird Store Encryption Key.
 * Secret ID: `netbird-store-encryption-key`
 */
export const netbirdStoreEncryptionKey = gcp.secretmanager.getSecretVersionOutput({
  secret: "netbird-store-encryption-key",
  project: project,
});

/**
 * Reference to existing GCP Secret Manager secret version for NetBird Proxy Access Token.
 * Secret ID: `netbird-proxy-token`
 */
export const netbirdProxyTokenSecret = gcp.secretmanager.getSecretVersionOutput({
  secret: "netbird-proxy-token",
  project: project,
});
