import * as cdk from 'aws-cdk-lib'
import * as asg from 'aws-cdk-lib/aws-autoscaling'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as s3Origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3'
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'
import { DynamoDBInsertResource, PrefixListGetResource } from 'custom-resources'
import * as execa from 'execa'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

export class Ec2Stack extends cdk.Stack {
  dynamodbTableName = 'aws-examples-messages'
  dynamoTablePartitionKeyName = 'id'

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // create dynamodb table
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(this.dynamodbTableName, dynamodbTable.tableArn)

    const prefixList = new PrefixListGetResource(this, 'prefixlist')

    const vpc = this.createVpc()

    // create SG for LB
    const albSg = new ec2.SecurityGroup(this, 'aws-examples-lb-sg', {
      vpc,
      securityGroupName: 'aws-examples-lb-sg',
      description: 'Security group for ALB',
    })
    albSg.addIngressRule(
      ec2.Peer.prefixList(prefixList.prefixListId),
      ec2.Port.tcp(443),
      'Allow access from cloudfront',
    )

    // create SG for ASG
    const asgSg = new ec2.SecurityGroup(this, 'aws-examples-asg-sg', {
      vpc,
      securityGroupName: 'aws-examples-asg-sg',
      description: 'Security group for ASG',
    })
    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow access from ALB',
    )

    this.createInstanceConnectEp(vpc, asgSg)

    // create launch template
    const launchTemplate = this.createLaunchTemplate(asgSg)

    const asg = this.createAutoScalingGroup(vpc, launchTemplate)

    // create LB
    const lb = this.createLoadBalancer(vpc, albSg, asg)

    const s3Bucket = this.createStaticWebsite()

    const distribution = this.createCloudFrontDistribution(s3Bucket, lb)
  }

  createVpc() {
    return new ec2.Vpc(this, 'aws-examples-vpc', {
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

  createDynamodb() {
    return new dynamodb.Table(this, this.dynamodbTableName, {
      tableName: this.dynamodbTableName,
      partitionKey: {
        name: this.dynamoTablePartitionKeyName,
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })
  }

  addDynamoDBRecord(tableName: string, tableArn: string) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn })
  }

  createLaunchTemplate(asgSg: ec2.SecurityGroup) {
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf-8')

    const role = new iam.Role(this, 'aws-examples-instance-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBReadOnlyAccess')],
    })

    return new ec2.LaunchTemplate(this, 'aws-examples-launch-template', {
      launchTemplateName: 'aws-examples-launch-template',
      securityGroup: asgSg,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role: role,
      userData: ec2.UserData.custom(userDataScript),
    })
  }

  createInstanceConnectEp(vpc: ec2.Vpc, asgSg: ec2.SecurityGroup) {
    // get the EC2_INSTANCE_CONNECT CIDR for ca-central-1
    // const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json | jq -r '.prefixes[] | select(.region=="ca-central-1") | select(.service=="EC2_INSTANCE_CONNECT") | .ip_prefix'`
    const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json`
    const { stdout } = execa.commandSync(cmd)
    const ipRanges = JSON.parse(stdout)
    const reqObj = ipRanges.prefixes.find(
      (p: Record<string, string>) =>
        p.service === 'EC2_INSTANCE_CONNECT' && p.region === 'ca-central-1',
    )
    const instanceConnectSg = new ec2.SecurityGroup(this, 'aws-examples-instance-connect-sg', {
      vpc,
      securityGroupName: 'aws-examples-instance-connect-sg',
      description: 'Security group for Instance Connect',
      allowAllOutbound: true,
    })

    instanceConnectSg.addIngressRule(
      ec2.Peer.ipv4(reqObj.ip_prefix),
      ec2.Port.tcp(22),
      'Allow access from AWS console',
    )

    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(instanceConnectSg.securityGroupId),
      ec2.Port.tcp(22),
      'Allow access from Instance Connect',
    )

    const instanceConnectEndpoint = new ec2.CfnInstanceConnectEndpoint(
      this,
      'aws-examples-instance-connect-ep',
      {
        subnetId: vpc.privateSubnets[0].subnetId,
        securityGroupIds: [instanceConnectSg.securityGroupId],
      },
    )
  }

  createAutoScalingGroup(vpc: ec2.Vpc, launchTemplate: ec2.LaunchTemplate) {
    return new asg.AutoScalingGroup(this, 'aws-examples-asg', {
      vpc: vpc,
      launchTemplate: launchTemplate,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
    })
  }

  createLoadBalancer(vpc: ec2.Vpc, albSg: ec2.SecurityGroup, asg: asg.AutoScalingGroup) {
    const lb = new elbv2.ApplicationLoadBalancer(this, 'aws-examples-alb', {
      vpc,
      internetFacing: true,
    })

    const listener = lb.addListener('aws-examples-listener', {
      port: 80,
    })

    // Create an AutoScaling group and add it as a load balancing
    // target to the listener.
    listener.addTargets('aws-examples-asg', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        path: '/api/healthz',
        interval: cdk.Duration.minutes(1),
      },
    })

    return lb
  }

  createStaticWebsite() {
    // create S3 bucket, upload index.html, and create CloudFront distribution
    const s3Bucket = new s3.Bucket(this, 'aws-examples-s3-bucket', {
      bucketName: 'aws-examples-s3-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
    })

    new BucketDeployment(this, 'aws-examples-s3-bucket-deployment', {
      destinationBucket: s3Bucket,
      sources: [Source.asset(path.resolve(process.cwd(), '../frontend/dist'))],
    })

    return s3Bucket
  }

  createCloudFrontDistribution(s3Bucket: s3.Bucket, lb: elbv2.ApplicationLoadBalancer) {
    // the oac is not yet supported by CDK, the workaround taken from here: https://github.com/aws/aws-cdk/issues/21771#issuecomment-1479201394

    const oac = new cloudfront.CfnOriginAccessControl(this, 'aws-examples-aoc', {
      originAccessControlConfig: {
        name: 'aws-examples-aoc',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
      },
    })

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'CloudFront distribution for aws-examples',
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      defaultBehavior: {
        origin: new s3Origins.S3Origin(s3Bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
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
    const statement = comS3PolicyOverride.policyDocument.statements[0]
    if (statement['_principal'] && statement['_principal'].CanonicalUser) {
      delete statement['_principal'].CanonicalUser
    }
    comS3PolicyOverride.addOverride('Properties.PolicyDocument.Statement.0.Principal', {
      Service: 'cloudfront.amazonaws.com',
    })
    comS3PolicyOverride.addOverride('Properties.PolicyDocument.Statement.0.Condition', {
      StringEquals: {
        'AWS:SourceArn': this.formatArn({
          service: 'cloudfront',
          region: '',
          resource: 'distribution',
          resourceName: distribution.distributionId,
          arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        }),
      },
    })

    const s3OriginNode = distribution.node.findAll().filter((child) => child.node.id === 'S3Origin')
    s3OriginNode[0].node.tryRemoveChild('Resource')

    return distribution
  }
}
