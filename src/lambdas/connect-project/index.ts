import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as https from 'https';

const GITHUB_API_BASE = 'api.github.com';

const webhookUrl = process.env.GITHUB_WEBHOOK_URL as string | undefined;
const webhookSecretBase = process.env.GITHUB_WEBHOOK_SECRET_BASE as string | undefined;

const createRepoSecret = (owner: string, repo: string): string => {
  if (!webhookSecretBase) {
    // Fall back to a static (but clearly invalid) secret if misconfigured
    return 'MISSING_WEBHOOK_SECRET_BASE';
  }

  // Simple deterministic per-repo secret derivation.
  // This keeps the actual secret value opaque while allowing
  // the webhook listener to recompute it from repository.full_name.
  const data = `${owner}/${repo}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + data.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash |= 0; // Convert to 32bit integer
  }
  return `${webhookSecretBase}_${Math.abs(hash)}`;
};

const callGitHub = (token: string, owner: string, repo: string, body: unknown): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body);

    const options: https.RequestOptions = {
      hostname: GITHUB_API_BASE,
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'flawlesst-api',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode ?? 0, body: responseBody });
      });
    });

    req.on('error', (err) => reject(err));

    req.write(jsonBody);
    req.end();
  });
};

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!webhookUrl) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Webhook URL not configured' }),
    };
  }

  if (!webhookSecretBase) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Webhook secret base not configured' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is required' }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON body' }),
    };
  }

  const { owner, repo, githubToken } = payload;

  if (!owner || !repo || !githubToken) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'owner, repo and githubToken are required' }),
    };
  }

  const secret = createRepoSecret(owner, repo);

  const hookRequestBody = {
    name: 'web',
    active: true,
    events: ['push'],
    config: {
      url: webhookUrl,
      content_type: 'json',
      insecure_ssl: '0',
      secret,
    },
  };

  try {
    const ghResponse = await callGitHub(githubToken, owner, repo, hookRequestBody);

    if (ghResponse.statusCode < 200 || ghResponse.statusCode >= 300) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          message: 'Failed to register webhook with GitHub',
          githubStatusCode: ghResponse.statusCode,
          githubResponseBody: ghResponse.body,
        }),
      };
    }

    return {
      statusCode: 201,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Webhook registered',
        owner,
        repo,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error registering webhook',
        error: error?.message ?? 'Unknown error',
      }),
    };
  }
};

