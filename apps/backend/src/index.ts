import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { getRuntimeKey } from 'hono/adapter'
import { cors } from 'hono/cors'

const client = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(client)

const app = new Hono()
app.use('/api/*', cors())
app.get('/api', async (c) => {
  const command = new GetCommand({ TableName: 'aws-deployment-examples', Key: { msg_id: 1 } })
  const response = await docClient.send(command)
  return c.text(response?.Item?.msg || 'Hello World!')
})

if (getRuntimeKey() === 'node') {
  serve(app)
}
