import * as aws from "@pulumi/aws"
import * as awsx from "@pulumi/awsx"
import * as pulumi from "@pulumi/pulumi"

export interface VpcInputs {
  namespace: string
  environment: string
  name: string

  region: string,

  cidr: string

  openVpnVpcId?: pulumi.Input<string>
  openVpnVpcCidr?: pulumi.Input<string>
  openVpnVpcRtbls?: pulumi.Output<aws.ec2.RouteTable[]>

  publicSubnets?: boolean
  privateAppSubnets?: boolean
  privateDataSubnets?: boolean
  isolatedDataSubnets?: boolean

  interfaceEndpoints?: string[]
}

export class Vpc extends pulumi.ComponentResource {
  // Context inputs
  public readonly namespace: pulumi.Output<string>
  public readonly environment: pulumi.Output<string>
  public readonly name: pulumi.Output<string>

  protected baseName: string

  // VPC outputs
  public readonly vpcId: pulumi.Output<string>
  public readonly publicSubnetIds: pulumi.Output<string[]>
  public readonly privateSubnetIds: pulumi.Output<string[]>
  public readonly isolatedSubnetIds: pulumi.Output<string[]>
  public readonly routeTables: pulumi.Output<aws.ec2.RouteTable[]>
  public readonly privateRouteTables: pulumi.Output<aws.ec2.RouteTable[]>

