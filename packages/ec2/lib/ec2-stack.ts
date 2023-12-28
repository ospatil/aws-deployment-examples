import {
  ArnFormat,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_elasticloadbalancingv2_actions as actions,
  aws_autoscaling as asg,
  aws_cloudfront as cloudfront,
  aws_cognito as cognito,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_s3_deployment as s3Deploy,
  aws_secretsmanager as secretsmanager,
  aws_route53_targets as targets,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
// eslint-disable-next-line import/no-extraneous-dependencies
import { DynamoDBInsertResource, PrefixListGetResource } from 'custom-resources'
import * as execa from 'execa'
import { createCertificate, customHeaderName, dynamodbTableName } from './commons'

export type Ec2StackProps = StackProps & {
  cloudfrontCertificate: acm.ICertificate
  webAcl: wafv2.CfnWebACL
}

export class Ec2Stack extends Stack {
  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props)
    const vpc = this.createVpc()

    // create dynamodb table
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(dynamodbTableName, dynamodbTable.tableArn, vpc)

    const prefixList = new PrefixListGetResource(this, 'prefixlist', { vpc })

    const customHeaderSecret = this.createCustomHeaderSecret()

    const albSg = this.createAlbSg(vpc, prefixList)

    const asgSg = this.createAsgSg(vpc, albSg)

    const instanceConnectEp = this.createInstanceConnectEp(vpc, asgSg)

    const launchTemplate = this.createLaunchTemplate(asgSg, dynamodbTable.tableArn)

    const asg = this.createAutoScalingGroup(vpc, launchTemplate)

    const certificate = createCertificate(this, 'alb-cert')

    const [lb, tg, listener] = this.createLoadBalancer(vpc, albSg, asg, certificate)

    const [userPool, userPoolDomain, userPoolClient] = this.createCognitoUserPool(lb)

    this.addListenerRule(listener, tg, customHeaderSecret, userPool, userPoolDomain, userPoolClient)

    const s3Bucket = this.createStaticWebsite()

    const distribution = this.createCloudFrontDistribution(
      s3Bucket,
      lb,
      customHeaderSecret,
      props.cloudfrontCertificate,
      props.webAcl,
    )

    const route53DistAlias = this.createRoute53DistAlias(distribution)
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

  private createDynamodb() {
    return new dynamodb.Table(this, dynamodbTableName, {
      tableName: dynamodbTableName,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private addDynamoDBRecord(tableName: string, tableArn: string, vpc: ec2.Vpc) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn, vpc })
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
        p.service === 'EC2_INSTANCE_CONNECT' && p.region === process.env.AWS_PRIMARY_REGION,
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

  private createLaunchTemplate(asgSg: ec2.SecurityGroup, tableArn: string) {
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8')

    const cloudwatchLogsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
            'logs:PutRetentionPolicy',
          ],
          resources: ['*'],
        }),
      ],
    })

    // create a policy document with permissions to read from a single dynamodb table
    const dynamodbPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
          resources: [tableArn],
        }),
      ],
    })

    const role = new iam.Role(this, 'instance-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      // managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBReadOnlyAccess')],
      inlinePolicies: {
        cloudwatchLogsPolicy,
        dynamodbPolicy,
      },
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
    const alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'aws-examples-alb',
      securityGroup: albSg,
    })

    const tg = new elbv2.ApplicationTargetGroup(this, 'asg-target', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        path: '/api/healthz',
        interval: Duration.minutes(1),
      },
    })

    const listener = alb.addListener('listener', {
      port: 443,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
      defaultAction: elbv2.ListenerAction.fixedResponse(403),
    })

    return [alb, tg, listener] as const
  }

  private createCognitoUserPool(lb: elbv2.ApplicationLoadBalancer) {
    const userPool = new cognito.UserPool(this, 'user-pool', {
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const userPoolDomain = userPool.addDomain('user-pool-domain', {
      cognitoDomain: {
        domainPrefix: 'ospatil-examples',
      },
    })

    const googleClientSecret = secretsmanager.Secret.fromSecretAttributes(this, 'google-secret', {
      secretCompleteArn: process.env.GOOGLE_CLIENT_SECRET_ARN,
    }).secretValue

    const provider = new cognito.UserPoolIdentityProviderGoogle(this, 'google-provider', {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecretValue: googleClientSecret,
      userPool,
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
      scopes: ['email', 'openid'],
    })

    const userPoolCLient = userPool.addClient('user-pool-client', {
      userPoolClientName: 'aws-examples-client',
      generateSecret: true,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID],
        callbackUrls: [
          `https://${process.env.APP_DOMAIN!}/oauth2/idpresponse`,
          `https://${lb.loadBalancerDnsName}/oauth2/idpresponse`,
        ],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
    })

    // make sure provider is created before client
    userPoolCLient.node.addDependency(provider)

    return [userPool, userPoolDomain, userPoolCLient] as const
  }

  private addListenerRule(
    listener: elbv2.ApplicationListener,
    tg: elbv2.ApplicationTargetGroup,
    customHeaderSecret: secretsmanager.ISecret,
    userPool: cognito.IUserPool,
    userPoolDomain: cognito.UserPoolDomain,
    userPoolClient: cognito.IUserPoolClient,
  ) {
    const cognitoCommonProps = {
      userPool,
      userPoolClient,
      userPoolDomain,
      sessionTimeout: Duration.minutes(5),
    }

    const commonConditions = [
      elbv2.ListenerCondition.httpHeader(customHeaderName, [
        customHeaderSecret.secretValue.unsafeUnwrap(),
      ]),
    ]

    listener.addAction('login', {
      action: new actions.AuthenticateCognitoAction({
        ...cognitoCommonProps,
        onUnauthenticatedRequest: elbv2.UnauthenticatedAction.AUTHENTICATE,
        next: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          host: process.env.APP_DOMAIN!,
          path: '/',
        }),
      }),
      priority: 10,
      conditions: [...commonConditions, elbv2.ListenerCondition.pathPatterns(['/api/login'])],
    })

    listener.addAction('api', {
      action: new actions.AuthenticateCognitoAction({
        ...cognitoCommonProps,
        onUnauthenticatedRequest: elbv2.UnauthenticatedAction.DENY,
        next: elbv2.ListenerAction.forward([tg]),
      }),
      priority: 20,
      conditions: [...commonConditions, elbv2.ListenerCondition.pathPatterns(['/api/*'])],
    })
  }

  private createStaticWebsite() {
    // create S3 bucket, upload index.html, and create CloudFront distribution
    const s3Bucket = new s3.Bucket(this, 'website', {
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

  private createCloudFrontDistribution(
    s3Bucket: s3.Bucket,
    lb: elbv2.ApplicationLoadBalancer,
    customHeaderSecret: secretsmanager.ISecret,
    certificate: acm.ICertificate,
    webAcl: wafv2.CfnWebACL,
  ) {
    const originProps = {
      customHeaders: {
        [customHeaderName]: customHeaderSecret.secretValue.unsafeUnwrap(),
      },
    }

    const apiBehaviorProps = {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    }

    const distribution = new cloudfront.Distribution(this, 'distribution', {
      comment: 'CloudFront distribution for aws-examples',
      domainNames: [process.env.APP_DOMAIN!],
      certificate,
      webAclId: webAcl.attrArn,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2016,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: new origins.S3Origin(s3Bucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(lb, originProps),
          ...apiBehaviorProps,
        },
        '/oauth2/*': {
          origin: new origins.LoadBalancerV2Origin(lb, originProps),
          ...apiBehaviorProps,
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

  private createRoute53DistAlias(distribution: cloudfront.Distribution) {
    const zone = route53.HostedZone.fromLookup(this, 'zone', {
      domainName: process.env.AWS_DNS_ZONE_NAME!,
    })

    return new route53.ARecord(this, 'cloudfront-alias', {
      zone,
      recordName: process.env.APP_DOMAIN!,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })
  }
}
