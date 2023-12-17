import { Duration } from 'aws-cdk-lib'
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  type AwsSdkCall,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources'
import { Construct } from 'constructs'

export type DynamoDBInsertResourceProps = {
  tableName: string
  tableArn: string
}

export class DynamoDBInsertResource extends Construct {
  constructor(scope: Construct, id: string, props: DynamoDBInsertResourceProps) {
    super(scope, id)

    this.insertRecord(props.tableName, props.tableArn, {
      id: { N: '001' },
      msg: { S: 'Happy AWS learning!' },
    })
  }

  insertRecord(tableName: string, tableArn: string, item: unknown) {
    const awsSdkCall: AwsSdkCall = {
      // service: 'DynamoDB',
      service: '@aws-sdk/client-dynamodb',
      action: 'putItem',
      physicalResourceId: PhysicalResourceId.of(tableName + '_insert'),
      parameters: {
        TableName: tableName,
        Item: item,
      },
    }

    const customResource: AwsCustomResource = new AwsCustomResource(
      this,
      tableName + '_custom_resource',
      {
        onCreate: awsSdkCall,
        onUpdate: awsSdkCall,
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            sid: 'DynamoWriteAccess',
            effect: Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [tableArn],
          }),
        ]),
        timeout: Duration.minutes(5),
      },
    )
  }
}
