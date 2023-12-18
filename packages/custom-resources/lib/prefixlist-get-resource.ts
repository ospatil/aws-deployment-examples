import { Duration, aws_ec2 as ec2 } from 'aws-cdk-lib'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  type AwsSdkCall,
} from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export type PrefixListGetResourceProps = {
  vpc: ec2.Vpc
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
    const awsSdkCall: AwsSdkCall = {
      service: '@aws-sdk/client-ec2',
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

    return new AwsCustomResource(this, 'prefixlist_custom_resource', {
      onUpdate: awsSdkCall,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      timeout: Duration.minutes(5),
      logRetention: RetentionDays.ONE_DAY,
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    })
  }
}
