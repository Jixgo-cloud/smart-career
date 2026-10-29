const aliases: Record<string, string[]> = {
  react: ['reactjs', 'react.js'],
  'node.js': ['nodejs'],
  'next.js': ['nextjs'],
  'tailwind css': ['tailwind', 'tailwindcss'],
  postgresql: ['postgres', 'psql'],
  html: ['html5'],
  css: ['css3'],
  'rest apis': ['rest api', 'restful api', 'restful apis', 'restful'],
  'vue.js': ['vue', 'vuejs', 'nuxt'],
  'c#': ['.net', 'dotnet', 'asp.net'],
  'ci/cd': ['ci cd', 'continuous integration', 'continuous delivery'],
  go: ['golang'],
  'automated testing': [
    'automated test',
    'automated testing',
    'automation test',
    'automation testing',
    'unit test',
    'unit testing',
    'jest',
    'cypress',
    'playwright',
  ],
  'application security': [
    'appsec',
    'owasp',
    'cybersecurity',
    'cyber security',
    'network security',
  ],
  'machine learning': ['deep learning', 'scikit-learn', 'tensorflow', 'pytorch'],
};

export function mentionsSkill(text: string, name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return [normalized, ...(aliases[normalized] || [])].some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
      'iu',
    ).test(text);
  });
}

/**
 * Verifies that a course's or job's title/description contains genuine word-bounded
 * textual evidence for the target skill, preventing false substring matches.
 */
export function hasCourseSkillEvidence(
  course: { title?: string | null; description?: string | null },
  skill: { name: string; slug?: string },
): boolean {
  const haystack = `${course.title || ''} ${course.description || ''}`;
  if (!haystack.trim()) return false;
  return mentionsSkill(haystack, skill.name);
}

export function normalizeCourseUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch {
    return rawUrl.trim();
  }
}
