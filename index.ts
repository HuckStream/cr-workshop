import * as pulumi from "@pulumi/pulumi"
import * as aws from "@pulumi/aws"

import { Vpc } from "./lib/Vpc"

// Main entrypoint
export = async () => {

  // Assemble resource name from context pieces
  const config = new pulumi.Config()
  const namespace: string = config.require("namespace")
  const environment: string = config.require("environment")
  const name: string = config.require("name")
  const baseName: string = [
    namespace,
    environment,
    name,
  ].join("-")

  // Get the current AWS region
  const region = await aws.getRegion().then(region => region.name)

  // Get the peering info
  const openVpnStack = new pulumi.StackReference(config.require("openVpnStack"))
  const openVpnVpcId = openVpnStack.getOutput("vpcId")
  const openVpnVpcCidr = openVpnStack.getOutput("vpcCidr")
  // Need to cast from Output<any> to Output<RouteTable[]>
  const openVpnVpcRtbls = openVpnStack.getOutput("privateRouteTables").apply(rtbls => {
    return rtbls as aws.ec2.RouteTable[]
  })

  // Create VPC
  const vpc = new Vpc("vpc",{
    // Context info
    namespace,
    environment,
    name,

    // Networking configurations
    cidr: "10.129.0.0/16",
    privateAppSubnets: true,
    isolatedDataSubnets: true,

    // OpenVPN VPC for peering configuration
    openVpnVpcId,
    openVpnVpcCidr,
    openVpnVpcRtbls,

    // VPC interface endpoint configuration
    // AWS region (convenince for interface endpoint definitions)
    region,

    // See https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-privatelink-support.html for supported services
    interfaceEndpoints: [
      "kms",
      "lambda",
      "logs",
      "rds",
      "sts",
      "ec2messages",
      "ssm",
      "ssmmessages",
    ]
  })

  return {
    vpcRouteTables: vpc.routeTables,
    openVpnVpcId
  }
}
