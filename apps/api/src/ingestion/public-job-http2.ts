import { connect, ClientHttp2Session } from 'http2';
import { allowedJobPage } from './rendered-job-html';

const maxBytes = 25 * 1024 * 1024;

// Ordinary anonymous HTTP/2, with certificate validation left enabled. No
// browser cookies, credentials, TLS impersonation or external relay is used.
export async function fetchPublicJobHttp2(
  url: string,
  open: (origin: string) => ClientHttp2Session = (origin) => connect(origin),
): Promise<string> {
  if (!allowedJobPage(url)) {
    throw new Error('SOURCE_HTTP2_URL_DENIED: ที่อยู่แหล่งงานไม่รองรับ');
  }
  const host = new URL(url).hostname;
  const deadline = Date.now() + 15000;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const target = new URL(url);
    if (!allowedJobPage(url) || target.hostname !== host) {
      throw new Error(
        'SOURCE_HTTP2_URL_DENIED: ต้นทางเปลี่ยนไปยังที่อยู่ที่ไม่รองรับ',
      );
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        'SOURCE_HTTP2_TIMEOUT: ติดต่อแหล่งงานไม่ทันเวลาที่กำหนด',
      );
    }
    const result = await new Promise<{
      status: number;
      location?: string;
      html: string;
    }>((resolve, reject) => {
      let session: ClientHttp2Session | undefined;
      let finished = false;
      let status = 0;
      let location: string | undefined;
      let size = 0;
      const chunks: Buffer[] = [];
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        session?.destroy();
        if (error) reject(error);
        else
          resolve({
            status,
            location,
            html: Buffer.concat(chunks).toString('utf8'),
          });
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'SOURCE_HTTP2_TIMEOUT: ติดต่อแหล่งงานไม่ทันเวลาที่กำหนด',
            ),
          ),
        remaining,
      );
      try {
        session = open(target.origin);
        session.on('error', () =>
          finish(
            new Error(
              'SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อแหล่งงานไม่ได้',
            ),
          ),
        );
        const request = session.request({
          ':method': 'GET',
          ':path': target.pathname + target.search,
          'user-agent': 'SmartCareer/1.0',
          accept: 'text/html',
          'accept-language': 'th-TH,th;q=0.9,en;q=0.7',
          'accept-encoding': 'identity',
        });
        request.on('response', (headers) => {
          status = Number(headers[':status']) || 0;
          location =
            typeof headers.location === 'string' ? headers.location : undefined;
          if ([301, 302, 303, 307, 308].includes(status)) {
            finish();
            return;
          }
          if (status !== 200) {
            finish(
              new Error(
                `SOURCE_HTTP_${status || 'UNAVAILABLE'}: ต้นทางไม่พร้อมให้อ่านข้อมูล`,
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
                'SOURCE_HTTP2_ENCODING_UNSUPPORTED: รูปแบบหน้าเว็บไม่รองรับ',
              ),
            );
          }
        });
        request.on('data', (chunk) => {
          if (finished) return;
          size += chunk.length;
          if (size > maxBytes) {
            finish(
              new Error(
                'SOURCE_HTTP2_PAGE_TOO_LARGE: หน้าแหล่งงานใหญ่เกินขอบเขต',
              ),
            );
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        request.on('error', () =>
          finish(
            new Error(
              'SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อแหล่งงานไม่ได้',
            ),
          ),
        );
        request.on('end', () => finish());
        request.on('close', () => {
          if (!finished) {
            finish(
              new Error(
                'SOURCE_HTTP2_CONNECTION_FAILED: ต้นทางหยุดส่งข้อมูลก่อนครบ',
              ),
            );
          }
        });
        request.end();
      } catch {
        finish(
          new Error('SOURCE_HTTP2_CONNECTION_FAILED: ติดต่อแหล่งงานไม่ได้'),
        );
      }
    });
    if (result.status === 200) {
      if (!result.html.trim()) {
        throw new Error('SOURCE_EMPTY_RESPONSE: ต้นทางส่งหน้าว่าง');
      }
      return result.html;
    }
    if (!result.location || redirect === 3) {
      throw new Error(
        'SOURCE_HTTP2_REDIRECT_LIMIT: ต้นทางเปลี่ยนที่อยู่เกินขอบเขต',
      );
    }
    url = new URL(result.location, url).href;
  }
  throw new Error(
    'SOURCE_HTTP2_REDIRECT_LIMIT: ต้นทางเปลี่ยนที่อยู่เกินขอบเขต',
  );
}
