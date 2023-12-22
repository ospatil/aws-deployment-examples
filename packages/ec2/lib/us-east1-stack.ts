import { Stack, StackProps, aws_certificatemanager as acm } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { createCertificate } from './utils'

export class UsEast1Stack extends Stack {
  public readonly certificate: acm.ICertificate
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.certificate = createCertificate(this, 'cloudfront-cert')
  }
}
