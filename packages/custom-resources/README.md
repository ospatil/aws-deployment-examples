# AWS CDK Custom Resources

This is a CDK Construct Library project that contains the following custom resources:

1. `prefixlist-get-resource`: gets the AWS cloudfront prefix list used to configure ALB security group to restrict access only from cloudfront.
2. `dynamodb-insert-resource`: inserts a record into DynamoDB table to be used in the application

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
