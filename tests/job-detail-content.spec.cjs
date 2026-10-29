const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseJobDetail,
  jobText,
  monthlySalary,
  jobSections,
} = require('../apps/api/dist/ingestion/job-detail-content');

test('Infrastructure evidence is tagged without inferring development tools or tagging nontechnical roles', () => {
  const {
    GeminiExtractorService,
  } = require('../apps/api/dist/ingestion/gemini-extractor.service');
  const extract = (title, text) =>
    new GeminiExtractorService()
      .fallbackRuleBasedExtractor(title, text)
      .map((s) => s.name);
  assert.deepEqual(
    extract('System and Storage Support Engineer', 'Level 2 Support'),
    ['Storage Systems', 'Technical Support'],
  );
  assert.deepEqual(
    extract('Presales', 'Knowledge of Network Security and Cyber Security'),
    ['Network Security', 'Cybersecurity'],
  );
  for (const skill of [
    'Technical Support',
    'Network Switching',
    'Structured Cabling',
    'Server Hardware',
  ]) {
    assert.ok(
      extract(
        'Project Engineer',
        'Technical support, network switches, structured cabling and server hardware',
      ).includes(skill),
    );
  }
  assert.deepEqual(
    extract('Project Sales Engineer', 'HVAC and Chinese language'),
    [],
  );
  assert.deepEqual(
    extract('Freelance Writer', 'No tool requirements specified'),
    [],
  );
});

test('Nontechnical categories require explicit evidence, including Thai responsibilities', () => {
  const {
    GeminiExtractorService,
  } = require('../apps/api/dist/ingestion/gemini-extractor.service');
  const extract = (title, text) =>
    new GeminiExtractorService().fallbackRuleBasedExtractor(title, text);
  const sales = extract(
    'Project Sales Engineer',
    'ดูแลฐานลูกค้า จัดทำข้อเสนอ ใบเสนอราคา',
  );
  assert.deepEqual(
    sales.map((s) => s.name),
    [
      'Sales Proposal Writing',
      'Sales Quotation',
      'Customer Relationship Management',
    ],
  );
  assert.ok(sales.every((s) => s.category === 'SALES'));
  const coordination = extract(
    'Coordinator',
    'ทักษะในการสื่อสาร เจรจาต่อรอง และประสานงาน',
  );
  assert.equal(coordination.length, 3);
  assert.ok(coordination.every((s) => s.category === 'COORDINATION'));
  const writing = extract(
    'Freelance Writer',
    'content writers to create articles using Microsoft Word or Open Office',
  );
  assert.deepEqual(
    writing.map((s) => s.name),
    ['Content Writing', 'Microsoft Word', 'OpenOffice'],
  );
  assert.ok(writing.every((s) => s.category === 'WRITING'));
  assert.deepEqual(
    extract('Sales Coordinator Writer', 'No requirements specified'),
    [],
  );
});

test('Next serialized JobPosting retains full details, qualifications and location without executing scripts', () => {
  const data = {
    '@type': 'JobPosting',
    description: '<p>' + 'React development '.repeat(100) + '</p>',
    qualifications: 'Docker and SQL',
    jobLocation: { address: { addressLocality: 'Bangkok' } },
    baseSalary: {
      currency: 'THB',
      value: { unitText: 'MONTH', minValue: 30000, maxValue: 50000 },
    },
  };
  const html = `<script>self.__next_s.push(${JSON.stringify([
    0,
    { type: 'application/ld+json', children: JSON.stringify(data) },
  ])})</script>`;
  const result = parseJobDetail(html, 'https://www.jobthai.com/th/company/job/1');
  assert.ok(result.description.length > 1000);
  assert.equal(result.requirements, 'Docker and SQL');
  assert.equal(result.location, 'Bangkok');
  assert.equal(result.salaryMax, 50000);
});

test('Reject unrelated recommendation metadata and missing detail', () => {
  assert.throws(
    () =>
      parseJobDetail(
        '<script type="application/ld+json">' +
          JSON.stringify({
            '@type': 'JobPosting',
            url: 'https://th.jobsdb.com/job/2',
            description: 'a'.repeat(100),
          }) +
          '</script>',
        'https://th.jobsdb.com/job/1',
      ),
    /MISSING/,
  );
});

