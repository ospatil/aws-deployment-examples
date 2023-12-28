import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { serve } from '@hono/node-server'
import { Context, Hono } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import * as jwt from 'jsonwebtoken'

// it will use AWS_REGION set by userdata script that fetches from instance metadata
const client = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(client)

const app = new Hono()
app.use('*', logger())
app.use('/api/*', cors())

app.get('/api/healthz', c => {
  return c.text('ok')
})

app.get('/api/messages', async c => {
  const command = new GetCommand({ TableName: 'aws-examples-messages', Key: { id: 1 } })
  const response = await docClient.send(command)

  const user = await getUserClaims(c)

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const message: string = response?.Item?.msg || 'Hello World!'

  return c.json({ message, user })
})

async function getUserClaims(c: Context) {
  // get user claims from header. The ALB will add the header x-amzn-oidc-data after successful authentication
  const encodedJwt = c.req.header('x-amzn-oidc-data')!
  // decode the jwt
  try {
    const decodedJwt = jwt.decode(encodedJwt, { complete: true })!
    const kid = decodedJwt.header.kid // get the public key from the jwks endpoint
    const keyEndpoint = `https://public-keys.auth.elb.${process.env.AWS_REGION}.amazonaws.com/${kid}`
    const response = await fetch(keyEndpoint)
    const publicKey = await response.text()

    // verify the jwt
    const claims = jwt.verify(encodedJwt, publicKey, { algorithms: ['ES256'] })
    return claims
  } catch (error) {
    console.error(error)
  }

  return {}
}

if (getRuntimeKey() === 'node') {
  serve(app)
}
