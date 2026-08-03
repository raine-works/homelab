import * as pulumi from "@pulumi/pulumi";
import { netbirdDomain, project, region, zone } from "./config";
import { staticPublicIp, vpcNetwork, vpcSubnet } from "./network";
import { netbirdAuthSecret, netbirdProxyTokenSecret, netbirdStoreEncryptionKey } from "./secrets";
import { netbirdService, sshKey, watchtowerService } from "./services";
import { dataDisk, dataDiskSnapshotPolicy, vpsInstance } from "./vps";

/**
 * Homelab Main Pulumi Infrastructure Entrypoint
 *
 * Exports primary stack outputs including network metadata, public NetBird endpoint,
 * VM SSH helper command, and internal service status objects.
 */

// -------------------------------------------------------------
// GCP Infrastructure Outputs
// -------------------------------------------------------------

/** Target GCP Project ID (`homelab-497021`) */
export const gcpProject = project;

/** Target GCP Region for infrastructure deployment (`us-west3`) */
export const gcpRegion = region;

/** Target GCP Availability Zone (`us-west3-a`) */
export const gcpZone = zone;

/** GCP VPC Network Resource Name */
export const networkName = vpcNetwork.name;

/** GCP VPC Subnetwork Resource Name */
export const subnetName = vpcSubnet.name;

/** Single Public Entrypoint Endpoint configuration (`netbird.raineworks.com`) */
export const publicEndpoint = {
  domain: netbirdDomain,
  staticIp: staticPublicIp.address,
  url: `https://${netbirdDomain}`,
};

/** Primary Homelab VPS Instance Name */
export const vmInstanceName = vpsInstance.name;

/** Dedicated GCP Persistent Data Disk Resource */
export const persistentDataDisk = {
  name: dataDisk.name,
  sizeGb: dataDisk.size,
  snapshotPolicyName: dataDiskSnapshotPolicy.name,
};

/** Helper command for administrative SSH connection via gcloud CLI */
export const sshCommand = pulumi.interpolate`gcloud compute ssh ${vpsInstance.name} --zone ${zone} --project ${project}`;

/** Managed SSH Private Key for remote VPS service orchestration (Secret) */
export const sshPrivateKey = pulumi.secret(sshKey.privateKeyPem);

// -------------------------------------------------------------
// GCP Secret Manager References
// -------------------------------------------------------------

/** GCP Secret Manager Secret References */
export const gcpSecrets = {
  netbirdAuthSecret: netbirdAuthSecret.secret,
  netbirdStoreEncryptionKey: netbirdStoreEncryptionKey.secret,
  netbirdProxyTokenSecret: netbirdProxyTokenSecret.secret,
};

// -------------------------------------------------------------
// NetBird Authenticated Services (Managed via Docker Compose SSH)
// -------------------------------------------------------------

/** Summary of NetBird & Watchtower services managed via Docker Compose SSH */
export const services = {
  netbirdController: {
    status: netbirdService.stdout,
    publicDomain: netbirdDomain,
    url: `https://${netbirdDomain}`,
  },
  watchtower: {
    status: watchtowerService.stdout,
  },
};

// -------------------------------------------------------------
// Cloudflare DNS Resources (Optional)
// -------------------------------------------------------------

import { cloudflareZone, netbirdDnsRecord, netbirdWildcardDnsRecord } from "./dns";

/** Managed Cloudflare DNS Records */
export const dnsRecords = {
  zoneId: cloudflareZone.zoneId,
  netbirdARecord: {
    id: netbirdDnsRecord.id,
    name: netbirdDnsRecord.name,
    type: netbirdDnsRecord.type,
    content: netbirdDnsRecord.content,
  },
  netbirdWildcardCnameRecord: {
    id: netbirdWildcardDnsRecord.id,
    name: netbirdWildcardDnsRecord.name,
    type: netbirdWildcardDnsRecord.type,
    content: netbirdWildcardDnsRecord.content,
  },
};
