import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { diskSizeGb, instanceType, region, zone } from "./config";
import { staticPublicIp, vpcNetwork, vpcSubnet } from "./network";
import { sshKey, sshUser } from "./services/ssh";
import { getStartupScript } from "./startup-script";

/**
 * GCP Resource Policy for Automated Daily Persistent Disk Snapshots
 *
 * Configures Google Cloud to automatically capture daily incremental point-in-time
 * snapshots of the primary Homelab data disk at 2:00 AM UTC with a 14-day retention window.
 */
export const dataDiskSnapshotPolicy = new gcp.compute.ResourcePolicy(
  "homelab-data-disk-snapshot-policy",
  {
    name: "homelab-data-disk-snapshot-policy",
    region: region,
    snapshotSchedulePolicy: {
      schedule: {
        dailySchedule: {
          daysInCycle: 1,
          startTime: "02:00",
        },
      },
      retentionPolicy: {
        maxRetentionDays: 14,
        onSourceDiskDelete: "KEEP_AUTO_SNAPSHOTS",
      },
      snapshotProperties: {
        storageLocations: region,
      },
    },
  }
);

/**
 * Homelab Dedicated Persistent Data Disk Resource
 *
 * Provisions an independent 50 GB `pd-ssd` disk attached to the primary VPS instance.
 * Houses `/opt/homelab` containing all Docker container volumes, NetBird configuration files,
 * and SQLite database files (`store.db`).
 *
 * Configured with `protect: true` to ensure database data and configs remain
 * 100% intact across stack teardowns, rebuilds, and VM replacements.
 */
export const dataDisk = new gcp.compute.Disk(
  "homelab-data-disk",
  {
    name: "homelab-data-disk",
    zone: zone,
    size: diskSizeGb,
    type: "pd-ssd",
  },
  { protect: true }
);

/**
 * Attaches the automated daily snapshot schedule resource policy to `homelab-data-disk`.
 */
export const dataDiskPolicyAttachment = new gcp.compute.DiskResourcePolicyAttachment(
  "homelab-data-disk-snapshot-attachment",
  {
    disk: dataDisk.name,
    name: dataDiskSnapshotPolicy.name,
    zone: zone,
  }
);

/**
 * Homelab Compute Engine Instance Resource
 *
 * Provisions the Ubuntu 22.04 LTS VM instance attached to the custom VPC subnet,
 * static public IP (`netbird.raineworks.com`), and dedicated persistent data disk.
 */
export const vpsInstance = new gcp.compute.Instance(
  "homelab-vps",
  {
    name: "homelab-vps",
    zone: zone,
    machineType: instanceType,
    tags: ["homelab-vps"],

    bootDisk: {
      initializeParams: {
        image: "ubuntu-os-cloud/ubuntu-2204-lts",
        size: diskSizeGb,
        type: "pd-ssd",
      },
    },

    attachedDisks: [
      {
        source: dataDisk.id,
        deviceName: "homelab-data",
      },
    ],

    networkInterfaces: [
      {
        network: vpcNetwork.id,
        subnetwork: vpcSubnet.id,
        accessConfigs: [
          {
            natIp: staticPublicIp.address,
          },
        ],
      },
    ],

    metadata: {
      "ssh-keys": pulumi.interpolate`${sshUser}:${sshKey.publicKeyOpenssh}`,
    },

    metadataStartupScript: getStartupScript(),

    serviceAccount: {
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/logging.write",
        "https://www.googleapis.com/auth/monitoring.write",
      ],
    },
  },
  {
    ignoreChanges: ["metadataStartupScript", "metadata"],
  }
);
