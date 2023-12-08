import * as cdk from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  AwsSdkCall,
} from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export interface PrefixListGetResourceProps {
  name?: string
}

export class PrefixListGetResource extends Construct {
  prefixListId: string
  constructor(scope: Construct, id: string, props: PrefixListGetResourceProps = {}) {
    super(scope, id)
    // use cloudfront prefix list as default
    const prefixLs = this.getPrefixList(
      props?.name || 'com.amazonaws.global.cloudfront.origin-facing',
    )
    this.prefixListId = prefixLs.getResponseField('PrefixLists.0.PrefixListId')
    new cdk.CfnOutput(this, 'prefixListId', {
      key: 'cloudfrontPrefixListId',
      value: this.prefixListId,
      exportName: 'cloudfrontPrefixListId',
    })
  }

  getPrefixList(name: string) {
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
      logRetention: 1,
    })
  }
}
