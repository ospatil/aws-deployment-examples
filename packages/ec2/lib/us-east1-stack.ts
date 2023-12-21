import {
  ArnFormat,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_elasticloadbalancingv2 as elbv2,
  aws_cloudfront_origins as origins,
  aws_s3 as s3,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import process from 'node:process'
import { createCertificate } from './utils'

export type UsEast1StackProps = StackProps & {
  s3Bucket: s3.Bucket
  lb: elbv2.ApplicationLoadBalancer
}

export class UsEast1Stack extends Stack {
  constructor(scope: Construct, id: string, props: UsEast1StackProps) {
    super(scope, id, props)

    const certificate = createCertificate(this, 'cloudfront-cert')

    const distribution = this.createCloudFrontDistribution(props.s3Bucket, props.lb, certificate)
  }

  private createCloudFrontDistribution(
    s3Bucket: s3.Bucket,
    lb: elbv2.ApplicationLoadBalancer,
    certificate: acm.Certificate,
  ) {
    const distribution = new cloudfront.Distribution(this, 'distribution', {
      comment: 'CloudFront distribution for aws-examples',
      domainNames: [process.env.APP_DOMAIN!],
      certificate,
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
