import { Duration, custom_resources as cr, aws_ec2 as ec2 } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export type PrefixListGetResourceProps = {
  name: string
}

export class PrefixListGetResource extends Construct {
  public readonly prefixList: ec2.IPrefixList
  constructor(scope: Construct, id: string, props: PrefixListGetResourceProps) {
    super(scope, id)

    const prefixListId = new cr.AwsCustomResource(this, 'GetPrefixListId', {
      onUpdate: {
        service: 'ec2',
        action: 'DescribeManagedPrefixListsCommand',
        parameters: {
          Filters: [
            {
              Name: 'prefix-list-name',
              Values: [props.name],
            },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${id}-${this.node.addr.slice(0, 16)}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      timeout: Duration.minutes(1),
    }).getResponseField('PrefixLists.0.PrefixListId')

    this.prefixList = ec2.PrefixList.fromPrefixListId(this, 'PrefixList', prefixListId)
  }
}
