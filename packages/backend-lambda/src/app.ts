import middy from '@middy/core'
import cors from '@middy/http-cors'
import httpHeaderNormalizer from '@middy/http-header-normalizer'
import httpRouterHandler, { Method } from '@middy/http-router'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'hello world',
      }),
    }
  } catch (err) {
    console.log(err)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'some error happened',
      }),
    }
  }
}

const routes = [
  {
    method: 'GET' as Method,
    path: '/api/messages',
    handler: lambdaHandler,
  },
]

export const handler = middy()
  .use(httpHeaderNormalizer())
  .use(cors())
  .handler(httpRouterHandler(routes))
