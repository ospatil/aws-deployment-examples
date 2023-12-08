import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import { Construct } from 'constructs'
import { DynamoDBInsertResource, PrefixListGetResource } from 'custom-resources'

export class Ec2Stack extends cdk.Stack {
  dynamodbTableName = 'aws-examples-messages'
  dynamoTablePartitionKeyName = 'id'

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // create dynamodb table
    const dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(this.dynamodbTableName, dynamodbTable.tableArn)

    const prefixList = new PrefixListGetResource(this, 'prefixlist')

    const vpc = this.createVpc()

    // create SG for LB
    const albSg = new ec2.SecurityGroup(this, 'aws-examples-lb-sg', {
      vpc,
      securityGroupName: 'aws-examples-lb-sg',
      description: 'Security group for ALB',
    })
    albSg.addIngressRule(
      ec2.Peer.prefixList(prefixList.prefixListId),
      ec2.Port.tcp(443),
      'Allow access from cloudfront',
    )

    // create SG for ASG
    const asgSg = new ec2.SecurityGroup(this, 'aws-examples-asg-sg', {
      vpc,
      securityGroupName: 'aws-examples-asg-sg',
      description: 'Security group for ASG',
    })
    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow access from ALB',
    )
  }

  createVpc() {
    return new ec2.Vpc(this, 'aws-examples-vpc', {
      vpcName: 'aws-examples-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
      gatewayEndpoints: {
        DYNAMODB: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
        },
      },
    })
  }

  createDynamodb() {
    return new dynamodb.Table(this, this.dynamodbTableName, {
      tableName: this.dynamodbTableName,
      partitionKey: {
        name: this.dynamoTablePartitionKeyName,
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    })
  }

  addDynamoDBRecord(tableName: string, tableArn: string) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn })
  }
}
