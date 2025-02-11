# cr-workshop
Workshop example deploying an VPC, S3 Bucket, DynamoDB, RDS Aurora Postgres, and Databricks to AWS

## Step 0 - Setup

### Pulumi Cloud

Accept invite to Pulumi Cloud organization and login to dashboard

### AWS SSO

Log into AWS SSO via the start URL and verify access to account

### Stack Configuration
- Find your username and CIDR, i.e. `bcenter` and `10.x.0.0/16`

- Copy `Pulumi.{{user}}.example.yaml` to an appropriate stack file

- Set `name` to your username

- Set `vpcCidr` to your assigned CIDR

- Create stack
  ```bash
  pulumi stack init bcenter
  ```

- Select stack
  ```bash
  pulumi stack select bcenter
  ```

## Step 1 - Using Stack References & Outputs
- Uncomment code related to Step 1

- Run update
  ```bash
  pulumi up
  ```

- Verify update successful in Pulumi Cloud

## Step 2 - Deploy Isolated VPC
- Uncomment code related to Step 1

- Run update
  ```bash
  pulumi up
  ```

- Compare resource graph in Pulumi Cloud to AWS Console

## Step 3 - Verify Network Connectivity
- Connect to main vpc private ping instance using SSM connect
- Verify network route to main vpc public ping instance
- Verify network route to isolated vpc private ping instance
- Verify no network route to isolated vpc private ping instance

- Connect to isolated vpc private ping instance using SSM connect
- Verify network route to isolated vpc isolated ping instance
- Verify network route to main vpc private ping instance
- Verify no network route to main vpc public ping instance

- Connect to isolated vpc isolated ping instance using SSM connect
- Verify network route to private vpc isolated ping instance
- Verify no network route to main vpc private ping instance
- Verify no network route to main vpc public ping instance


## Step 4 - Deploy Encrypted S3 Bucket

- Uncomment code related to Step 4

- Run update
  ```bash
  pulumi up
  ```
- Connect to main vpc private ping instance using SSM connect

- Create a test file
  ```bash
  echo "bcenter" > bcenter.txt

  aws s3 cp \
    test.txt \
    s3://huckstream-wksp-bcenter/test.txt \
    --sse aws:kms \
    --sse-kms-key-id alias/huckstream-wksp-bcenter
  ```

- Get version ID from AWS console e.g. `86BPXBR7RHyN7ZlgSGF3sesAZlPSEwxO`

- Delete test file
  ```bash
  aws s3api delete-object \
    --bucket huckstream-wksp-ckoning \
    --key test.txt \
    --version-id 86BPXBR7RHyN7ZlgSGF3sesAZlPSEwxO
  ```

## Step 5 - Restrict S3 Bucket to VPC
- Uncomment code related to Step 4

- Run update
  ```bash
  pulumi up
  ```

- Connect to main vpc private ping instance using SSM connect

- Create a test file
  ```bash
  echo "bcenter" > bcenter.txt

  aws s3 cp \
    test.txt \
    s3://huckstream-wksp-bcenter/test.txt \
    --sse aws:kms \
    --sse-kms-key-id alias/huckstream-wksp-bcenter
  ```

- Get version ID from AWS console e.g. `86BPXBR7RHyN7ZlgSGF3sesAZlPSEwxO`

- Delete test file
  ```bash
  aws s3api delete-object \
    --bucket huckstream-wksp-ckoning \
    --key test.txt \
    --version-id 86BPXBR7RHyN7ZlgSGF3sesAZlPSEwxO
  ```

## Step 6 - Deploy RDS Cluster
- Uncomment code related to Step 6

- Run update
  ```bash
  pulumi up
  ```

## Step 7 - Verify Cluster Access Restriction
- Connect to isolated vpc private instance using SSM connect

- Install Postgres 16 client
  ```bash
  sudo dnf install postgresql16
  ```

- Attempt successful connection to database
  ```bash
  psql -U huckstremadmin -p 5432 -h huckstream-wksp-ckoning-psql.cluster-c3qokks4q6jn.us-east-1.rds.amazonaws.com
  ```

- Connect to main vpc private instance using SSM connect

- Install Postgres 16 client
  ```bash
  sudo dnf install postgresql16
  ```

- Attempt failed connection to database
  ```bash
  psql -U huckstremadmin -p 5432 -h huckstream-wksp-ckoning-psql.cluster-c3qokks4q6jn.us-east-1.rds.amazonaws.com
  ```
