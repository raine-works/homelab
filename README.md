# Homelab Infrastructure

Zero-Trust Mesh VPN Controller (**NetBird**) and container auto-updater (**Watchtower**) managed via **Bun**, **TypeScript**, and **Pulumi** on **Google Cloud Platform (GCP)**.

> **Zero-Trust Network Architecture**: `netbird.raineworks.com` is the **only** public entry point on the cloud VPS. The GCP VPS acts as the central VPN Mesh Controller & Relay. All internal homelab services (Home Assistant, Media, Proxmox, storage, etc.) run locally on your own hardware and are accessed via encrypted NetBird WireGuard tunnels with Subnet Routing.

---

## Technical Overview

- **GCP Region**: `us-west3` (Salt Lake City, Utah Datacenter)
- **GCP Project ID**: `homelab-497021`
- **State Backend**: Google Cloud Storage (`gs://raineworks_homelab_pulumi_backend`)
- **Public Entrypoint**: `netbird.raineworks.com`
- **Services Management**: NetBird and Watchtower organized under `services/` and deployed over SSH using `@pulumi/command`.
- **Single Stack**: `prod`

---

## Architecture

```
                         Public Internet
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │    netbird.raineworks.com   │
                 │   GCP Static IP (us-west3)  │
                 └──────────────┬──────────────┘
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │   Homelab VPS (Ubuntu 22.04)│
                 │   GCP Project: homelab-497021│
                 │  Mounted Disk: /opt/homelab │
                 └──────────────┬──────────────┘
                                │
                    Pulumi SSH Docker Compose
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
┌─────────────────────────────┐               ┌─────────────────┐
│       NetBird Suite         │               │   Watchtower    │
│ • NetBird Server (Management)│               │ (Auto-updates   │
│ • Signal Exchange           │               │  NetBird stack) │
│ • Dashboard UI              │               └─────────────────┘
│ • Traefik Reverse Proxy     │
│ • CrowdSec IDS              │
└──────────────┬──────────────┘
               │
     Authenticated NetBird Mesh VPN (100.64.0.0/10)
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     On-Premises Homelab                         │
│                                                                 │
│   ┌───────────────────────────┐                                 │
│   │ NetBird Subnet Routing    │                                 │
│   │ Node (192.168.1.50)       │                                 │
│   └─────────────┬─────────────┘                                 │
│                 │ (Advertises 192.168.1.0/24)                   │
│                 ▼                                               │
│   ┌───────────────────────────┬─────────────────────────────┐   │
│   │ Local Services            │ Media & Storage Services    │   │
│   │ • Home Assistant          │ • NAS / Samba               │   │
│   │ • Proxmox / Hypervisors   │ • Docker Swarm / K8s        │   │
│   └───────────────────────────┴─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup & Deployment

### 1. Prerequisites
Ensure you have the following installed on your machine:
- [Bun](https://bun.sh/) (`v1.3+`)
- [gcloud CLI](https://cloud.google.com/sdk/gcloud)
- [Pulumi CLI](https://www.pulumi.com/)

### 2. Install Dependencies & Authenticate GCP
```bash
# Install dependencies
bun install

# Authenticate with Google Cloud Application Default Credentials (ADC)
bun run auth:adc
```

### 3. Login to Pulumi GCS Backend
```bash
bun run pulumi:login
```

### 4. Create Secrets in GCP Secret Manager
Before initializing the stack, create your required secrets in GCP project `homelab-497021`:

```bash
# Set project
gcloud config set project homelab-497021

# Create NetBird Auth Secret
AUTH_SECRET=$(openssl rand -base64 32)
gcloud secrets create netbird-auth-secret --replication-policy="automatic"
echo -n "$AUTH_SECRET" | gcloud secrets versions add netbird-auth-secret --data-file=-

# Create NetBird Store Encryption Key
STORE_KEY=$(openssl rand -base64 32)
gcloud secrets create netbird-store-encryption-key --replication-policy="automatic"
echo -n "$STORE_KEY" | gcloud secrets versions add netbird-store-encryption-key --data-file=-

# Create NetBird Proxy Token Placeholder
gcloud secrets create netbird-proxy-token --replication-policy="automatic"
echo -n "nbx_placeholder_initial_token" | gcloud secrets versions add netbird-proxy-token --data-file=-

# (Optional) Create Cloudflare API Token for DNS automation
gcloud secrets create cloudflare-api-token --replication-policy="automatic"
echo -n "YOUR_CLOUDFLARE_API_TOKEN" | gcloud secrets versions add cloudflare-api-token --data-file=-
```

### 5. Deploy Infrastructure & Services
```bash
# Preview changes before applying
bun run pulumi:preview

# Deploy VPC, VPS, Persistent Disk, and apply docker-compose services via SSH
bun run pulumi:up
```

---

## Connecting Homelab Hardware via Subnet Routing

1. Open your NetBird Dashboard at `https://netbird.raineworks.com`.
2. Go to **Setup Keys** -> **Create Setup Key**.
3. On a local homelab Linux host (e.g. Raspberry Pi / VM):
   ```bash
   curl -fsSL https://pkgs.netbird.io/install.sh | sh
   sudo netbird up --management-url https://netbird.raineworks.com --setup-key <SETUP_KEY>
   ```
4. Enable IP forwarding on your homelab node:
   ```bash
   echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.d/99-netbird.conf
   sudo sysctl -p /etc/sysctl.d/99-netbird.conf
   ```
5. In NetBird Dashboard, go to **Network Routes** -> **Add Route** for your home subnet (`192.168.1.0/24`).

---

## Development Scripts & Quality Checks

```bash
bun run format      # Format codebase using Biome
bun run lint        # Lint codebase using Biome
bun run typecheck   # Typecheck TypeScript files using tsc
```
