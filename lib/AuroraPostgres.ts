import * as pulumi from "@pulumi/pulumi"
import * as aws from "@pulumi/aws"
import * as random from "@pulumi/random"


export interface AuroraPostgresArgs {
  namespace: string
  environment: string
  name: string

  dbInstanceClass: string
  version: string

  vpcId: pulumi.Input<string>
  vpcCidr: pulumi.Input<string>
  subnetIds: pulumi.Input<string[]>
  port?: number
}


export interface EncryptedBucketOutputs {
  kmsKeyId: pulumi.Output<string>
  kmsKeyArn: pulumi.Output<string>
  kmsAliasArn: pulumi.Output<string>
  clusterName: pulumi.Output<string>
  clusterArn: pulumi.Output<string>
  clusterPort: pulumi.Output<number>
  clusterEndpoint: pulumi.Output<string>
  adminUser: pulumi.Output<string>
  adminPassword: pulumi.Output<string>
}


export class AuroraPostgres extends pulumi.ComponentResource {
  // Context inputs
  public readonly namespace: string
  public readonly environment: string
  public readonly name: String

  protected baseName: string

  // Engine config
  public readonly engineVersion: string
  public readonly majorEngineVersion: string

  // Networking
  public readonly port: number

  // Resources
  public readonly cluster: aws.rds.Cluster
  public readonly instances: aws.rds.ClusterInstance[]

  // Outputs
  public readonly kmsKeyId: pulumi.Output<string>
  public readonly kmsKeyArn: pulumi.Output<string>
  public readonly kmsAliasArn: pulumi.Output<string>
  public readonly clusterName: pulumi.Output<string>
  public readonly clusterArn: pulumi.Output<string>
  public readonly clusterPort: pulumi.Output<number>
  public readonly clusterEndpoint: pulumi.Output<string>
  public readonly adminUser: pulumi.Output<string>
  public readonly adminPassword: pulumi.Output<string>


