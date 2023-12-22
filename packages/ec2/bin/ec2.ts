#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import process from 'node:process'
import 'source-map-support/register'
import { Ec2Stack } from '../lib/ec2-stack'
import { UsEast1Stack } from '../lib/us-east1-stack'

const app = new cdk.App()

const usEast1Stack = new UsEast1Stack(app, 'UsEast1Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
})

const ec2Stack = new Ec2Stack(app, 'Ec2Stack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_PRIMARY_REGION,
  },
  crossRegionReferences: true,
  cloudfrontCertificate: usEast1Stack.certificate,
})
