import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

// it will use AWS_REGION set by userdata script that fetches from instance metadata
const client = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(client)

const app = new Hono()
app.use('*', logger())
app.use('/api/*', cors())

app.get('/api/healthz', c => {
  return c.text('ok')
})

/*
  By the time request hits this endpoint, it has already been authenticated by the ALB using Cognito.
  Simply redirect to the redirect_uri sent by the SPA.
*/
app.get('/api/login', c => {
  const redirectUri = c.req.query('redirect_uri')
  console.log(`/api/login endpoint: redirecting to ${redirectUri}`)
  return c.redirect(redirectUri!)
})

app.get('/api/messages', async c => {
  const command = new GetCommand({ TableName: 'aws-examples-messages', Key: { id: 1 } })
  const response = await docClient.send(command)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return c.text(response?.Item?.msg || 'Hello World!')
})

if (getRuntimeKey() === 'node') {
  serve(app)
}
