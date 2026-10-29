import { connect, ClientHttp2Session } from 'http2';

export const blognonePublicEndpoint = 'https://jobs-api.blognone.com/graphql';

// A single anonymous read of the fixed public API over ordinary Node HTTP/2.
// Never follows redirects or accepts caller-supplied destinations or headers.
export async function fetchBlognonePublicHttp2(
  body: string,
  open: (origin: string) => ClientHttp2Session = (origin) => connect(origin),
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let session: ClientHttp2Session | undefined;
    let finished = false;
    let size = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      session?.destroy();
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(
          new Error(
            'SOURCE_DATA_INVALID: API สาธารณะ Blognone ส่งข้อมูลที่อ่านไม่ได้ รักษางานเดิมไว้',
          ),
        );
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'SOURCE_HTTP2_TIMEOUT: ติดต่อ API สาธารณะ Blognone ไม่ทันเวลาที่กำหนด',
          ),
        ),
      12000,
    );
    try {
      session = open(new URL(blognonePublicEndpoint).origin);
      session.on('error', () =>
        finish(
          new Error(
            'SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อ API สาธารณะ Blognone ไม่ได้',
          ),
        ),
      );
      const request = session.request({
        ':method': 'POST',
        ':path': '/graphql',
        'user-agent': 'SmartCareer/1.0',
        accept: 'application/json',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'accept-encoding': 'identity',
      });
      request.on('response', (headers) => {
        const status = Number(headers[':status']) || 0;
        if (status !== 200) {
          finish(
            new Error(
              `SOURCE_HTTP_${status || 'UNAVAILABLE'}: API สาธารณะ Blognone ไม่พร้อมให้อ่านข้อมูล รักษางานเดิมไว้`,
            ),
          );
          return;
        }
        if (
          headers['content-encoding'] &&
          headers['content-encoding'] !== 'identity'
        ) {
          finish(
            new Error(
              'SOURCE_HTTP2_ENCODING_UNSUPPORTED: รูปแบบข้อมูล API สาธารณะไม่รองรับ',
            ),
          );
        }
      });
      request.on('data', (chunk) => {
        if (finished) return;
        size += chunk.length;
        if (size > 5 * 1024 * 1024) {
          finish(
            new Error(
              'SOURCE_HTTP2_PAGE_TOO_LARGE: ข้อมูล API สาธารณะเกินขอบเขต',
            ),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      request.on('error', () =>
        finish(
          new Error(
            'SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อ API สาธารณะ Blognone ไม่ได้',
          ),
        ),
      );
      request.on('end', () => finish());
      request.on('close', () => {
        if (!finished) {
          finish(
            new Error(
              'SOURCE_HTTP2_CONNECTION_FAILED: API สาธารณะหยุดส่งข้อมูลก่อนครบ',
            ),
          );
        }
      });
      request.end(body);
    } catch {
      finish(
        new Error(
          'SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อ API สาธารณะ Blognone ไม่ได้',
        ),
      );
    }
  });
}
