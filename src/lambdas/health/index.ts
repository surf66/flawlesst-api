import { APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status: 'ok',
      service: 'flawlesst-api',
      timestamp: new Date().toISOString(),
    }),
  };
};
