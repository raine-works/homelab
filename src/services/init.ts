import * as command from "@pulumi/command";
import { netbirdNetSubnet } from "../config";
import { vpsInstance } from "../vps";
import { getSshConnection } from "./ssh";

/**
 * VPS Homelab Directory Initialization & Host Provisioning Resource
 *
 * Ensures `/opt/homelab/services` exists, guarantees that Docker Engine,
 * Docker Compose plugin, and prerequisite packages (sqlite3, curl, jq) are installed
 * over SSH, and pre-creates the `homelab-netbird-net` Docker network (pinned to
 * `netbirdNetSubnet`) before service containers start.
 */
const vpsInitScript = `
      export DEBIAN_FRONTEND=noninteractive
      APT_ARGS="-o DPkg::Lock::Timeout=300"

      # Guarantee persistent data disk (/dev/disk/by-id/google-homelab-data) is mounted to /opt/homelab
      DATA_DISK="/dev/disk/by-id/google-homelab-data"
      MAX_WAIT=30
      WAIT_COUNT=0
      while ! mountpoint -q /opt/homelab; do
        WAIT_COUNT=$((WAIT_COUNT + 1))
        if [ "$WAIT_COUNT" -ge "$MAX_WAIT" ]; then
          echo "Attempting emergency manual mount of $DATA_DISK to /opt/homelab..."
          sudo mkdir -p /opt/homelab
          sudo mount -o discard,defaults "$DATA_DISK" /opt/homelab || true
          break
        fi
        echo "Waiting for persistent data disk mount on /opt/homelab ($WAIT_COUNT/$MAX_WAIT)..."
        sleep 2
      done

      sudo mkdir -p /opt/homelab/services /etc/crowdsec /opt/homelab/scripts
      sudo chown -R ubuntu:ubuntu /opt/homelab

      if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        echo "Installing Docker Engine and Docker Compose plugin over SSH..."
        sudo apt-get $APT_ARGS update -y
        sudo apt-get $APT_ARGS install -y ca-certificates curl gnupg lsb-release jq git htop sqlite3 gzip
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg || true
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        sudo apt-get $APT_ARGS update -y
        sudo apt-get $APT_ARGS install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        sudo systemctl enable docker
        sudo systemctl start docker
        sudo usermod -aG docker ubuntu || true
        sudo chmod 666 /var/run/docker.sock || true
      fi

      # Clean stale container runtime metadata from previous VM instances while Docker is stopped
      sudo systemctl stop docker || true
      sudo rm -rf /opt/homelab/docker/containers/* || true
      sudo systemctl start docker || true

      # Pin homelab-netbird-net to a fixed subnet so netbird-traefik can be given a
      # static IP (required for NetBird's reverseProxy.trustedHTTPProxies/trustedPeers
      # to trust real client IPs instead of 0.0.0.0/0). If the network already exists
      # with a different (or no pinned) subnet, tear it down and recreate it - this
      # requires briefly stopping every service attached to it.
      CURRENT_NETBIRD_SUBNET=$(sudo docker network inspect homelab-netbird-net --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || echo "")
      if [ "$CURRENT_NETBIRD_SUBNET" != "${netbirdNetSubnet}" ]; then
        echo "Pinning homelab-netbird-net to subnet ${netbirdNetSubnet} (recreating network)..."
        for svc in netbird; do
          if [ -d "/opt/homelab/services/$svc" ]; then
            (cd "/opt/homelab/services/$svc" && sudo docker compose down) || true
          fi
        done
        sudo docker network rm homelab-netbird-net 2>/dev/null || true
        sudo docker network create --subnet "${netbirdNetSubnet}" homelab-netbird-net
        # Bring services stopped above back up immediately. Their own Pulumi command
        # resources only re-run when their own inputs change, so without this they'd
        # stay down until something unrelated to this migration happened to redeploy them.
        for svc in netbird; do
          if [ -d "/opt/homelab/services/$svc" ]; then
            (cd "/opt/homelab/services/$svc" && sudo docker compose up -d) || true
          fi
        done
      fi
    `;

export const vpsInit = new command.remote.Command(
  "vps-init",
  {
    connection: getSshConnection(vpsInstance.id),
    create: vpsInitScript,
    update: vpsInitScript,
    triggers: [vpsInstance.id, netbirdNetSubnet],
  },
  { dependsOn: [vpsInstance] }
);
