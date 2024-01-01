import {
  Duration,
  Stack,
  StackProps,
  aws_certificatemanager as acm,
  aws_elasticloadbalancingv2_actions as actions,
  aws_autoscaling as asg,
  aws_cognito as cognito,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_secretsmanager as secretsmanager,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  BaseBackendStack,
  CognitoFrontendStack,
  createCertificate,
  customHeaderName,
} from 'common-constructs'
import { Construct } from 'constructs'
import * as execa from 'execa'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

export type Ec2StackProps = StackProps & {
  cloudfrontCertificate: acm.ICertificate
  webAcl: wafv2.CfnWebACL
}

export class Ec2Stack extends Stack {
  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props)

    const baseBackendStack = new BaseBackendStack(this, 'base-backend-stack')

    const vpc = baseBackendStack.vpc
    const albSg = baseBackendStack.albSg
    const dynamodbTable = baseBackendStack.dynamodbTable
    const customHeaderSecret = baseBackendStack.customHeaderSecret

    const asgSg = this.createAsgSg(vpc, albSg)

    const instanceConnectEp = this.createInstanceConnectEp(vpc, asgSg)

    const launchTemplate = this.createLaunchTemplate(asgSg, dynamodbTable.tableArn)

    const asg = this.createAutoScalingGroup(vpc, launchTemplate)

    const certificate = createCertificate(
      this,
      'alb-cert',
      process.env.AWS_DNS_ZONE_NAME!,
      process.env.APP_DOMAIN!,
    )

    const [lb, tg, listener] = this.createLoadBalancer(vpc, albSg, asg, certificate)

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

    this.addListenerRule(
      listener,
      tg,
      customHeaderSecret,
      cognitoFrontendStack.userPool,
      cognitoFrontendStack.userPoolDomain,
      cognitoFrontendStack.userPoolClient,
    )
  }

  private createAsgSg(vpc: ec2.IVpc, albSg: ec2.ISecurityGroup) {
    const asgSg = new ec2.SecurityGroup(this, 'asg-sg', {
      vpc,
      securityGroupName: 'aws-examples-asg-sg',
      description: 'Security group for ASG',
    })
    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(albSg.securityGroupId),
      ec2.Port.tcp(3000),
      'Allow access from ALB',
    )
    return asgSg
  }

  private createInstanceConnectEp(vpc: ec2.IVpc, asgSg: ec2.SecurityGroup) {
    // get the EC2_INSTANCE_CONNECT CIDR for ca-central-1
    // const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json | jq -r '.prefixes[] | select(.region=="ca-central-1") | select(.service=="EC2_INSTANCE_CONNECT") | .ip_prefix'`
    const cmd = `curl -s https://ip-ranges.amazonaws.com/ip-ranges.json`

    type IpRange = {
      prefixes: Array<{ service: string; region: string; ip_prefix: string }>
    }
    const { stdout } = execa.commandSync(cmd)
    const ipRanges: IpRange = JSON.parse(stdout) as IpRange
    // const ipRanges = JSON.parse(stdout)
    const requestObject = ipRanges.prefixes.find(
      (p: Record<string, string>) =>
        p.service === 'EC2_INSTANCE_CONNECT' && p.region === process.env.AWS_PRIMARY_REGION,
    )
    const instanceConnectSg = new ec2.SecurityGroup(this, 'instance-connect-sg', {
      vpc,
      securityGroupName: 'aws-examples-instance-connect-sg',
      description: 'Security group for Instance Connect',
      allowAllOutbound: true,
    })

    if (requestObject) {
      instanceConnectSg.addIngressRule(
        ec2.Peer.ipv4(requestObject.ip_prefix),
        ec2.Port.tcp(22),
        'Allow access from AWS console',
      )
    }

    asgSg.addIngressRule(
      ec2.Peer.securityGroupId(instanceConnectSg.securityGroupId),
      ec2.Port.tcp(22),
      'Allow access from Instance Connect',
    )

    return new ec2.CfnInstanceConnectEndpoint(this, 'instance-connect-ep', {
      subnetId: vpc.privateSubnets[0].subnetId,
      securityGroupIds: [instanceConnectSg.securityGroupId],
    })
  }

  private createLaunchTemplate(asgSg: ec2.ISecurityGroup, tableArn: string) {
    const userDataScript = readFileSync('./lib/user-data.sh', 'utf8')

    const cloudwatchLogsPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
            'logs:PutRetentionPolicy',
          ],
          resources: ['*'],
        }),
      ],
    })

    // create a policy document with permissions to read from a single dynamodb table
    const dynamodbPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem'],
          resources: [tableArn],
        }),
      ],
    })

    const role = new iam.Role(this, 'instance-role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      // managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBReadOnlyAccess')],
      inlinePolicies: {
        cloudwatchLogsPolicy,
        dynamodbPolicy,
      },
    })

    return new ec2.LaunchTemplate(this, 'launch-template', {
      launchTemplateName: 'aws-examples-launch-template',
      securityGroup: asgSg,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      userData: ec2.UserData.custom(userDataScript),
    })
  }

  private createAutoScalingGroup(vpc: ec2.IVpc, launchTemplate: ec2.LaunchTemplate) {
    return new asg.AutoScalingGroup(this, 'asg', {
      vpc,
      launchTemplate,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
    })
  }

  private createLoadBalancer(
    vpc: ec2.IVpc,
    albSg: ec2.ISecurityGroup,
    asg: asg.AutoScalingGroup,
    certificate: acm.ICertificate,
  ) {
    const alb: elbv2.IApplicationLoadBalancer = new elbv2.ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'aws-examples-alb',
      securityGroup: albSg,
    })

    const tg = new elbv2.ApplicationTargetGroup(this, 'asg-target', {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [asg],
      healthCheck: {
        path: '/api/healthz',
        interval: Duration.minutes(1),
      },
    })

    const listener = alb.addListener('listener', {
      port: 443,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
      defaultAction: elbv2.ListenerAction.fixedResponse(403),
    })

    return [alb, tg, listener] as const
  }

  private addListenerRule(
    listener: elbv2.ApplicationListener,
    tg: elbv2.ApplicationTargetGroup,
    customHeaderSecret: secretsmanager.ISecret,
    userPool: cognito.IUserPool,
    userPoolDomain: cognito.IUserPoolDomain,
    userPoolClient: cognito.IUserPoolClient,
  ) {
    const cognitoCommonProps = {
      userPool,
      userPoolClient,
      userPoolDomain,
      sessionTimeout: Duration.minutes(5),
    }

    const commonConditions = [
      elbv2.ListenerCondition.httpHeader(customHeaderName, [
        customHeaderSecret.secretValue.unsafeUnwrap(),
      ]),
    ]

    listener.addAction('login', {
      action: new actions.AuthenticateCognitoAction({
        ...cognitoCommonProps,
        onUnauthenticatedRequest: elbv2.UnauthenticatedAction.AUTHENTICATE,
        next: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          host: process.env.APP_DOMAIN!,
          path: '/',
        }),
      }),
      priority: 10,
      conditions: [...commonConditions, elbv2.ListenerCondition.pathPatterns(['/api/login'])],
    })

    listener.addAction('api', {
      action: new actions.AuthenticateCognitoAction({
        ...cognitoCommonProps,
        onUnauthenticatedRequest: elbv2.UnauthenticatedAction.DENY,
        next: elbv2.ListenerAction.forward([tg]),
      }),
      priority: 20,
      conditions: [...commonConditions, elbv2.ListenerCondition.pathPatterns(['/api/*'])],
    })
  }
}