test('JobsDB takes actual job content, excluding recommended cards', () => {
  const result = parseJobDetail(
    '<div data-automation="jobAdDetails"><h2>Requirements</h2><p>' +
      'React '.repeat(20) +
      '</p></div><aside>Python recommended job</aside>',
    'https://th.jobsdb.com/job/1',
  );
  assert.ok(!result.description.includes('Python'));
  assert.match(result.requirements, /React/);
});

test('Unknown and annual salary never become monthly salary; sections keep line boundaries', () => {
  assert.deepEqual(monthlySalary({ value: { unitText: 'YEAR', value: 100000 } }), {});
  assert.deepEqual(monthlySalary(null), {});
  assert.deepEqual(
    monthlySalary({
      currency: 'THB',
      unitText: 'MONTH',
      minValue: '0.00',
      maxValue: '0.00',
    }),
    {},
  );
  assert.deepEqual(
    monthlySalary({
      currency: 'THB',
      unitText: 'MONTH',
      minValue: '30000.00',
      maxValue: '50000.00',
    }),
    { salaryMin: 30000, salaryMax: 50000, salaryCurrency: 'THB' },
  );
  assert.equal(
    jobSections(jobText('<h2>Benefits</h2><p>Annual leave</p>')).benefits,
    'Annual leave',
  );
  assert.equal(
    jobSections('What you’ll Need to Succeed:\nPython or Go').requirements,
    'Python or Go',
  );
});

test('Explicit expired page is not mistaken for a new sparse job', () => {
  assert.throws(
    () =>
      parseJobDetail(
        '<body>This job is no longer advertised</body>',
        'https://th.jobsdb.com/job/1',
      ),
    /SOURCE_LISTING_CLOSED/,
  );
});

test('Named testing and industrial skills are retained without inventing a testing tool', () => {
  const {
    GeminiExtractorService,
  } = require('../apps/api/dist/ingestion/gemini-extractor.service');
  const skills = new GeminiExtractorService()
    .fallbackRuleBasedExtractor(
      'Software Tester',
      'Functional Testing, Load Test, PLC, Test Case',
    )
    .map((s) => s.name);
  for (const name of [
    'Functional Testing',
    'Load Testing',
    'PLC',
    'Test Case Design',
  ]) {
    assert.ok(skills.includes(name));
  }
  assert.ok(!skills.includes('Jest'));
  const nonFunctional = new GeminiExtractorService()
    .fallbackRuleBasedExtractor('Tester', 'Non-Functional Testing')
    .map((s) => s.name);
  assert.ok(!nonFunctional.includes('Functional Testing'));
});

test('parseJobDetail extracts logoUrl from JSON-LD ImageObject and DOM fallbacks', () => {
  const jsonLdWithLogoObj = {
    '@type': 'JobPosting',
    description: '<p>' + 'TypeScript development '.repeat(15) + '</p>',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Acme Corp',
      logo: {
        '@type': 'ImageObject',
        url: 'https://cdn.example.com/acme-logo.png',
      },
    },
  };
  const html1 = `<script type="application/ld+json">${JSON.stringify(jsonLdWithLogoObj)}</script>`;
  const res1 = parseJobDetail(html1, 'https://www.jobthai.com/th/company/job/123');
  assert.equal(res1.logoUrl, 'https://cdn.example.com/acme-logo.png');

  const html2 =
    '<div data-automation="advertiser-logo"><img src="https://bx-branding-gateway.cloud.seek.com.au/logo-123.png" /></div>' +
    '<div data-automation="jobAdDetails"><h2>Requirements</h2><p>' +
    'Node.js '.repeat(20) +
    '</p></div>';
  const res2 = parseJobDetail(html2, 'https://th.jobsdb.com/th/job/999');
  assert.equal(
    res2.logoUrl,
    'https://bx-branding-gateway.cloud.seek.com.au/logo-123.png',
  );
});

