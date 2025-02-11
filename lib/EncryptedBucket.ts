import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"


export interface EncryptedBucketInputs {
  namespace: string
  environment: string
  name: string

  vpceId?: pulumi.Input<string>
}


export interface EncryptedBucketOutputs {
  kmsKeyArn: pulumi.Output<string>
  kmsAliasArn: pulumi.Output<string>
  bucketName: pulumi.Output<string>
  bucketArn: pulumi.Output<string>
}


export class EncryptedBucket extends pulumi.ComponentResource {
  // Context inputs
  public readonly namespace: string
  public readonly environment: string
  public readonly name: String

  protected baseName: string

  // Outputs
  public readonly kmsKeyId: pulumi.Output<string>
  public readonly kmsKeyArn: pulumi.Output<string>
  public readonly kmsAliasArn: pulumi.Output<string>
  public readonly bucketName: pulumi.Output<string>
  public readonly bucketArn: pulumi.Output<string>

  // Constructor
  constructor(name: string, args: EncryptedBucketInputs, opts?: pulumi.ComponentResourceOptions) {
    super("huckstream:aws:encrypted-bucket", name, args, opts)

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


    // Create a KMS Key
    const kmsKey = new aws.kms.Key(this.baseName, {
      description: `KMS key for encrypting S3 bucket ${this.baseName}`,
      deletionWindowInDays: 14,
      tags: baseTags
    },
    {
      parent: this
    })

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

    // Create an S3 Bucket encrypted with the KMS Key
    const bucket = new aws.s3.Bucket(this.baseName, {
      bucket: this.baseName,
      versioning: {
        enabled: true
      },
      serverSideEncryptionConfiguration: {
        rule: {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: "aws:kms",
            kmsMasterKeyId: kmsKey.arn,
          },
        },
      },
      tags: baseTags,
    },
    {
      parent: this
    })


    // If the VPC endpoint has been passed, set the bucket policy to restrict S3 actions to only
    if (args.vpceId) {
      const bucketPolicy = new aws.s3.BucketPolicy(this.baseName, {
        bucket: bucket.bucket,
        policy: pulumi.all([bucket.arn, args.vpceId]).apply(([bucketArn, vpcEndpointId]) => JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "Restrict-Access-to-Specific-VPCE",
              Effect: "Deny",
              Principal: "*",
              Action: [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:DeleteObjectVersion"
              ],
              Resource: [
                `${bucketArn}`,
                `${bucketArn}/*`
              ],
              Condition: {
                StringNotEquals: {
                  "aws:sourceVpce": vpcEndpointId,
                },
              },
            },
          ],
        })),
      })
    }

    this.bucketName = pulumi.output(this.baseName),
    this.bucketArn = bucket.arn


    // Register outputs
    this.registerOutputs({
      // KMS
      kmsKeyId: this.kmsKeyId,
      kmsKeyArn: this.kmsKeyArn,
      kmsAliasArn: this.kmsAliasArn,
      // S3 Bucket
      bucketName: this.bucketName,
      bucketArn: this.bucketArn,
    })
  }
}
