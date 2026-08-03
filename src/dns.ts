import * as cloudflare from "@pulumi/cloudflare";
import * as gcp from "@pulumi/gcp";
import { netbirdDomain, project } from "./config";
import { staticPublicIp } from "./network";

/**
 * Homelab Cloudflare DNS Infrastructure Module
 *
 * Manages Cloudflare DNS records for `netbird.raineworks.com` (A record) and `*.netbird.raineworks.com` (CNAME)
 * using an optional Cloudflare API Token stored in GCP Secret Manager (`cloudflare-api-token`).
 */

/**
 * Reference to optional GCP Secret Manager secret version for Cloudflare API Token.
 */
export const cloudflareApiTokenSecret = gcp.secretmanager.getSecretVersionOutput({
  secret: "cloudflare-api-token",
  project: project,
});

/**
 * Explicit Cloudflare Provider initialized with retrieved API token from Secret Manager.
 */
export const cloudflareProvider = new cloudflare.Provider("cloudflare-provider", {
  apiToken: cloudflareApiTokenSecret.secretData,
});

/**
 * Cloudflare DNS Zone lookup for `raineworks.com`.
 */
export const cloudflareZone = cloudflare.getZoneOutput(
  {
    filter: {
      name: "raineworks.com",
    },
  },
  { provider: cloudflareProvider }
);

/**
 * Cloudflare DNS A Record for `netbird.raineworks.com`
 * Points to the primary homelab VPS static public IP address.
 */
export const netbirdDnsRecord = new cloudflare.DnsRecord(
  "netbird-dns-record",
  {
    zoneId: cloudflareZone.zoneId,
    name: "netbird",
    type: "A",
    content: staticPublicIp.address,
    ttl: 1,
    proxied: false,
    comment: "NetBird VPN VPS Public IP A Record",
  },
  { provider: cloudflareProvider }
);

/**
 * Cloudflare DNS Wildcard CNAME Record for `*.netbird.raineworks.com`
 * Points nested subdomains (e.g. NetBird Agent Network exposed services) to `netbird.raineworks.com`.
 */
export const netbirdWildcardDnsRecord = new cloudflare.DnsRecord(
  "netbird-wildcard-dns-record",
  {
    zoneId: cloudflareZone.zoneId,
    name: "*.netbird",
    type: "CNAME",
    content: netbirdDomain,
    ttl: 1,
    proxied: false,
    comment: "Wildcard CNAME record pointing *.netbird.raineworks.com to netbird.raineworks.com",
  },
  { provider: cloudflareProvider }
);
