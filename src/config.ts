import * as pulumi from "@pulumi/pulumi";

/**
 * Homelab Global Configuration Module
 *
 * Manages configuration variables retrieved from Pulumi stack configs (`Pulumi.prod.yaml`)
 * and environment settings for GCP project, region, zone, VM sizing, and NetBird settings.
 */

const config = new pulumi.Config("homelab");
const gcpConfig = new pulumi.Config("gcp");

/** GCP Project ID (`homelab-497021`) */
export const project = gcpConfig.require("project");

/** Target GCP Region - Defaults to `us-west3` */
export const region = gcpConfig.get("region") || "us-west3";

/** Target GCP Zone - Defaults to `us-west3-a` */
export const zone = gcpConfig.get("zone") || "us-west3-a";

/** Compute Engine VM Machine Type for Primary VPS (`e2-small` or `e2-medium`) */
export const instanceType = config.get("instanceType") || "e2-small";

/** Compute Engine Data Disk Size in GB */
export const diskSizeGb = config.getNumber("diskSizeGb") || 50;

/** NetBird Public Domain (`netbird.raineworks.com`) */
export const netbirdDomain = config.get("netbirdDomain") || "netbird.raineworks.com";

/** GCS Backend Bucket Name (`raineworks_homelab_pulumi_backend`) */
export const backendBucketName =
  config.get("backendBucketName") || "raineworks_homelab_pulumi_backend";

/** NetBird Management Server URL (`https://netbird.raineworks.com`) */
export const netbirdManagementUrl =
  config.get("netbirdManagementUrl") || `https://${netbirdDomain}`;

/**
 * Pinned subnet for the `homelab-netbird-net` Docker network.
 * Required so `netbird-traefik` (the bundled reverse proxy in front of netbird-server)
 * can be given a static IP, which NetBird's `reverseProxy.trustedHTTPProxies` /
 * `trustedPeers` config needs to trust real client IPs instead of a wildcard.
 * See: https://docs.netbird.io/selfhosted/maintenance/upgrade#migration-notes
 */
export const netbirdNetSubnet = "172.30.0.0/24";

/** Static IP assigned to `netbird-traefik` within `homelab-netbird-net`. */
export const netbirdTraefikStaticIp = "172.30.0.10";
