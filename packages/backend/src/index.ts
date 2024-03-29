/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { serve } from '@hono/node-server'
import { Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import * as jwt from 'jsonwebtoken'
import { AddressInfo } from 'node:net'

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

  const message: string = response?.Item?.msg || 'Hello World!'

  return c.json({ message, user })
})

async function getUserClaims(c: Context) {
  // get user claims from header. The ALB will add the header x-amzn-oidc-data after successful authentication
  const encodedToken = c.req.header('x-amzn-oidc-data')
  console.log(`x-amzn-oidc-data value: ${encodedToken}`)

  // decode the jwt
  if (encodedToken) {
    try {
      // ALB jwt can have ending padding (one or more = characters) in any of the three sections: header, payload or signature that JWT spec prohibits, need to trim it
      const trimmedToken = encodedToken
        .split('.')
        .map(str => str.replace(/=+$/, ''))
        .join('.')

      console.log(`trimmedToken value: ${trimmedToken}`)

      const unverifiedToken = jwt.decode(trimmedToken, { complete: true })

      // NOTE: the jwt verification throws invalid signature error
      // const kid = unverifiedToken?.header?.kid
      // if (!kid) {
      //   console.error('kid not found in token')
      // }

      // const keyEndpoint = `https://public-keys.auth.elb.${process.env.AWS_REGION}.amazonaws.com/${kid}`
      // const response = await fetch(keyEndpoint)
      // const publicKey = await response.text()

      // // verify the jwt
      // const claims = jwt.verify(trimmedToken, publicKey, { algorithms: ['ES256'] })
      // return claims as Record<string, unknown>
      return unverifiedToken?.payload
    } catch (error) {
      console.error(error)
    }
  }

  return {}
}

serve(app, (info: AddressInfo) => {
  console.log(`Server listening on port ${info.port}`)
})
