import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as https from 'https';
import { URL } from 'url';

const s3 = new S3Client({});

interface CloneRepoInput {
  owner: string;
  repo: string;
  branch?: string;
  githubToken?: string;
  executionId?: string;
  sourceBucket: string;
}

const downloadArchive = (archiveUrl: string, githubToken?: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const url = new URL(archiveUrl);

    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {},
    };

    if (githubToken) {
      (options.headers as Record<string, string>)['Authorization'] = `Bearer ${githubToken}`;
      (options.headers as Record<string, string>)['Accept'] = 'application/vnd.github+json';
    }

    const req = https.request(options, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Failed to download archive: ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.end();
  });
};

export const handler = async (event: CloneRepoInput) => {
  const { owner, repo, branch = 'main', githubToken, executionId, sourceBucket } = event;

  if (!owner || !repo || !sourceBucket) {
    throw new Error('owner, repo, and sourceBucket are required');
  }

  const archiveUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(branch)}`;

  const body = await downloadArchive(archiveUrl, githubToken);

  const key = `repos/${executionId ?? 'manual'}/${owner}/${repo}/${branch}.tar.gz`;

  await s3.send(new PutObjectCommand({
    Bucket: sourceBucket,
    Key: key,
    Body: body,
    ContentType: 'application/gzip',
  }));

  return {
    status: 'success',
    sourceBucket,
    sourceKey: key,
  };
};
