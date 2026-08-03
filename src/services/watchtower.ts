import * as path from "node:path";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { vpsInstance } from "../vps";

import { netbirdService } from "./netbird";
import { getSshConnection } from "./ssh";

/**
 * Watchtower Container Auto-Update Daemon Service
 *
 * Synchronizes the services/watchtower directory containing docker-compose.yaml over SSH,
 * and executes `docker compose up -d` after NetBird is healthy.
 */
const watchtowerServiceDir = path.resolve(__dirname, "../../services/watchtower");

export const watchtowerArchive = new pulumi.asset.FileArchive(watchtowerServiceDir);

export const watchtowerCopy = new command.remote.CopyToRemote(
  "watchtower-copy-v1",
  {
    connection: getSshConnection(vpsInstance.id),
    source: watchtowerArchive,
    remotePath: "/opt/homelab/services",
    triggers: [vpsInstance.id, watchtowerArchive],
  },
  { dependsOn: [netbirdService] }
);

export const watchtowerService = new command.remote.Command(
  "watchtower-compose-service",
  {
    connection: getSshConnection(vpsInstance.id),
    create: `
      cd /opt/homelab/services/watchtower
      docker compose up -d
    `,
    update: `
      cd /opt/homelab/services/watchtower
      docker compose up -d
    `,
    delete: "true",
    triggers: [vpsInstance.id, watchtowerCopy.id],
  },
  { dependsOn: [watchtowerCopy] }
);
