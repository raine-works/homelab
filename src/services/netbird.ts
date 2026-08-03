import * as path from "node:path";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { netbirdDomain, project } from "../config";
import { netbirdAuthSecret, netbirdStoreEncryptionKey } from "../secrets";
import { vpsInstance } from "../vps";
import { vpsInit } from "./init";
import { getSshConnection } from "./ssh";

/**
 * NetBird VPN Mesh & Controller Service
 *
 * Synchronizes the services/netbird directory containing docker-compose.yaml
 * and dynamic.yaml over SSH, populates config.yaml using secret values
 * managed in GCP Secret Manager, generates a reverse proxy registration token,
 * then executes `docker compose up -d`.
 */
const netbirdServiceDir = path.resolve(__dirname, "../../services/netbird");

export const netbirdArchive = new pulumi.asset.FileArchive(netbirdServiceDir);

export const netbirdCopy = new command.remote.CopyToRemote(
  "netbird-copy-v1",
  {
    connection: getSshConnection(vpsInstance.id),
    source: netbirdArchive,
    remotePath: "/opt/homelab/services",
    triggers: [
      vpsInstance.id,
      netbirdArchive,
      netbirdAuthSecret.secretData,
      netbirdStoreEncryptionKey.secretData,
    ],
  },
  { dependsOn: [vpsInit] }
);

const generateConfigScript = (authSecret = "", storeEncryptionKey = ""): string => `
  cat << 'EOF' > /opt/homelab/services/netbird/config.yaml
server:
  listenAddress: ":80"
  exposedAddress: "https://${netbirdDomain}:443"
  stunPorts:
    - 3478
  metricsPort: 9090
  healthcheckAddress: ":9000"
  logLevel: "info"
  logFile: "console"

  authSecret: "${authSecret}"
  dataDir: "/var/lib/netbird"

  auth:
    issuer: "https://${netbirdDomain}/oauth2"
    audience: "netbird-dashboard"
    userIDClaim: "sub"
    idpSignKeyRefreshEnabled: true
    dashboardRedirectURIs:
      - "https://${netbirdDomain}/nb-auth"
      - "https://${netbirdDomain}/nb-silent-auth"
    cliRedirectURIs:
      - "http://localhost:53000/"

  reverseProxy:
    trustedHTTPProxies:
      - "0.0.0.0/0"

  store:
    engine: "sqlite"
    encryptionKey: "${storeEncryptionKey}"
EOF
`;

const setupProxyTokenAndUpScript = `
  cd /opt/homelab/services/netbird
  docker compose up -d netbird-server crowdsec
  MAX_RETRIES=20
  RETRY_COUNT=0
  while ! docker exec netbird-server /go/bin/netbird-server admin token list -c /etc/netbird/config.yaml &> /dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
      echo "ERROR: Timed out waiting for NetBird server to become ready (20 retries)."
      echo "=== NetBird Container Logs ==="
      docker compose logs netbird-server || true
      exit 1
    fi
    echo "Waiting for NetBird server to become ready ($RETRY_COUNT/$MAX_RETRIES)..."
    sleep 3
  done
  if [ ! -f /opt/homelab/services/netbird/.env ] || grep -q "nbx_placeholder_initial_token" /opt/homelab/services/netbird/.env || ! grep -q "NETBIRD_SETUP_KEY=" /opt/homelab/services/netbird/.env; then
    NEW_TOKEN=$(docker exec netbird-server /go/bin/netbird-server admin token create -c /etc/netbird/config.yaml --name homelab-vps-proxy | grep "Token:" | awk '{print $2}')
    if [ -n "\${NEW_TOKEN}" ]; then
      echo "NETBIRD_SETUP_KEY=\${NEW_TOKEN}" > /opt/homelab/services/netbird/.env
      echo "NB_PROXY_TOKEN=\${NEW_TOKEN}" >> /opt/homelab/services/netbird/.env
    fi
  fi
  if ! grep -q "NB_PROXY_CROWDSEC_API_KEY=" /opt/homelab/services/netbird/.env 2>/dev/null; then
    docker exec netbird-crowdsec cscli bouncers delete netbird-proxy-bouncer 2>/dev/null || true
    CS_KEY=$(docker exec netbird-crowdsec cscli bouncers add netbird-proxy-bouncer 2>/dev/null | grep -A 2 "API key for" | tail -n 1 | tr -d ' ' || echo "")
    if [ -n "\${CS_KEY}" ]; then
      echo "NB_PROXY_CROWDSEC_API_KEY=\${CS_KEY}" >> /opt/homelab/services/netbird/.env
    fi
  fi
  TOKEN_VAL=$(grep "NETBIRD_SETUP_KEY=" /opt/homelab/services/netbird/.env | cut -d'=' -f2 || echo "")
  if [ -n "\${TOKEN_VAL}" ] && [ "\${TOKEN_VAL}" != "nbx_placeholder_initial_token" ]; then
    GCP_TOKEN=$(curl -s --max-time 10 -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" | jq -r .access_token || echo "")
    if [ -n "\${GCP_TOKEN}" ]; then
      B64_TOKEN=$(echo -n "\${TOKEN_VAL}" | base64 | tr -d '\n')
      curl -s -X POST -H "Authorization: Bearer \${GCP_TOKEN}" -H "Content-Type: application/json" \
        -d "{\\"payload\\": {\\"data\\": \\"\${B64_TOKEN}\\"}}" \
        "https://secretmanager.googleapis.com/v1/projects/${project}/secrets/netbird-proxy-token:addVersion" > /dev/null || true
    fi
  fi
  docker compose up -d
  docker compose restart netbird-proxy
`;

export const netbirdService = new command.remote.Command(
  "netbird-compose-service",
  {
    connection: getSshConnection(vpsInstance.id),
    create: pulumi.all([netbirdAuthSecret.secretData, netbirdStoreEncryptionKey.secretData]).apply(
      ([authSecret, storeEncryptionKey]) => `
          MAX_RETRIES=20
          RETRY_COUNT=0
          while ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; do
            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
              echo "ERROR: Timed out waiting for Docker Engine and Docker Compose plugin."
              exit 1
            fi
            echo "Waiting for Docker and Docker Compose plugin ($RETRY_COUNT/$MAX_RETRIES)..."
            sleep 3
          done
          ${generateConfigScript(authSecret, storeEncryptionKey)}
          ${setupProxyTokenAndUpScript}
        `
    ),
    update: pulumi.all([netbirdAuthSecret.secretData, netbirdStoreEncryptionKey.secretData]).apply(
      ([authSecret, storeEncryptionKey]) => `
          ${generateConfigScript(authSecret, storeEncryptionKey)}
          ${setupProxyTokenAndUpScript}
        `
    ),
    delete: "true",
    triggers: [
      vpsInstance.id,
      netbirdCopy.id,
      netbirdAuthSecret.secretData,
      netbirdStoreEncryptionKey.secretData,
    ],
  },
  { dependsOn: [netbirdCopy] }
);
