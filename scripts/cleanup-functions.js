import fs from 'fs';
import path from 'path';

const dir = path.resolve(process.cwd(), 'dist/netlify/functions');

function cleanup() {
  if (!fs.existsSync(dir)) {
    console.log('No netlify functions directory found, skipping cleanup');
    return;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.d.ts')) {
      const filePath = path.join(dir, file);
      fs.unlinkSync(filePath);
      console.log(`Removed: ${filePath}`);
    }
  }
}

cleanup();
