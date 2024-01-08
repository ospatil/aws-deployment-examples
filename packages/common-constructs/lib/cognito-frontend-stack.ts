import {
  ArnFormat,
  Duration,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cognito as cognito,
  aws_elasticloadbalancingv2 as elbv2,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_s3_deployment as s3Deploy,
  aws_secretsmanager as secretsmanager,
  aws_route53_targets as targets,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { customHeaderName } from './commons'

export type CognitoFrontendStackProps = NestedStackProps & {
  alb: elbv2.IApplicationLoadBalancer
  googleClientId: string
  googleClientSecretArn: string
  awsDnsZoneName: string
  appDomain: string
  assetPath: string
  customHeaderSecret: secretsmanager.ISecret
  cloudfrontCertificate: acm.ICertificate
  webAcl: wafv2.CfnWebACL
}

export class CognitoFrontendStack extends NestedStack {
  public readonly userPool: cognito.IUserPool
  public readonly userPoolDomain: cognito.IUserPoolDomain
  public readonly userPoolClient: cognito.IUserPoolClient
  public readonly s3Bucket: s3.IBucket
  public readonly cloudfrontDistribution: cloudfront.IDistribution
  public readonly route53DistAlias: route53.ARecord

  constructor(scope: Construct, id: string, props: CognitoFrontendStackProps) {
    super(scope, id, props)

    const [userPool, userPoolDomain, userPoolClient] = this.createCognitoUserPool(
      props.alb,
      props.googleClientId,
      props.googleClientSecretArn,
      props.appDomain,
    )
    this.userPool = userPool
    this.userPoolDomain = userPoolDomain
    this.userPoolClient = userPoolClient

    this.s3Bucket = this.createStaticWebsite(props.assetPath)

    this.cloudfrontDistribution = this.createCloudFrontDistribution(
      this.s3Bucket,
      props.alb,
      props.customHeaderSecret,
      props.cloudfrontCertificate,
      props.webAcl,
      props.appDomain,
    )

    this.route53DistAlias = this.createRoute53DistAlias(
      this.cloudfrontDistribution,
      props.awsDnsZoneName,
      props.appDomain,
    )
  }

  private createCognitoUserPool(
    lb: elbv2.IApplicationLoadBalancer,
    googleClientId: string,
    googleClientSecretArn: string,
    appDomain: string,
  ) {
    const userPool = new cognito.UserPool(this, 'user-pool', {
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const userPoolDomain = userPool.addDomain('user-pool-domain', {
      cognitoDomain: {
        domainPrefix: 'ospatil-examples',
      },
    })

    const googleClientSecret = secretsmanager.Secret.fromSecretAttributes(this, 'google-secret', {
      secretCompleteArn: googleClientSecretArn,
    }).secretValue

    const provider = new cognito.UserPoolIdentityProviderGoogle(this, 'google-provider', {
      clientId: googleClientId,
      clientSecretValue: googleClientSecret,
      userPool,
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
    })

    const userPoolCLient = userPool.addClient('user-pool-client', {
      userPoolClientName: 'aws-examples-client',
      generateSecret: true,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          `https://${appDomain}/oauth2/idpresponse`,
          `https://${lb.loadBalancerDnsName}/oauth2/idpresponse`,
        ],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
      accessTokenValidity: Duration.minutes(5),
      idTokenValidity: Duration.minutes(5),
      refreshTokenValidity: Duration.days(7),
    })

    // make sure provider is created before client
    userPoolCLient.node.addDependency(provider)

    return [userPool, userPoolDomain, userPoolCLient] as const
  }

  private createStaticWebsite(assetPath: string) {
    // create S3 bucket, upload index.html, and create CloudFront distribution
    const s3Bucket = new s3.Bucket(this, 'website', {
      bucketName: 'aws-examples-s3-bucket',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    const depl = new s3Deploy.BucketDeployment(this, 'bucket-deployment', {
      destinationBucket: s3Bucket,
      sources: [s3Deploy.Source.asset(assetPath)],
    })

    depl.node.addDependency(s3Bucket)

    return s3Bucket
  }

  private createCloudFrontDistribution(
    s3Bucket: s3.IBucket,
    lb: elbv2.IApplicationLoadBalancer,
    customHeaderSecret: secretsmanager.ISecret,
    certificate: acm.ICertificate,
    webAcl: wafv2.CfnWebACL,
    appDomain: string,
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
      domainNames: [appDomain],
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

  private createRoute53DistAlias(
    distribution: cloudfront.IDistribution,
    awsDnsZoneName: string,
    appDomain: string,
  ) {
    const zone = route53.HostedZone.fromLookup(this, 'zone', {
      domainName: awsDnsZoneName,
    })

    return new route53.ARecord(this, 'cloudfront-alias', {
      zone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })
  }
}
