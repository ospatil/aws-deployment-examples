import { Duration, aws_ec2 as ec2 } from 'aws-cdk-lib'
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  type AwsSdkCall,
} from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export type DynamoDBInsertResourceProps = {
  tableName: string
  tableArn: string
  vpc: ec2.Vpc
}

export class DynamoDBInsertResource extends Construct {
  constructor(scope: Construct, id: string, props: DynamoDBInsertResourceProps) {
    super(scope, id)

    this.insertRecord(props, {
      id: { N: '001' },
      msg: { S: 'Happy AWS learning!' },
    })
  }

  insertRecord(props: DynamoDBInsertResourceProps, item: unknown) {
    const awsSdkCall: AwsSdkCall = {
      // service: 'DynamoDB',
      service: '@aws-sdk/client-dynamodb',
      action: 'putItem',
      physicalResourceId: PhysicalResourceId.of(props.tableName + '_insert'),
      parameters: {
        TableName: props.tableName,
        Item: item,
      },
    }

    const customResource: AwsCustomResource = new AwsCustomResource(
      this,
      props.tableName + '_custom_resource',
      {
        onCreate: awsSdkCall,
        onUpdate: awsSdkCall,
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            sid: 'DynamoWriteAccess',
            effect: Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [props.tableArn],
          }),
        ]),
        logRetention: RetentionDays.ONE_DAY,
        timeout: Duration.minutes(5),
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    )
  }
}
