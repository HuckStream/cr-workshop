import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"


export interface PingInstanceInputs {
  namespace: string
  environment: string
  name: string

  vpcId: pulumi.Input<string>
  subnetId: pulumi.Input<string>
  public?: boolean

  amiId: pulumi.Input<string>
  instanceType?: string

  instanceProfile?: pulumi.Input<string>
}


export interface PingInstanceOutputs {
  securityGroupId: pulumi.Output<string>
  publicIp: pulumi.Output<string>
  privateIp: pulumi.Output<string>
}


export class PingInstance extends pulumi.ComponentResource {
  // Context inputs
  public readonly namespace: string
  public readonly environment: string
  public readonly name: string

  protected baseName: string

  // Dependency inputs
  protected vpcId: pulumi.Input<string>
  protected subnetId: pulumi.Input<string>
  protected public: boolean

  protected amiId: pulumi.Input<string>
  protected instanceType: string

  protected instanceProfile: pulumi.Input<string> | undefined

  // EC2 instance outputs
  public readonly securityGroupId: pulumi.Output<string>
  public readonly publicIp: pulumi.Output<string>
  public readonly privateIp: pulumi.Output<string>

  // Constructor
  constructor(name: string, args: PingInstanceInputs, opts?: pulumi.ComponentResourceOptions) {
    super("huckstream:aws:pingback", name, args, opts)

    // Set context details
    this.namespace = args.namespace
    this.environment = args.environment
    this.name = args.name

    this.baseName = [
      this.namespace,
      this.environment,
      this.name,
    ].join("-")

    // Set tags
    const baseTags = {
      Namespace: this.namespace,
      Environment: this.environment,
      Name: this.baseName
    }


    // Set networking config
    this.vpcId = args.vpcId
    this.subnetId = args.subnetId
    this.public = args.public || false

    this.amiId = args.amiId
    this.instanceType = args.instanceType || "t2.micro"

    this.instanceProfile = args.instanceProfile


    // Create the security group
    const sgName = [this.baseName,"sg"].join("-")
    const sg = new aws.ec2.SecurityGroup(sgName, {
      name: sgName,
      vpcId: this.vpcId,
      description: "Allow private ICMP",
      ingress: [
        {
          protocol: "icmp",
          fromPort: -1,               // -1 specifies all ICMP types
          toPort: -1,                 // -1 specifies all ICMP codes
          cidrBlocks: ["10.0.0.0/8"], // Allow all ICMP traffic on private subnets
        },
      ],
      egress: [
        {
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: {
        ...baseTags,
        Name: sgName
      },
    },
    {
      parent: this
    })

    this.securityGroupId = sg.id


    // Create the EC2 instance
    const ec2 = new aws.ec2.Instance(this.baseName, {
      // Networking config
      subnetId: this.subnetId,
      vpcSecurityGroupIds: [this.securityGroupId],
      associatePublicIpAddress: this.public,

      // Instance config
      ami: this.amiId,
      instanceType: this.instanceType,
      metadataOptions: {
        httpTokens: "required", // Require the use of IMDSv2
        httpEndpoint: "enabled",
        httpPutResponseHopLimit: 2,
      },

      // Instance permissions
      iamInstanceProfile: this.instanceProfile,

      // Set root storage
      rootBlockDevice: {
        deleteOnTermination: true,
        volumeType: "gp3",
        volumeSize: 8, // Size in GB
        // encrypted: true,
        // kmsKeyId: kmsKey.id,
        tags: baseTags
      },

      // Set tags
      tags: baseTags,
    },
    {
      parent: this
    })

    this.publicIp = ec2.publicIp
    this.privateIp = ec2.privateIp


    // Register outputs
    this.registerOutputs({
      securityGroupId: this.securityGroupId,
      publicIp: this.publicIp,
      privateIp: this.privateIp
    })
  }
}
