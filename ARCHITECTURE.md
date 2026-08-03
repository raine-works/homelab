# Homelab Architecture & Security Specification

This document details the architectural boundaries, security design, and network isolation models for the `homelab` project.

---

## 1. Zero-Trust Mesh VPN Model

* **Public Entrypoint**: `netbird.raineworks.com` is the only publicly reachable endpoint (Ports 80, 443, 33073 TCP & 3478, 51820 UDP).
* **Isolation**: No homelab services are exposed directly to the public internet. Homelab services are accessible exclusively over encrypted NetBird WireGuard tunnels (`100.64.0.0/10` mesh addresses or routed `192.168.x.x` subnets).
* **Controller Responsibilities**: The GCP VPS hosts the NetBird Management server, Signal Exchange, Dashboard UI, Traefik Reverse Proxy, and CrowdSec.

---

## 2. Persistence & Snapshot Policies

* **Data Disk**: 50 GB `pd-ssd` persistent disk (`homelab-data-disk`) mounted at `/opt/homelab`.
* **State Safety**: Configured with `protect: true` in Pulumi. Deleting or recreating the Compute Engine VM leaves the data disk completely intact.
* **Daily GCP Snapshots**: Managed via `gcp.compute.ResourcePolicy` running daily at 2:00 AM UTC with 14-day retention.

---

## 3. Container Auto-Updates

* **Watchtower**: Runs on the VPS host checking container registry tags every 3600 seconds (1 hour). Performs rolling updates of NetBird stack images cleanly.
