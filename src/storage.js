import { constants as FS } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_LOCAL_JSON_BYTES = 8 * 1024 * 1024;

// Local wallet files must never follow a link supplied by another local user.
// The size cap also prevents a corrupted file from consuming excessive memory.
export async function readLocalJson(file, maxBytes = MAX_LOCAL_JSON_BYTES) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Local data file is not a regular file.');
  if (stat.size > maxBytes) throw new Error('Local data file is too large.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

// A completed replacement is atomically renamed into place. The previous file
// therefore remains intact if the process stops while writing the new one.
export async function writePrivateJson(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, file);
    // Best effort: directory sync makes the rename durable on POSIX filesystems.
    const directoryHandle = await fs.open(directory, FS.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}
