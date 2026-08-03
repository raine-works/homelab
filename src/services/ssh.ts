import type * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { staticPublicIp } from "../network";

/**
 * VPS SSH Key Pair & Remote Connection Config
 *
 * Generates an RSA key pair managed securely in Pulumi state,
 * injecting the public key into the VPS instance metadata and using the
 * private key for remote SSH execution of docker-compose files.
 */
export const sshKey = new tls.PrivateKey("vps-ssh-key", {
  algorithm: "RSA",
  rsaBits: 4096,
});

export const sshUser = "ubuntu";

export const sshConnection: command.types.input.remote.ConnectionArgs = {
  host: staticPublicIp.address,
  user: sshUser,
  privateKey: sshKey.privateKeyPem,
  dialErrorLimit: 40,
};

export const getSshConnection = (
  instanceId: pulumi.Input<string>
): command.types.input.remote.ConnectionArgs => ({
  host: pulumi.output(instanceId).apply(() => staticPublicIp.address),
  user: sshUser,
  privateKey: sshKey.privateKeyPem,
  dialErrorLimit: 40,
});
