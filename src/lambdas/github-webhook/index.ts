import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import crypto from 'crypto';

const webhookSecretBase = process.env.GITHUB_WEBHOOK_SECRET_BASE as string | undefined;

const createRepoSecret = (fullName: string): string => {
  if (!webhookSecretBase) {
    return 'MISSING_WEBHOOK_SECRET_BASE';
  }

  let hash = 0;
  for (let i = 0; i < fullName.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + fullName.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash |= 0;
  }
  return `${webhookSecretBase}_${Math.abs(hash)}`;
};

const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const verifySignature = (rawBody: string, signatureHeader: string | undefined, secret: string): boolean => {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const actual = signatureHeader.substring('sha256='.length);

  return timingSafeEqual(expected, actual);
};

const isDocsOnlyChange = (files: string[]): boolean => {
  if (files.length === 0) return true;

  return files.every((file) => {
    const lower = file.toLowerCase();
    if (lower === 'readme' || lower === 'readme.md' || lower === 'readme.txt') return true;
    if (lower.endsWith('.md') || lower.endsWith('.rst') || lower.endsWith('.txt')) return true;
    if (lower.startsWith('docs/')) return true;
    return false;
  });
};

const isBotCommit = (payload: any): boolean => {
  const senderType = payload?.sender?.type;
  if (senderType === 'Bot') return true;

  const username = payload?.sender?.login || payload?.head_commit?.author?.username || '';
  if (typeof username === 'string' && username.toLowerCase().includes('[bot]')) return true;

  const name = payload?.head_commit?.author?.name || '';
  if (typeof name === 'string' && name.toLowerCase().includes('bot')) return true;

  return false;
};

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (!webhookSecretBase) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Webhook secret base not configured' }),
    };
  }

  const rawBody = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body ?? '');

  if (!rawBody) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Empty body' }),
    };
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON body' }),
    };
  }

  const eventType = event.headers['X-GitHub-Event'] || event.headers['x-github-event'];
  const signature = event.headers['X-Hub-Signature-256'] || event.headers['x-hub-signature-256'];

  const repositoryFullName: string | undefined = payload?.repository?.full_name;
  if (!repositoryFullName) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing repository information' }),
    };
  }

  const secret = createRepoSecret(repositoryFullName);

  if (!verifySignature(rawBody, signature, secret)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid signature' }),
    };
  }

  if (eventType !== 'push') {
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Event ignored', eventType }),
    };
  }

  const ref: string | undefined = payload.ref; // e.g. refs/heads/main
  const branch = ref?.startsWith('refs/heads/') ? ref.substring('refs/heads/'.length) : ref;

  const allowedBranches = ['main', 'master', 'develop'];
  if (!branch || !allowedBranches.includes(branch)) {
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Branch ignored', branch }),
    };
  }

  const commits: any[] = Array.isArray(payload.commits) ? payload.commits : [];
  const filesChanged = new Set<string>();
  for (const commit of commits) {
    for (const f of commit.added ?? []) filesChanged.add(f);
    for (const f of commit.modified ?? []) filesChanged.add(f);
    for (const f of commit.removed ?? []) filesChanged.add(f);
  }

  const filesList = Array.from(filesChanged);
  if (isDocsOnlyChange(filesList)) {
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Docs-only change ignored' }),
    };
  }

  if (isBotCommit(payload)) {
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Bot commit ignored' }),
    };
  }

  // At this point, we have a verified, relevant push event.
  // This is where you would enqueue your AI analysis job or trigger
  // a Step Functions workflow based on repositoryFullName and branch.
  // push event onto sqs which step function will pick up and process

  return {
    statusCode: 202,
    body: JSON.stringify({
      message: 'Push event accepted for processing',
      repository: repositoryFullName,
      branch,
      filesAnalyzedCount: filesList.length,
    }),
  };
};

