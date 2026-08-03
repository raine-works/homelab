/**
 * Host OS Startup Script Generator
 *
 * Generates the cloud-init bash script executed by Compute Engine VM on first boot.
 * Responsibilities:
 * 1. Installs system dependencies (curl, git, htop, etc.).
 * 2. Formats and mounts dedicated GCP persistent disk (`google-homelab-data`) to `/opt/homelab`.
 * 3. Configures Docker Engine data-root to `/opt/homelab/docker` for 100% database persistence.
 * 4. Configures a 2GB swapfile to prevent memory exhaustion.
 * 5. Installs and enables Docker Engine & Docker Compose plugin.
 * 6. Adds `ubuntu` user to the `docker` group for SSH-based remote Docker management.
 * 7. Prepares `/dev/net/tun` for NetBird WireGuard VPN interface.
 * 8. Disables host UFW to rely exclusively on GCP VPC Firewall rules.
 *
 * @returns Bash startup script string
 */
export const getStartupScript = (): string => {
  return `#!/bin/bash
set -euo pipefail

# Prevent non-interactive apt prompt blocks & wait for apt locks
export DEBIAN_FRONTEND=noninteractive
APT_ARGS="-o DPkg::Lock::Timeout=300"

# Log execution
exec > >(tee -a /var/log/homelab-startup.log) 2>&1
echo "=== Starting Homelab VPS Host Setup ==="

# Update system & install prerequisites
apt-get $APT_ARGS update -y
apt-get $APT_ARGS install -y \\
    ca-certificates \\
    curl \\
    gnupg \\
    lsb-release \\
    jq \\
    git \\
    htop \\
    sqlite3

# Ensure UFW is disabled so GCP VPC Firewall is authoritative
systemctl stop ufw || true
systemctl disable ufw || true

# Format and mount dedicated persistent data disk to /opt/homelab
DATA_DISK="/dev/disk/by-id/google-homelab-data"
for i in {1..30}; do
    if [ -b "$DATA_DISK" ]; then
        break
    fi
    echo "Waiting for persistent data disk $DATA_DISK ($i/30)..."
    sleep 1
done

if [ -b "$DATA_DISK" ]; then
    echo "Configuring dedicated persistent data disk ($DATA_DISK)..."
    if ! blkid "$DATA_DISK" &> /dev/null; then
        echo "Formatting new persistent data disk with ext4..."
        mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard "$DATA_DISK"
    fi

    mkdir -p /opt/homelab
    if ! mountpoint -q /opt/homelab; then
        mount -o discard,defaults "$DATA_DISK" /opt/homelab
    fi

    if ! grep -q "google-homelab-data" /etc/fstab; then
        echo '/dev/disk/by-id/google-homelab-data /opt/homelab ext4 discard,defaults,nofail 0 2' >> /etc/fstab
    fi
else
    echo "ERROR: Persistent data disk $DATA_DISK not found after waiting."
fi

# Setup 2GB Swap space if not present
if [ ! -f /swapfile ]; then
    echo "Configuring Swap Space..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Ensure /dev/net/tun exists for NetBird WireGuard VPN
mkdir -p /dev/net
if [ ! -c /dev/net/tun ]; then
    mknod /dev/net/tun c 10 200
    chmod 0666 /dev/net/tun
fi

# Configure Docker data-root to use persistent disk volume (/opt/homelab/docker)
mkdir -p /etc/docker /opt/homelab/docker
if [ ! -f /etc/docker/daemon.json ]; then
    cat << 'EOF' > /etc/docker/daemon.json
{
  "data-root": "/opt/homelab/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
fi

# Install Docker Engine
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \\
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \\
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get $APT_ARGS update -y
    apt-get $APT_ARGS install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    systemctl start docker
fi

# Grant ubuntu user access to Docker socket for SSH remote provider management
usermod -aG docker ubuntu || true
chmod 666 /var/run/docker.sock || true

# Prepare deployment directory for Pulumi SSH docker-compose services
mkdir -p /opt/homelab/services /etc/crowdsec /opt/homelab/scripts
chown -R ubuntu:ubuntu /opt/homelab

# Pre-create Docker network
docker network create homelab-netbird-net || true

# Automatically start all Docker Compose services on host boot
for service_dir in /opt/homelab/services/*; do
  if [ -d "$service_dir" ] && [ -f "$service_dir/docker-compose.yaml" ]; then
    echo "Auto-starting service in $service_dir..."
    (cd "$service_dir" && docker compose up -d) || true
  fi
done

echo "=== Homelab Host Setup Completed Successfully ==="
`;
};
