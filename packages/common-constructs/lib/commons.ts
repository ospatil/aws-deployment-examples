import { aws_certificatemanager as acm, aws_route53 as route53, Stack } from 'aws-cdk-lib'

export function createCertificate(
  stack: Stack,
  id: string,
  awsDnsZoneName: string,
  appDomain: string,
) {
  const hostedZone = route53.HostedZone.fromLookup(stack, 'hosted-zone', {
    domainName: awsDnsZoneName,
  })
  return new acm.Certificate(stack, id, {
    domainName: appDomain,
    validation: acm.CertificateValidation.fromDns(hostedZone),
  })
}

export const customHeaderName = 'x-verify-code'

export const dynamodbTableName = 'aws-examples-messages'
