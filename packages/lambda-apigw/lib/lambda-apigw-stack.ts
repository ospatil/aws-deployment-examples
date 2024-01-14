import {
  CfnOutput,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_apigateway as apigw,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
} from 'aws-cdk-lib'
import { DynamoDBInsertResource, dynamodbTableName } from 'common-constructs'
import { Construct } from 'constructs'
import * as path from 'node:path'

export class LambdaApigwStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(dynamodbTableName, dynamodbTable.tableArn)
    const apiFn = this.createLambdaFunction()
    dynamodbTable.grantReadData(apiFn)
    const apiGw = this.createApiGateway(apiFn)

    const apiGwUrl = new CfnOutput(this, 'apiGwUrl', {
      key: 'apiGatewayUrl',
      value: apiGw.url,
    })
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

  private createLambdaFunction() {
    const fn = new lambdaNodejs.NodejsFunction(this, 'apiFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.resolve(process.cwd(), '../backend/src/index.ts'),
      environment: {},
    })

    fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    })

    return fn
  }

  private createApiGateway(apiFn: lambdaNodejs.NodejsFunction) {
    return new apigw.LambdaRestApi(this, 'api', {
      handler: apiFn,
    })
  }
}
