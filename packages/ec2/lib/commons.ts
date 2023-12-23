import { aws_certificatemanager as acm, aws_route53 as route53, Stack } from 'aws-cdk-lib'
import process from 'node:process'

export function createCertificate(stack: Stack, id: string) {
  const hostedZone = route53.HostedZone.fromLookup(stack, 'hosted-zone', {
    domainName: process.env.AWS_DNS_ZONE_NAME!,
  })
  return new acm.Certificate(stack, id, {
    domainName: process.env.APP_DOMAIN!,
    validation: acm.CertificateValidation.fromDns(hostedZone),
  })
}

export const customHeaderName = 'x-verify-code'

export const dynamodbTableName = 'aws-examples-messages'
