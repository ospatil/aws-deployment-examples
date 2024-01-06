#!/usr/bin/env node
import { App } from 'aws-cdk-lib'
import { UsEast1Stack } from 'common-constructs' // eslint-disable-line import/no-extraneous-dependencies
import process from 'node:process'
import 'source-map-support/register'
import { EcsStack } from '../lib/ecs-stack'

const app = new App()

const usEast1Stack = new UsEast1Stack(app, 'UsEast1Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  awsDnsZoneName: process.env.AWS_DNS_ZONE_NAME!,
  appDomain: process.env.APP_DOMAIN!,
  crossRegionReferences: true,
})

const ecsStack = new EcsStack(app, 'EcsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_PRIMARY_REGION,
  },
  crossRegionReferences: true,
  cloudfrontCertificate: usEast1Stack.certificate,
  webAcl: usEast1Stack.webAcl,
})
