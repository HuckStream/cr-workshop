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


  //////
  // Step 1
  //
  // Retrieve stack references and outputs for main VPC infrastructure deployment stack.
  //////

  /**

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

  */

  //////
  // Step 2
  //
  // Deploy isolated VPC to the current region, with endpoints for required services and peering to main VPC
  //
  // Also uncomment outputs labeled 'VPC Outputs' at the bottom
  //////

  /**

  // Create VPC
  const vpc = new Vpc("vpc", {
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

  */


  //////
  // Step 3
  //
  // Deploy ping instances to test network connectivity
  //////
  /**

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

  */


  //////
  // Step 4
  //
  // Deploy encrypted S3 bucket
  //
  // Also uncomment outputs labeled 'S3 Bucket Outputs' at the bottom
  //////
  /**

  // S3 Bucket
  const s3Bucket = new EncryptedBucket("encrypted-bucket",{
    namespace,
    environment,
    name,


    //////
    // Step 5
    //
    // Provide the S3 VPC gateway endpoint to lock the S3 bucket down to only the VPC
    //
    // Also uncomment outputs labeled 'S3 Bucket Outputs' at the bottom
    //////

    // vpceId: vpc.s3EndpointId,
  })

  */


  //////
  // Step 6
  //
  // Deploy Aurora Postgres DB Cluster
  //
  // Also uncomment outputs labeled 'RDS Outputs' at the bottom
  //////
  /**

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

  */


  // Set outputs
  return {
    //////
    // Step 2
    //
    // VPC Outputs
    //////
    /**

    vpcId: vpc.vpcId,
    vpcCidr: vpcCidr,
    publicSubnetIds: vpc.publicSubnetIds,
    privateSubnetIds: vpc.privateSubnetIds,
    isolatedSubnetIds: vpc.isolatedSubnetIds,

    */


    //////
    // Step 4
    //
    // S3 Bucket Outputs
    //////
    /**

    bucketName: s3Bucket.bucketName,
    bucketArn: s3Bucket.bucketArn,

    */


    //////
    // Step 4
    //
    // RDS Outputs
    //////
    /**

    dbClusterName: db.clusterName,
    dbClusterPort: db.clusterPort,
    dbClusterEndpoint: db.clusterEndpoint,
    dbAdminUser: db.adminUser,
    dbAdminPassword: db.adminPassword,

    */
  }
}
