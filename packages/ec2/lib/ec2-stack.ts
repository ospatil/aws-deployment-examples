import {
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_autoscaling as asg,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_deployment as s3Deploy,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDBInsertResource, PrefixListGetResource } from 'custom-resources'
import * as execa from 'execa'
import { createCertificate } from './utils'

export class Ec2Stack extends Stack {
  public readonly customHeaderSecret: secretsmanager.Secret
  public readonly s3Bucket: s3.Bucket
  public readonly lb: elbv2.ApplicationLoadBalancer
  readonly #dynamodbTableName = 'aws-examples-messages'
  readonly #dynamoTablePartitionKeyName = 'id'

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    const vpc = this.createVpc()

    // create dynamodb table
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(this.#dynamodbTableName, dynamodbTable.tableArn, vpc)

    const prefixList = new PrefixListGetResource(this, 'prefixlist', { vpc })

    this.customHeaderSecret = this.createCustomHeaderSecret()

    // create SG for LB
    const albSg = this.createAlbSg(vpc, prefixList)

    // create SG for ASG
    const asgSg = this.createAsgSg(vpc, albSg)

    const instanceConnectEp = this.createInstanceConnectEp(vpc, asgSg)

    // create launch template
    const launchTemplate = this.createLaunchTemplate(asgSg)

    const asg = this.createAutoScalingGroup(vpc, launchTemplate)

    const certificate = createCertificate(this, 'alb-cert')

    // create LB
    this.lb = this.createLoadBalancer(vpc, albSg, asg, certificate)

    this.s3Bucket = this.createStaticWebsite()
  }

  private createVpc() {
    return new ec2.Vpc(this, 'vpc', {
      vpcName: 'aws-examples-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        DYNAMODB: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
        },
      },
    })
  }

  private createCustomHeaderSecret() {
    return new secretsmanager.Secret(this, 'custom-header-secret', {
      secretName: 'aws-examples-custom-header-secret',
      generateSecretString: {
        // exclude special characters to avoid escaping in the shell
        excludeCharacters: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
        requireEachIncludedType: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      replicaRegions: [{ region: 'us-east-1' }],
    })
  }

  private createAlbSg(vpc: ec2.Vpc, prefixList: PrefixListGetResource) {
    const albSg = new ec2.SecurityGroup(this, 'lb-sg', {
      vpc,
      securityGroupName: 'aws-examples-lb-sg',
      description: 'Security group for ALB',
    })
    albSg.addIngressRule(
      ec2.Peer.prefixList(prefixList.prefixListId),
      ec2.Port.tcp(443),
      'Allow access from cloudfront',
    )
    return albSg
  }

  private createAsgSg(vpc: ec2.Vpc, albSg: ec2.SecurityGroup) {
    const asgSg = new ec2.SecurityGroup(this, 'asg-sg', {
      vpc,
      securityGroupName: 'aws-examples-asg-sg',
      description: 'Security group for ASG',
    })
    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow access from ALB',
    )
    return asgSg
  }

  private createDynamodb() {
    return new dynamodb.Table(this, this.#dynamodbTableName, {
      tableName: this.#dynamodbTableName,
      partitionKey: {
        name: this.#dynamoTablePartitionKeyName,
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private addDynamoDBRecord(tableName: string, tableArn: string, vpc: ec2.Vpc) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn, vpc })
  }

  private createLaunchTemplate(asgSg: ec2.SecurityGroup) {
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8')

    const role = new iam.Role(this, 'instance-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBReadOnlyAccess')],
    })

    return new ec2.LaunchTemplate(this, 'launch-template', {
      launchTemplateName: 'aws-examples-launch-template',
      securityGroup: asgSg,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      userData: ec2.UserData.custom(userDataScript),
    })
  }

  private createInstanceConnectEp(vpc: ec2.Vpc, asgSg: ec2.SecurityGroup) {
    // get the EC2_INSTANCE_CONNECT CIDR for ca-central-1
    // const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json | jq -r '.prefixes[] | select(.region=="ca-central-1") | select(.service=="EC2_INSTANCE_CONNECT") | .ip_prefix'`
    const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json`

    type IpRange = {
      prefixes: Array<{ service: string; region: string; ip_prefix: string }>
    }
    const { stdout } = execa.commandSync(cmd)
    const ipRanges: IpRange = JSON.parse(stdout) as IpRange
    // const ipRanges = JSON.parse(stdout)
    const requestObject = ipRanges.prefixes.find(
      (p: Record<string, string>) =>
        p.service === 'EC2_INSTANCE_CONNECT' && p.region === 'ca-central-1',
    )
    const instanceConnectSg = new ec2.SecurityGroup(this, 'instance-connect-sg', {
      vpc,
      securityGroupName: 'aws-examples-instance-connect-sg',
      description: 'Security group for Instance Connect',
      allowAllOutbound: true,
    })

    if (requestObject) {
      instanceConnectSg.addIngressRule(
        ec2.Peer.ipv4(requestObject.ip_prefix),
        ec2.Port.tcp(22),
        'Allow access from AWS console',
      )
    }

    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(instanceConnectSg.securityGroupId),
      ec2.Port.tcp(22),
      'Allow access from Instance Connect',
    )

    return new ec2.CfnInstanceConnectEndpoint(this, 'instance-connect-ep', {
      subnetId: vpc.privateSubnets[0].subnetId,
      securityGroupIds: [instanceConnectSg.securityGroupId],
    })
  }

  private createAutoScalingGroup(vpc: ec2.Vpc, launchTemplate: ec2.LaunchTemplate) {
    return new asg.AutoScalingGroup(this, 'asg', {
      vpc,
      launchTemplate,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
    })
  }

  private createLoadBalancer(
    vpc: ec2.Vpc,
    albSg: ec2.SecurityGroup,
    asg: asg.AutoScalingGroup,
    certificate: acm.ICertificate,
  ) {
    const lb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'aws-examples-alb',
      securityGroup: albSg,
    })

    const listener = lb.addListener('listener', {
      port: 443,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
    })

    // create an AutoScaling group and add it as a load balancing
    // target to the listener.
    listener.addTargets('asg-target', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        path: '/api/healthz',
        interval: Duration.minutes(1),
      },
    })
    return lb
  }

  private createStaticWebsite() {
    // create S3 bucket, upload index.html, and create CloudFront distribution
    const s3Bucket = new s3.Bucket(this, 'bucket', {
      bucketName: 'aws-examples-s3-bucket',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const depl = new s3Deploy.BucketDeployment(this, 'bucket-deployment', {
      destinationBucket: s3Bucket,
      sources: [s3Deploy.Source.asset(path.resolve(process.cwd(), '../frontend/dist'))],
    })

    return s3Bucket
  }
}
