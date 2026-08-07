import type { Readable } from 'node:stream';

/**
 * Reads a response body up to a limit, and stops reading when it exceeds one.
 *
 * The point of a response budget is not to hold an oversized page in memory
 * and then reject it: it is to stop reading. So the stream is destroyed at the
 * moment the limit is passed, and the caller is told by the error it supplied
 * rather than by an error this module invents.
 */
export async function readBoundedUtf8(
  stream: Readable,
  maxBytes: number,
  onExceeded: (bytes: number, maxBytes: number) => Error,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      stream.destroy();
      reject(error);
    };

    stream.on('data', (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      bytes += buffer.byteLength;
      if (bytes > maxBytes) {
        fail(onExceeded(bytes, maxBytes));
        return;
      }
      chunks.push(buffer);
    });
    stream.once('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    stream.once('error', fail);
  });
}
