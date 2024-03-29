# AWS Deployment Examples

Set of examples to demonstrate the various ways applications can be deployed on AWS using [AWS CDK](https://aws.amazon.com/cdk/).

## Prerequisites

1. Node.js 20.x
2. [direnv](https://direnv.net/)
3. curl
4. [httpie](https://httpie.io/) (optional - only needed for the domain configuration script `./scripts/delegate-subdomain.sh`)
5. AWS CLI with account setup. (<https://www.granted.dev> is a great tool for switching profiles.)
6. `aws-cdk` and `yalc`: `npm i -g aws-cdk yalc`. `Yalc` is a tool to work easily with npm packages locally.

## Initial setup

* Clone the repository. It's a monorepo with application projects in the `packages` folder.
* Install dependencies.
  * Root folder: `npm i`
  * Install dependencies of all the projects: `npm i -ws`
* The `common-constructs` project is an *aws cdk* library project with custom resources and common constructs.
  * Build the project: `npm run build -w common-constructs`
  * Publish it to `yalc`: `npm run yalc:publish -w common-constructs`
* Create `.env`. The `env-example` file can be used as a template for it.
* **Domain setup**
  * I use *Cloudflare* as my DNS provider and wanted to delegate only a sub-domain to *Route53*. The script `./scripts/delegate-subdomain.sh` does that.
  * Update the `.env` file with necessary information.
* OIDC authentication:
  * Create *Google* credentials for OIDC authentication.
  * Once created, run the script `./scripts/create-google-secret.sh` to create a AWS Secrets Manager secret for Google client secret.
  * Update `.env` file with Google Client Id and ARN of the secret.

## Examples

1. [Frontend on S3, backend on EC2 with CloudFront, ALB and Cognito authentication with google](./docs/01-ec2.md)
2. [Frontend on S3, backend on ECS with CloudFront, ALB and Cognito authentication with google](./docs/02-ecs.md)
