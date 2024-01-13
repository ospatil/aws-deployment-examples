import { RemovalPolicy, Stack, StackProps, aws_dynamodb as dynamodb } from 'aws-cdk-lib'
import { DynamoDBInsertResource, dynamodbTableName } from 'common-constructs'
import { Construct } from 'constructs'

export class LambdaApigwStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(dynamodbTableName, dynamodbTable.tableArn)
  }

  private createDynamodb() {
    return new dynamodb.Table(this, dynamodbTableName, {
      tableName: dynamodbTableName,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private addDynamoDBRecord(tableName: string, tableArn: string) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn })
  }
}
