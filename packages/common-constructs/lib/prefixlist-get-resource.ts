import { Duration, custom_resources as cr, aws_ec2 as ec2, aws_logs as logs } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export type PrefixListGetResourceProps = {
  vpc: ec2.IVpc
  name?: string
}

export class PrefixListGetResource extends Construct {
  public readonly prefixListId: string
  constructor(scope: Construct, id: string, props: PrefixListGetResourceProps) {
    super(scope, id)
    // use cloudfront prefix list as default
    const prefixLs = this.getPrefixList(
      props.name ?? 'com.amazonaws.global.cloudfront.origin-facing',
      props,
    )
    this.prefixListId = prefixLs.getResponseField('PrefixLists.0.PrefixListId')
  }

  getPrefixList(name: string, props: PrefixListGetResourceProps) {
    const awsSdkCall: cr.AwsSdkCall = {
      service: 'ec2',
      action: 'DescribeManagedPrefixLists',
      physicalResourceId: {},
      parameters: {
        filters: [
          {
            Name: 'prefix-list-name',
            Values: [name],
          },
        ],
      },
    }

    return new cr.AwsCustomResource(this, 'prefixlist_custom_resource', {
      onUpdate: awsSdkCall,
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_DAY,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    })
  }
}
