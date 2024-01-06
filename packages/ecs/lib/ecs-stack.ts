import {
  Duration,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecr_assets as ecrAssets,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_logs as logs,
  aws_route53 as route53,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib'
import { BaseBackendStack, CognitoFrontendStack } from 'common-constructs' // eslint-disable-line import/no-extraneous-dependencies
import { Construct } from 'constructs'
import * as path from 'node:path'
import process from 'node:process'

export type EcsStackProps = StackProps & {
  cloudfrontCertificate: acm.ICertificate
  webAcl: wafv2.CfnWebACL
}

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props)

    const baseBackendStack = new BaseBackendStack(this, 'base-backend-stack')

    const vpc = baseBackendStack.vpc
    const albSg = baseBackendStack.albSg
    const dynamodbTable = baseBackendStack.dynamodbTable
    const customHeaderSecret = baseBackendStack.customHeaderSecret

    const taskRole = this.createTaskRole(dynamodbTable.tableArn)
    const serviceSg = this.createServiceSg(vpc, albSg)

    const loadBalancedFargateService = this.createEcsClusterAndService(vpc, serviceSg, taskRole)

    const lb = loadBalancedFargateService.loadBalancer
    lb.addSecurityGroup(albSg)

    const cognitoFrontendStack = new CognitoFrontendStack(this, 'cognito-frontend-stack', {
      alb: lb,
      googleClientId: process.env.GOOGLE_CLIENT_ID!,
      googleClientSecretArn: process.env.GOOGLE_CLIENT_SECRET_ARN!,
      awsDnsZoneName: process.env.AWS_DNS_ZONE_NAME!,
      appDomain: process.env.APP_DOMAIN!,
      assetPath: path.resolve(process.cwd(), '../frontend/dist'),
      customHeaderSecret,
      cloudfrontCertificate: props.cloudfrontCertificate,
      webAcl: props.webAcl,
    })
  }

  private createTaskRole(tableArn: string): iam.IRole {
    const dynamodbPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
          resources: [tableArn],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:assumeRole'],
          conditions: {
            ArnLike: {
              'aws:SourceArn': `arn:aws:ecs:${process.env.AWS_PRIMARY_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:*`,
            },
          },
        }),
      ],
    })

    return new iam.Role(this, 'task-role', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'aws-examples-ecs-task-role',
      inlinePolicies: {
        dynamodbPolicy,
      },
    })
  }

  private createServiceSg(vpc: ec2.IVpc, albSg: ec2.ISecurityGroup) {
    const sg = new ec2.SecurityGroup(this, 'service-sg', {
      vpc,
      securityGroupName: 'aws-examples-service-sg',
    })

    sg.addIngressRule(
      ec2.Peer.securityGroupId(albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow access from ALB',
    )

    return sg
  }

  private createEcsClusterAndService(
    vpc: ec2.IVpc,
    serviceSg: ec2.ISecurityGroup,
    taskRole: iam.IRole,
  ) {
    const cluster = new ecs.Cluster(this, 'cluster', {
      vpc,
      clusterName: 'aws-examples-ecs-cluster',
    })

    const loadBalancedFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'ecs-service',
      {
        assignPublicIp: false,
        cluster,
        desiredCount: 1,
        domainName: process.env.APP_DOMAIN!,
        domainZone: route53.HostedZone.fromLookup(this, 'zone', {
          domainName: process.env.AWS_DNS_ZONE_NAME!,
        }),
        healthCheckGracePeriod: Duration.seconds(60),
        openListener: false,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        publicLoadBalancer: false,
        securityGroups: [serviceSg],
        taskDefinition: this.createTaskDefinition(taskRole),
      },
    )

    return loadBalancedFargateService
  }

  private createTaskDefinition(taskRole: iam.IRole) {
    const taskDef = new ecs.FargateTaskDefinition(this, 'task-def', {
      taskRole,
      memoryLimitMiB: 512,
      cpu: 256,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    })

    taskDef.addContainer('aws-examples-api', {
      memoryLimitMiB: 512,
      cpu: 512,
      image: ecs.ContainerImage.fromDockerImageAsset(
        new ecrAssets.DockerImageAsset(this, 'docker-image-asset', {
          directory: path.join(process.cwd(), '..', 'backend'),
        }),
      ),
      environment: {
        AWS_REGION: process.env.AWS_PRIMARY_REGION!,
      },
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'aws-examples-api',
        logRetention: logs.RetentionDays.ONE_DAY,
      }),
      portMappings: [
        {
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    })

    return taskDef
  }
}
