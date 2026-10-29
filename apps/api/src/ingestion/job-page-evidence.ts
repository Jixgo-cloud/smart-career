import * as cheerio from 'cheerio';

// Read only structured data for this exact listing, not recommendations on the page.
export function structuredJobExpiry(
  html: string,
  url: string,
  now = Date.now(),
): 'OPEN' | 'CLOSED' | null {
  const $ = cheerio.load(html);
  const canonical = (value: unknown) => {
    try {
      const u = new URL(String(value));
      return u.origin + u.pathname.replace(/\/$/, '');
    } catch {
      return '';
    }
  };
  const target = canonical(url);
  let result: 'OPEN' | 'CLOSED' | null = null;
  const inspect = (value: any) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value['@graph']) inspect(value['@graph']);
    if (
      value['@type'] !== 'JobPosting' ||
      !target ||
      canonical(value.url) !== target
    ) {
      return;
    }
    const expires =
      typeof value.validThrough === 'string'
        ? Date.parse(value.validThrough)
        : NaN;
    if (!Number.isFinite(expires)) return;
    if (expires <= now) result = 'CLOSED';
    else if (result !== 'CLOSED') result = 'OPEN';
  };
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      inspect(JSON.parse($(el).text()));
    } catch {
      /* Malformed metadata is not evidence. */
    }
  });
  return result;
}

export function hasJobsDbApply(html: string, url: string): boolean {
  const target = new URL(url);
  if (
    target.hostname !== 'th.jobsdb.com' ||
    !/^\/job\/\d+\/?$/.test(target.pathname)
  ) {
    return false;
  }
  const $ = cheerio.load(html);
  return $('[data-automation="job-detail-apply"][href]')
    .toArray()
    .some((el) => {
      if ($(el).closest('[hidden], [aria-hidden="true"]').length) return false;
      try {
        const link = new URL($(el).attr('href')!, url);
        return (
          link.origin === target.origin &&
          link.pathname === target.pathname.replace(/\/$/, '') + '/apply'
        );
      } catch {
        return false;
      }
    });
}
