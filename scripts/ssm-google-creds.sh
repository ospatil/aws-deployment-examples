#!/bin/bash -ex

# Read GOOGLE_CLIENT_ID
read -p "GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
# Read GOOGLE_CLIENT_SECRET
echo -n "GOOGLE_CLIENT_SECRET: "
read -s GOOGLE_CLIENT_SECRET

aws ssm put-parameter \
    --name "/aws-examples/google-client-id" \
    --value "$GOOGLE_CLIENT_ID"

aws ssm put-parameter \
    --name "/aws-examples/google-client-secret" \
    --value "$GOOGLE_CLIENT_SECRET" \
    --type "SecureString"
