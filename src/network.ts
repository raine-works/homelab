import * as gcp from "@pulumi/gcp";
import { netbirdDomain, region } from "./config";

/**
 * Homelab Network & Firewall Module
 *
 * Defines the custom GCP VPC network, subnetwork, static public IP, and firewall security
 * rules for the homelab NetBird controller VPS instance.
 */

/** Custom VPC Network for Homelab infrastructure */
export const vpcNetwork = new gcp.compute.Network("homelab-vpc", {
  autoCreateSubnetworks: false,
  description: "Homelab custom VPC network for NetBird VPN controller and relay",
});

/** Subnetwork provisioned in us-west3 (10.0.1.0/24) */
export const vpcSubnet = new gcp.compute.Subnetwork("homelab-subnet", {
  network: vpcNetwork.id,
  ipCidrRange: "10.0.1.0/24",
  region: region,
});

/** Static Public External IP Address reserved for netbird.raineworks.com */
export const staticPublicIp = new gcp.compute.Address("vps-static-ip", {
  region: region,
  description: `Static Public IP for ${netbirdDomain}`,
});

/**
 * Public Firewall Rule: NetBird VPN & Controller Services
 *
 * Allows public internet access ONLY for NetBird controller/VPN services:
 * - TCP 80, 443 (HTTP/HTTPS for Web & API)
 * - TCP 33073 (NetBird Signal Exchange)
 * - UDP 3478 (STUN/TURN)
 * - UDP 51820 (WireGuard VPN Tunnels)
 */
export const netbirdPublicFirewall = new gcp.compute.Firewall("allow-netbird-public", {
  network: vpcNetwork.id,
  description: `Public ingress for ${netbirdDomain} (Web, Signal, STUN, WireGuard)`,
  allows: [
    {
      protocol: "tcp",
      ports: ["80", "443", "33073"],
    },
    {
      protocol: "udp",
      ports: ["3478", "51820"],
    },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["homelab-vps"],
});

/** SSH Access Firewall Rule */
export const sshFirewall = new gcp.compute.Firewall("allow-ssh", {
  network: vpcNetwork.id,
  description: "SSH Access for administrative management",
  allows: [
    {
      protocol: "tcp",
      ports: ["22"],
    },
  ],
  sourceRanges: ["0.0.0.0/0"],
  targetTags: ["homelab-vps"],
});

/**
 * Internal NetBird Mesh & VPC Network Firewall Rule
 *
 * Grants full network access strictly to internal VPC subnetwork (10.0.1.0/24)
 * and authenticated NetBird mesh users (100.64.0.0/10).
 */
export const netbirdInternalMeshFirewall = new gcp.compute.Firewall("allow-netbird-internal-mesh", {
  network: vpcNetwork.id,
  description: "Allow full access for authenticated NetBird mesh users and internal subnets",
  allows: [
    {
      protocol: "all",
    },
  ],
  sourceRanges: ["100.64.0.0/10", "10.0.1.0/24"],
  targetTags: ["homelab-vps"],
});
