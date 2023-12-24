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

app.get('/api/messages', async c => {
  console.log('/api/messages endpoint called')
  const command = new GetCommand({ TableName: 'aws-examples-messages', Key: { id: 1 } })
  const response = await docClient.send(command)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return c.text(response?.Item?.msg || 'Hello World!')
})

if (getRuntimeKey() === 'node') {
  serve(app)
}
