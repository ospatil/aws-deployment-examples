import { Duration, custom_resources as cr, aws_iam as iam, aws_logs as logs } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export type DynamoDBInsertResourceProps = {
  tableName: string
  tableArn: string
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
    const awsSdkCall: cr.AwsSdkCall = {
      // service: 'DynamoDB',
      service: 'dynamodb',
      action: 'putItem',
      physicalResourceId: cr.PhysicalResourceId.of(props.tableName + '_insert'),
      parameters: {
        TableName: props.tableName,
        Item: item,
      },
    }

    const customResource = new cr.AwsCustomResource(this, props.tableName + '_custom_resource', {
      onCreate: awsSdkCall,
      onUpdate: awsSdkCall,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          sid: 'DynamoWriteAccess',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:PutItem'],
          resources: [props.tableArn],
        }),
      ]),
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: Duration.minutes(1),
    })
  }
}
