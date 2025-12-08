import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import tar from 'tar';
import { ReadEntry } from 'tar';
import path from 'path';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const SOURCE_BUCKET = process.env.SOURCE_BUCKET!;
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET || SOURCE_BUCKET;

// File extensions to include (case-insensitive)
const INCLUDE_EXTENSIONS = [
  // Source code files
  '.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs', 
  // Configuration files
  '.json', '.yaml', '.yml', '.toml', '.env', '.gitignore', '.dockerignore',
  // Web files
  '.html', '.css', '.scss', '.less',
  // Documentation
  '.md', '.txt', '.rst',
  // Shell scripts
  '.sh', '.bash', '.zsh'
].map(ext => ext.toLowerCase());

// Directories to exclude (case-insensitive)
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.vercel',
  '.netlify'
].map(dir => dir.toLowerCase() + '/');

interface FileInfo {
  key: string;
  content: Buffer;
}

export const handler = async (event: any): Promise<{ userId: string; projectId: string; filePaths: string[] }> => {
  try {
    const record = event.Records[0];
    const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const userId = event.userId as string | undefined;
    const projectId = event.projectId as string | undefined;

    if (!userId || !projectId) {
      throw new Error('userId and projectId are required in event');
    }

    console.log(`Processing user ${userId} project ${projectId} from ${sourceKey}`);

    // Get the .tar.gz file from S3
    const { Body: fileStream } = await s3.send(new GetObjectCommand({
      Bucket: record.s3.bucket.name,
      Key: sourceKey,
    }));

    if (!fileStream) {
      throw new Error('Empty file stream received from S3');
    }

    // Process the tar.gz file
    const files: FileInfo[] = [];
    
    // Create a pipeline to decompress and extract the tar file
    await pipeline(
      fileStream as Readable,
      createGunzip(),
      tar.t({
        onentry: async (entry: ReadEntry) => {
          const relativePath = entry.path;
          const lowerPath = relativePath.toLowerCase();
          
          // Skip directories and excluded files
          if (entry.type !== 'File') return;
          if (EXCLUDE_DIRS.some(dir => lowerPath.includes(dir))) return;
          
          // Check file extension
          const ext = path.extname(relativePath).toLowerCase();
          if (ext && !INCLUDE_EXTENSIONS.includes(ext)) return;
          
          // Read file content
          const chunks: Buffer[] = [];
          for await (const chunk of entry) {
            chunks.push(chunk);
          }
          
          const content = Buffer.concat(chunks);
          const s3Key = `${userId}/${projectId}/${relativePath}`;
          
          files.push({
            key: s3Key,
            content
          });
        },
      })
    );

    console.log(`Extracted ${files.length} files from ${sourceKey}`);
    
    // Upload all files to S3 in parallel with rate limiting
    const uploadPromises = files.map(({ key, content }) => 
      s3.send(new PutObjectCommand({
        Bucket: DESTINATION_BUCKET,
        Key: key,
        Body: content,
      })).then(() => key)
        .catch(error => {
          console.error(`Error uploading ${key}:`, error);
          return null;
        })
    );
    
    // Wait for all uploads to complete and filter out any failed uploads
    const uploadedFiles = (await Promise.all(uploadPromises)).filter(Boolean) as string[];
    
    console.log(`Successfully uploaded ${uploadedFiles.length}/${files.length} files`);
    
    // Return the list of uploaded file paths (relative to the user/project directory)
    const filePaths = uploadedFiles.map(fullPath => 
      fullPath.replace(`${userId}/${projectId}/`, '')
    );
    
    return {
      userId,
      projectId,
      filePaths
    };
    
  } catch (error) {
    console.error('Error in explode-repo:', error);
    throw error;
  }
};
