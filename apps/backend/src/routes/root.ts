import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { FastifyPluginAsync } from 'fastify'

const client = new DynamoDBClient()
const docClient = DynamoDBDocumentClient.from(client)

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/', async function (request, reply) {
    const command = new GetCommand({ TableName: 'aws-deployment-examples', Key: { msg_id: 1 } })
    const response = await docClient.send(command)
    return response?.Item?.msg || 'Hello World!'
  })
}

export default root
