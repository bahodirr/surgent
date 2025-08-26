#!/usr/bin/env node

import { Daytona, Image } from '@daytonaio/sdk';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

const SNAPSHOT_NAME = "claude-code-vite-react-shadcn-ts-env:1.0.0";

async function createSnapshot(): Promise<void> {
  try {
    // Load environment variables
    dotenv.config({ path: resolve(__dirname, '../.env.local') });
    
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) {
      console.error('DAYTONA_API_KEY not found in environment');
      process.exit(1);
    }

    console.log('Initializing Daytona client...');
    const daytona = new Daytona({ apiKey });

    console.log(`Creating snapshot from Dockerfile...`);
    const dockerfilePath = resolve(__dirname, './Dockerfile');
    const image = await Image.fromDockerfile(dockerfilePath);

    await daytona.snapshot.create({
      name: SNAPSHOT_NAME,
      resources: {
        cpu: 4,
        memory: 8,
        disk: 10,
      },
      image,
    }, {
      onLogs: (chunk: string) => process.stdout.write(chunk),
    });

    console.log(`\n✅ Snapshot "${SNAPSHOT_NAME}" created successfully!`);
  } catch (error) {
    console.error('\n❌ Failed to create snapshot:', error);
    process.exit(1);
  }
}

createSnapshot();