  // Constructor
  constructor(name: string, args: VpcInputs, opts?: pulumi.ComponentResourceOptions) {
    super("huckstream:aws:vpc", name, args, opts)

    // Set context details
    this.namespace = pulumi.output(args.name)
    this.environment = pulumi.output(args.environment)
    this.name = pulumi.output(args.name)

    this.baseName = [
      args.namespace,
      args.environment,
      args.name,
    ].join("-")

    // Set tags
    const baseTags = {
      Namespace: args.namespace,
      Environment: args.environment,
      Name: this.baseName
    }

    // Create the subnet specs
    const subnetSpecs:awsx.types.input.ec2.SubnetSpecArgs[] = []

    if( args?.publicSubnets ) {
      const publicSubnets = {
        type: awsx.ec2.SubnetType.Public,
        name: "public"
      }
      subnetSpecs.push(publicSubnets)
    }

    if( args?.privateAppSubnets ) {
      const privateAppSubnets = {
        type: awsx.ec2.SubnetType.Private,
        name: "private-app",
        tags: {
          ...baseTags,
          PrivateSubnetType: "App"
        }
      }
      subnetSpecs.push(privateAppSubnets)
    }

    if( args?.privateDataSubnets ) {
      const privateDataSubnets = {
        type: awsx.ec2.SubnetType.Private,
        name: "private-data",
        tags: {
          ...baseTags,
          PrivateSubnetType: "Data"
        }
      }
      subnetSpecs.push(privateDataSubnets)
    }

    if( args?.isolatedDataSubnets ) {
      const isolatedDataSubnets = {
        type: awsx.ec2.SubnetType.Isolated,
        name: "isolated-data"
      }
      subnetSpecs.push(isolatedDataSubnets)
    }

    // Set NAT Gateway strategy
    const natGwStrategy = ( args.publicSubnets && (args.privateAppSubnets || args.privateDataSubnets) ) ?
                          awsx.ec2.NatGatewayStrategy.Single : awsx.ec2.NatGatewayStrategy.None

    // Create the VPC
    const vpc = new awsx.ec2.Vpc(this.baseName, {
      // IP Config
      cidrBlock: args.cidr,
      numberOfAvailabilityZones: 3,
      subnetSpecs,
      subnetStrategy: awsx.ec2.SubnetAllocationStrategy.Auto,

      // NAT Gateway config
      natGateways: {
        strategy: natGwStrategy
      },

      // DNS Config
      enableDnsHostnames: true,
      enableDnsSupport: true,

      // Tags
      tags: baseTags,
    },
    {
      parent: this
    })

    this.vpcId = vpc.vpcId
    this.publicSubnetIds = vpc.publicSubnetIds
    this.privateSubnetIds = vpc.privateSubnetIds
    this.isolatedSubnetIds = vpc.isolatedSubnetIds
    this.routeTables = vpc.routeTables
    this.privateRouteTables = vpc.routeTables.apply( rtbls =>
      pulumi.all(
        rtbls.map(rtbl =>
          rtbl.tags.apply(tags =>
            ({ rtbl, tags })
          )
        )
      ).apply(results =>
        results.filter(rtbl => rtbl.tags?.SubnetType === "Private")
               .map(result => result.rtbl)
      )
    )


    // Gateway Endpoints
    // DynamoDB
    const dynamodbEndpoint = new aws.ec2.VpcEndpoint("dynamodb", {
      vpcId: vpc.vpcId,
      serviceName: `com.amazonaws.${args.region}.dynamodb`,
      vpcEndpointType: "Gateway",
      routeTableIds: vpc.routeTables.apply(routeTables => routeTables.map(rtbl => rtbl.id)),
      tags: {
        ...baseTags,
        Name: [this.baseName,"dynamodb"].join("-")
      },
    },
    {
      parent: this
    })

    // S3
    const s3Endpoint = new aws.ec2.VpcEndpoint("s3", {
      vpcId: vpc.vpcId,
      serviceName: `com.amazonaws.${args.region}.s3`,
      vpcEndpointType: "Gateway",
      routeTableIds: vpc.routeTables.apply(routeTables => routeTables.map(rtbl => rtbl.id)),
      tags: {
        ...baseTags,
        Name: [this.baseName,"s3"].join("-")
      },
    },
    {
      parent: this
    })

    // Interface Endpoints
    // Security group
    const vpceSgName = [this.baseName,"vpce","sg"].join("-")
    const vpceSg = new aws.ec2.SecurityGroup("vpce-security-group", {
      name: vpceSgName,
      vpcId: this.vpcId,
      description: "Allow local traffic",
      ingress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          // cidrBlocks: [args.cidr],
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          // cidrBlocks: [args.cidr],
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: {
        ...baseTags,
        Name: vpceSgName
      },
    },
    {
      parent: this
    })

    const interfaceEndpoints = []
    args.interfaceEndpoints?.forEach( service => {
      const vpce = new aws.ec2.VpcEndpoint(service, {
        vpcId: vpc.vpcId,
        serviceName: `com.amazonaws.${args.region}.${service}`,
        vpcEndpointType: "Interface",
        securityGroupIds: [vpceSg.id],
        subnetIds: vpc.isolatedSubnetIds,
        privateDnsEnabled: true,
        tags: {
          ...baseTags,
          Name: [this.baseName,service].join("-")
        },
      },
      {
        parent: this
      })

      interfaceEndpoints.push(vpce)
    })

    // Configure the VPC default route table
    const defaultRouteTable = new aws.ec2.DefaultRouteTable("defaultRouteTable", {
      defaultRouteTableId: vpc.vpc.defaultRouteTableId,
      routes: [],
      tags: baseTags
    },
    {
      parent: this
    })

    // Configure the VPC default security group
    const defaultSecurityGroup = new aws.ec2.DefaultSecurityGroup("defaultSecurityGroup", {
      vpcId: this.vpcId,
      ingress: [],
      egress: [],
      tags: {
        ...baseTags,
        Name: [this.baseName,"default"].join("-")
      }
    },
    {
      parent: this
    })


    // Configure the VPC peering
    let openVpnVpc:aws.ec2.VpcPeeringConnection | undefined = undefined
    if( args?.openVpnVpcId ) {
      // Create the peering
      openVpnVpc = new aws.ec2.VpcPeeringConnection("openVpnVpc", {
        peerVpcId: args.openVpnVpcId,
        vpcId: vpc.vpcId,
        autoAccept: true,
        tags: {
          ...baseTags,
          Name: [this.baseName,"main"].join("-")
        }
      },
      {
        parent: this
      })

      // Configure local subnet routes
      this.privateRouteTables.apply(routeTables => {
        routeTables.forEach(routeTable => {
          routeTable.id.apply(routeTableId => {
            const route = new aws.ec2.Route(`${args.name}-${routeTableId}-main`,{
              routeTableId: routeTableId,
              destinationCidrBlock: args.openVpnVpcCidr,
              vpcPeeringConnectionId: openVpnVpc?.id
            },
            {
              parent: openVpnVpc
            })
          })
        })
      })

      // Configure main vpc subnet routes
      if( args?.openVpnVpcRtbls ) {
        const routeTables = args.openVpnVpcRtbls
        routeTables.apply(
          routeTables => {
            routeTables.forEach(routeTable => {
              // routeTable.id.apply(routeTableId => {
                const route = new aws.ec2.Route(`main-${routeTable.id}-${args.name}`,{
                  routeTableId: routeTable.id,
                  destinationCidrBlock: args.cidr,
                  vpcPeeringConnectionId: openVpnVpc?.id
                },
                {
                  parent: openVpnVpc
                })
              // })
            })
          })
      }
    }

    // Register outputs
    this.registerOutputs({
      vpdId: this.vpcId,
      publicSubnetIds: this.publicSubnetIds,
      privateSubnetIds: this.privateSubnetIds,
      isolatedSubnetIds: this.isolatedSubnetIds,
      routeTables: this.routeTables,
      privateRouteTables: this.privateRouteTables
    })
  }
}
