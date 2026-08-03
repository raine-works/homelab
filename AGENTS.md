# Agent Guidelines for Homelab Repository

## Operational Rules

1. **Stack Scoping**:
   * All GCP infrastructure changes MUST target GCP Project ID `homelab-497021` in region `us-west3`.
   * Pulumi state MUST reside in `gs://raineworks_homelab_pulumi_backend`.

2. **Code Standards**:
   * Use Bun (`bun run`) for execution.
   * Run `bun run typecheck`, `bun run lint`, and `bun run format` before finalizing code edits.
   * Preserve all existing comments and docstrings.

3. **Data Protection**:
   * Never set `protect: false` or `autoDelete: true` on `homelab-data-disk`.
   * Keep secret references managed via GCP Secret Manager (`netbird-auth-secret`, `netbird-store-encryption-key`, `netbird-proxy-token`, `cloudflare-api-token`).
