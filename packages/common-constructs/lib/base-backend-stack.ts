import {
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { dynamodbTableName } from './commons'
import { DynamoDBInsertResource } from './dynamodb-insert-resource'
import { PrefixListGetResource } from './prefixlist-get-resource'

export class BaseBackendStack extends NestedStack {
  public readonly vpc: ec2.IVpc
  public readonly dynamodbTable: dynamodb.ITableV2
  public readonly prefixList: ec2.IPrefixList
  public readonly customHeaderSecret: secretsmanager.ISecret
  public readonly albSg: ec2.ISecurityGroup

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props)

    this.vpc = this.createVpc()
    this.dynamodbTable = this.createDynamodb()
    this.addDynamoDBRecord(dynamodbTableName, this.dynamodbTable.tableArn, this.vpc)
    this.prefixList = new PrefixListGetResource(this, 'prefixlist', {
      name: 'com.amazonaws.global.cloudfront.origin-facing',
    }).prefixList
    this.customHeaderSecret = this.createCustomHeaderSecret()
    this.albSg = this.createAlbSg(this.vpc, this.prefixList)
  }

  private createVpc() {
    return new ec2.Vpc(this, 'vpc', {
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

  private addDynamoDBRecord(tableName: string, tableArn: string, vpc: ec2.IVpc) {
    return new DynamoDBInsertResource(this, 'dynamodb-insert', { tableName, tableArn })
  }

  private createCustomHeaderSecret() {
    return new secretsmanager.Secret(this, 'custom-header-secret', {
      secretName: 'aws-examples-custom-header-secret',
      generateSecretString: {
        // exclude special characters to avoid escaping in the shell
        excludeCharacters: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
        requireEachIncludedType: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    })
  }

  private createAlbSg(vpc: ec2.IVpc, prefixList: ec2.IPrefixList) {
    const albSg = new ec2.SecurityGroup(this, 'lb-sg', {
      vpc,
      securityGroupName: 'aws-examples-lb-sg',
      description: 'Security group for ALB',
    })
    albSg.addIngressRule(
      ec2.Peer.prefixList(prefixList.prefixListId),
      ec2.Port.tcp(443),
      'Allow access from cloudfront',
    )
    return albSg
  }
}
