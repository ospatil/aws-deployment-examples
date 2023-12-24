import { Stack, StackProps, aws_certificatemanager as acm, aws_wafv2 as wafv2 } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createCertificate } from './commons'

export class UsEast1Stack extends Stack {
  public readonly certificate: acm.ICertificate
  public readonly webAcl: wafv2.CfnWebACL

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)
    this.certificate = createCertificate(this, 'cloudfront-cert')
    this.webAcl = this.createWebAcl()
  }

  private createWebAcl(): wafv2.CfnWebACL {
    return new wafv2.CfnWebACL(this, 'web-acl', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'MetricForWebACL',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'CRSRule',
          priority: 0,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'MetricForWebACL-CRS',
            sampledRequestsEnabled: true,
          },
        },
      ],
    })
  }
}
