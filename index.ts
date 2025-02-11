import * as pulumi from "@pulumi/pulumi"
import * as aws from "@pulumi/aws"

import { Vpc } from "./lib/Vpc"
import { PingInstance } from "./lib/PingInstance"
import { EncryptedBucket } from "./lib/EncryptedBucket"
import { AuroraPostgres } from "./lib/AuroraPostgres"


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

  // Get the VPC CIDR from config
  const vpcCidr: string = config.require("vpcCidr")

  // Get the current AWS region
  const region = await aws.getRegion().then(region => region.name)

  // Reference bootstrapping stack
  const openVpnStack = new pulumi.StackReference(config.require("openVpnStack"))


  // Get the peering info
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
    cidr: vpcCidr,
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

  const privateAppSubnetId = vpc.privateSubnetIds.apply(ids => ids[0])
  const isolatedDataSubnetId = vpc.isolatedSubnetIds.apply(ids => ids[1])



  // Get the ping instance config
  const pingAmiId = openVpnStack.getOutput("pingAmiId")
  const pingIamRole = openVpnStack.getOutput("pingIamRole")

  // Create main ping instances
  const privateAppPing = new PingInstance("ping-private-app",{
    // Context
    namespace,
    environment,
    name: [name,"ping","private","app"].join("-"),

    // Networking
    vpcId: vpc.vpcId,
    subnetId: privateAppSubnetId,

    // Instance config
    amiId: pingAmiId,

    // IAM permissions
    instanceProfile: pingIamRole,
  })

  const privateDataPing = new PingInstance("ping-isolated-data",{
    // Context
    namespace,
    environment,
    name: [name,"ping","isolated","data"].join("-"),

    // Networking
    vpcId: vpc.vpcId,
    subnetId: isolatedDataSubnetId,

    // Instance config
    amiId: pingAmiId,

    // IAM permissions
    instanceProfile: pingIamRole,
  })


  // S3 Bucket
  const s3Bucket = new EncryptedBucket("encrypted-bucket",{
    namespace,
    environment,
    name,

    vpceId: vpc.s3EndpointId,
  })


  // RDS Cluster
  const db = new AuroraPostgres("postgres",{
    namespace,
    environment,
    name,

    dbInstanceClass: "db.t4g.medium",
    version: "16.4",

    vpcId: vpc.vpcId,
    vpcCidr: vpcCidr,
    subnetIds: vpc.isolatedSubnetIds
  },
  {
    parent: this
  })


  // Set outputs
  return {
    // VPC
    vpcId: vpc.vpcId,
    vpcCidr: vpcCidr,
    publicSubnetIds: vpc.publicSubnetIds,
    privateSubnetIds: vpc.privateSubnetIds,
    isolatedSubnetIds: vpc.isolatedSubnetIds,

    // S3 Bucket
    bucketName: s3Bucket.bucketName,
    bucketArn: s3Bucket.bucketArn,

    // Database credentials
    dbClusterName: db.clusterName,
    dbClusterPort: db.clusterPort,
    dbClusterEndpoint: db.clusterEndpoint,
    dbAdminUser: db.adminUser,
    dbAdminPassword: db.adminPassword,

  }
}
