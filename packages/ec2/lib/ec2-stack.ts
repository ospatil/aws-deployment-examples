import {
  ArnFormat,
  Duration,
  RemovalPolicy,
  Stack,
  aws_autoscaling as asg,
  aws_cloudfront as cloudfront,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_cloudfront_origins as origins,
  aws_s3 as s3,
  aws_s3_deployment as s3Deploy,
  type StackProps,
} from 'aws-cdk-lib'
import { type Construct } from 'constructs'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDBInsertResource, PrefixListGetResource } from 'custom-resources'
import * as execa from 'execa'

export class Ec2Stack extends Stack {
  readonly #dynamodbTableName = 'aws-examples-messages'
  readonly #dynamoTablePartitionKeyName = 'id'

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    const vpc = this.createVpc()

    // create dynamodb table
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(this.#dynamodbTableName, dynamodbTable.tableArn, vpc)

    const prefixList = new PrefixListGetResource(this, 'prefixlist', { vpc })

    // create SG for LB
    const albSg = this.createAlbSg(vpc, prefixList)

    // create SG for ASG
    const asgSg = this.createAsgSg(vpc, albSg)

    const instanceConnectEp = this.createInstanceConnectEp(vpc, asgSg)

    // create launch template
    const launchTemplate = this.createLaunchTemplate(asgSg)

    const asg = this.createAutoScalingGroup(vpc, launchTemplate)

    // create LB
    const lb = this.createLoadBalancer(vpc, albSg, asg)

    const s3Bucket = this.createStaticWebsite()

    const distribution = this.createCloudFrontDistribution(s3Bucket, lb)
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

  private createLoadBalancer(vpc: ec2.Vpc, albSg: ec2.SecurityGroup, asg: asg.AutoScalingGroup) {
    const lb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'aws-examples-alb',
      securityGroup: albSg,
    })

    const listener = lb.addListener('listener', {
      port: 80,
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

  private createCloudFrontDistribution(s3Bucket: s3.Bucket, lb: elbv2.ApplicationLoadBalancer) {
    const distribution = new cloudfront.Distribution(this, 'distribution', {
      comment: 'CloudFront distribution for aws-examples',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      defaultBehavior: {
        origin: new origins.S3Origin(s3Bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(lb),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
        },
      },
    })

    // the oac is not yet supported by CDK, the workaround adopted from: https://github.com/aws/aws-cdk/issues/21771#issuecomment-1479201394
    const oac = new cloudfront.CfnOriginAccessControl(this, 'cf-oac', {
      originAccessControlConfig: {
        name: 'aws-examples-aoc',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    })

    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution
    cfnDistribution.addOverride(
      'Properties.DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    )
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id'),
    )

    const comS3PolicyOverride = s3Bucket.node.findChild('Policy').node
      .defaultChild as s3.CfnBucketPolicy
    // statements[0] is for the autodelete lambda, statements[1] was for OAI that needs to be modified
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const statement = comS3PolicyOverride.policyDocument.statements[1]
    if (statement._principal?.CanonicalUser) {
      delete statement._principal.CanonicalUser
    }

    comS3PolicyOverride.addOverride('Properties.PolicyDocument.Statement.1.Principal', {
      Service: 'cloudfront.amazonaws.com',
    })
    comS3PolicyOverride.addOverride('Properties.PolicyDocument.Statement.1.Condition', {
      StringEquals: {
        'AWS:SourceArn': this.formatArn({
          service: 'cloudfront',
          region: '',
          resource: 'distribution',
          resourceName: distribution.distributionId,
          arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        }),
      },
    })

    const s3OriginNode = distribution.node.findAll().find(child => child.node.id === 'S3Origin')
    s3OriginNode?.node.tryRemoveChild('Resource')

    return distribution
  }
}