  // Constructor
  constructor(name: string, args: AuroraPostgresArgs, opts?: pulumi.ComponentResourceOptions) {
    super("huckstream:aws:postgres", name, {}, opts)

    // Set context details
    this.namespace = args.namespace
    this.environment = args.environment
    this.name = args.name

    this.baseName = [
      this.namespace,
      this.environment,
      this.name,
      "psql"
    ].join("-")

    // Set tags
    const baseTags = {
      Namespace: this.namespace,
      Environment: this.environment,
      Name: this.baseName
    }

    // Configure vpc info
    const vpcId = args.vpcId
    const vpcCidr = args.vpcCidr
    const subnetIds = args.subnetIds


    // Configure engine version
    this.engineVersion = args.version
    this.majorEngineVersion = this.engineVersion.split(".")[0]

    // Configre port
    this.port = args.port || 5432


    // Create a KMS Key
    const kmsKey = new aws.kms.Key(`${this.baseName}-kms-key`, {
      description: `KMS key for Aurora PostgreSQL encryption of database ${this.baseName}`,
      deletionWindowInDays: 14,
      tags: baseTags
    },
    {
      parent: this
    })


    // Create a KMS Alias
    const kmsAlias = new aws.kms.Alias(this.baseName, {
      name: `alias/${this.baseName}`,
      targetKeyId: kmsKey.keyId,
    },
    {
      parent: this
    })

    this.kmsKeyId = kmsKey.id
    this.kmsKeyArn = kmsKey.arn
    this.kmsAliasArn = kmsAlias.arn


    // Create a DB subnet group
    const subnetGroupName = `${this.baseName}-subnet-group`
    const subnetGroup = new aws.rds.SubnetGroup(subnetGroupName, {
      name: subnetGroupName,
      description: `Subnet group for Aurora Postgres cluster ${this.baseName}`,
      subnetIds: subnetIds,
      tags: {
        ...baseTags,
        Name: subnetGroupName
      }
    },
    {
      parent: this
    })


    // Create a security group
    const sgName = [this.baseName,"sg"].join("-")
    const sg = new aws.ec2.SecurityGroup(sgName, {
      name: sgName,
      description: `Network permissions for Aurora Postgres cluster ${this.baseName}`,
      vpcId: vpcId,
      ingress: [
        {
          description: "Allow private local ingress",
          protocol: "tcp",
          fromPort: this.port,
          toPort: this.port,
          cidrBlocks: [vpcCidr], // Allow all Postgres traffic on local private subnets
        },
      ],
      egress: [
        {
          description: "Allow private local egress",
          protocol: "-1",
          fromPort: 0,
          toPort: 0,
          cidrBlocks: [vpcCidr], // Allow all Postgres traffic on local private subnets
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


    // Create a cluster parameter group
    const clusterPaerameterGroupName = `${this.baseName}-cpg`
    const clustserParameterGroup = new aws.rds.ClusterParameterGroup(clusterPaerameterGroupName, {
      name: clusterPaerameterGroupName,
      family: `aurora-postgresql${this.majorEngineVersion}`,
      description: `Cluster parameter group for ${this.baseName}`,
      parameters: [
        // Override Auorora Postgres Default cluster db parameters here
      ],
      tags: {
        ...baseTags,
        Name: clusterPaerameterGroupName
      }
    },
    {
      parent: this
    })


    // Create a DB parameter group
    const parameterGroupName = `${this.baseName}-pg`
    const parameterGroup = new aws.rds.ParameterGroup(parameterGroupName, {
      name: parameterGroupName,
      family: `aurora-postgresql${this.majorEngineVersion}`,
      description: `Cluster instance parameter group for ${this.baseName}`,
      parameters: [
        // Override Auorora Postgres default cluster instance db parameters here
      ],
      tags: {
        ...baseTags,
        Name: parameterGroupName
      }
    },
    {
      parent: this
    })


    // Generate admin creds
    const dbPassword = new random.RandomPassword(`${this.baseName}-pwd`, {
        length: 32,
        special: false,
        number: true,
        upper: true,
        lower: true,
        minLower: 1,
        minUpper: 1,
        minSpecial: 0,
        minNumeric: 1,
    })

    const dbUser = [this.namespace,"admin"].join("")

    // Create an Aurora PostgreSQL cluster
    this.cluster = new aws.rds.Cluster(`${this.baseName}-cluster`, {
      // Cluster name
      clusterIdentifier: this.baseName,

      // Engine config
      engine: "aurora-postgresql",
      engineVersion: this.engineVersion,
      dbClusterParameterGroupName: clustserParameterGroup.name,

      // Admin password
      masterUsername: dbUser,
      masterPassword: dbPassword.result,

      // Encryption
      storageEncrypted: true,
      kmsKeyId: kmsKey.arn,

      // Configuration management
      applyImmediately: false,
      preferredMaintenanceWindow: "Mon:00:00-Mon:03:00",
      allowMajorVersionUpgrade: false,

      // Backups
      backupRetentionPeriod: 14,
      preferredBackupWindow: "07:00-09:00",
      copyTagsToSnapshot: true,
      finalSnapshotIdentifier: [this.baseName,"final"].join("-"),

      // Networking
      port: this.port,
      networkType: "IPV4",
      dbSubnetGroupName: subnetGroup.name,
      vpcSecurityGroupIds: [sg.id],

      // Set tags
      tags: baseTags
    },
    {
      parent: this
    })

    this.clusterName = pulumi.output(this.baseName)
    this.clusterArn = this.cluster.arn
    this.clusterPort = this.cluster.port
    this.clusterEndpoint = this.cluster.endpoint

    this.adminUser= pulumi.output(pulumi.secret(dbUser))
    this.adminPassword= pulumi.output(pulumi.secret(dbPassword.result))


    // Create Aurora PostgreSQL instances
    this.instances = []
    // Create two instances for HA
    for (let i=0; i<2; i++) {
      const instanceName= `${this.baseName}-instance-${i}`
      this.instances.push(new aws.rds.ClusterInstance(instanceName, {
        // Instance name
        identifier: instanceName,

        // Cluster membership
        clusterIdentifier: this.cluster.id,

        // Engine config
        engine: "aurora-postgresql",
        engineVersion: this.engineVersion,

        // Change management
        applyImmediately: false,
        autoMinorVersionUpgrade: false,
        instanceClass: args.dbInstanceClass,

        // Backups
        copyTagsToSnapshot: true,

        // Networking
        publiclyAccessible: false,

        // Set tags
        tags: baseTags,
      },
        {
          parent: this
        })
      )
    }


    // Register the outputs
    this.registerOutputs({
      kmsKeyId: this.kmsKeyId,
      kmsKeyArn: this.kmsKeyArn,
      kmsAliasArn: this.kmsAliasArn,
      clusterName: this.clusterName,
      clusterPort: this.clusterPort,
      clusterEndpoint: this.clusterEndpoint,
      adminUser: this.adminUser,
      adminPassword: this.adminPassword,
    })
  }
}
