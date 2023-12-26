#!/bin/bash -ex

# Read GOOGLE_CLIENT_SECRET
echo -n "GOOGLE_CLIENT_SECRET: "
read -s GOOGLE_CLIENT_SECRET

aws secretsmanager create-secret \
  --name google_client_secret \
  --secret-string "$GOOGLE_CLIENT_SECRET"
  --description "Google Client Secret for AWS examplesr"
