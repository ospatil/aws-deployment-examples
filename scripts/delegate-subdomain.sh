#!/bin/bash -ex

if [$1 = "--create"]; then
  RESPONSE=$(aws route53 create-hosted-zone --name $AWS_DNS_ZONE_NAME --caller-reference $(date -u +%Y-%m-%dT%H:%M:%SZ))
else
  HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name $AWS_DNS_ZONE_NAME | jq -r '.HostedZones[0].Id')
  RESPONSE=$(aws route53 get-hosted-zone --id $HOSTED_ZONE_ID)
fi

# create a hosted zone in Route53 and delegate to it from the parent zone on cloudflare

NAME_SERVERS=$(echo $RESPONSE | jq -r '.DelegationSet.NameServers[]')

# get the zone id from cloudflare using httpie
CLOUDFLARE_ZONE_ID=(http GET https://api.cloudflare.com/client/v4/zones/?name=$CLOUDFLARE_ZONE_NAME Authorization:"Bearer $CLOUDFLARE_API_TOKEN" | jq -r '.result[0].id')


for SERVER in $NAME_SERVERS; do
  echo "{
    "content": "$SERVER",
    "name": "$AWS_DNS_ZONE_NAME",
    "type": "NS",
    "ttl": 86400
  }" | \
  http POST https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records \
  Content-Type:application/json \
  Authorization:"Bearer $CLOUDFLARE_API_TOKEN"
done

