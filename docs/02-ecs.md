# Frontend on S3, backend on ECS with CloudFront, ALB and Cognito authentication with google

## Architecture

![Architecture](./ecs.webp)

## Initial Setup

1. In frontend project, `./packages/frontend`, create two files `.env.local` and `.env.production` with contents as mentioned in the `env.example` file.
2. In the `ecs` cdk project, `./packages/ecs`, link the `common-constructs` project: `npm run link:common-constructs`

## Build and deployment

1. Build frontend: `npm run build -w frontend`
2. Build the cdk project: `npm run build -w ecs`
3. Change into the `ecs` directory: `cd packages/ecs`
4. Build the project: `npm run build`
5. Assume the correct AWS profile.
6. Deploy the stack: `npx cdk deploy --all`
