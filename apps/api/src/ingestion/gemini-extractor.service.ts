import { Injectable, Logger, Optional } from '@nestjs/common';
import { SkillCategory } from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hasCourseSkillEvidence } from '../recommendations/course-skill-evidence';
import { fetchJobDetail } from './job-detail-content';

export interface ExtractedSkill {
  name: string;
  category: SkillCategory;
  isRequired: boolean;
  minimumScore: number;
}

export interface DetailedJobInfo {
  title?: string;
  description?: string;
  requirements?: string;
  company?: string;
  logoUrl?: string;
  benefits?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  salaryCurrency?: string;
  isActive?: boolean;
}

@Injectable()
export class GeminiExtractorService {
  private readonly logger = new Logger(GeminiExtractorService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async fetchDeepJobDetails(
    source: string,
    url: string,
    fallback: Partial<DetailedJobInfo> = {},
  ): Promise<DetailedJobInfo> {
    if (!['JOBTHAI', 'JOBSDB', 'BLOGNONE'].includes(source)) return fallback;
    return { ...fallback, ...(await fetchJobDetail(url)) };
  }

  async extractSkills(
    title: string,
    description: string,
    requirements?: string,
  ): Promise<ExtractedSkill[]> {
    const ruleSkills = this.fallbackRuleBasedExtractor(
      title,
      description,
      requirements,
    );
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (apiKey) {
      try {
        const suggestedSkills = await this.callGeminiFlash(
          apiKey,
          title,
          description,
          requirements,
        );
        const text = `${title} ${description || ''} ${requirements || ''}`;
        const explicitNames = new Set(
          ruleSkills.map((skill) => skill.name.toLowerCase()),
        );
        const aiSkills = suggestedSkills.filter((skill) => {
          const name = skill.name.trim();
          if (!name) return false;
          if (explicitNames.has(name.toLowerCase())) return true;
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(
            text,
          );
        });
        if (aiSkills && aiSkills.length > 0) {
          return [
            ...ruleSkills,
            ...aiSkills.filter(
              (s) =>
                !ruleSkills.some(
                  (r) => r.name.toLowerCase() === s.name.toLowerCase(),
                ),
            ),
          ];
        }
      } catch (err: any) {
        this.logger.warn(
          `[Gemini] Skill extraction failed (${err.message}). Using Rule-Based Engine.`,
        );
      }
    }

    return ruleSkills;
  }

  async extractJobSkills(
    textPayload: {
      title: string;
      description: string;
      requirements?: string | null;
    },
    options?: { useAi?: boolean },
  ): Promise<
    Array<{ skillId: string; isRequired: boolean; minimumScore: number }>
  > {
    if (!this.prisma) return [];
    const allSkills = await this.prisma.skill.findMany();

    const matchedSkillIds = new Set<string>();
    const results: Array<{
      skillId: string;
      isRequired: boolean;
      minimumScore: number;
    }> = [];

    // 1. Existing DB skills backed by strict textual word-boundary evidence
    for (const sk of allSkills) {
      if (
        hasCourseSkillEvidence(
          {
            title: textPayload.title,
            description: `${textPayload.description} ${
              textPayload.requirements || ''
            }`,
          },
          sk,
        )
      ) {
        matchedSkillIds.add(sk.id);
        const inTitle = textPayload.title
          .toLowerCase()
          .includes(sk.name.toLowerCase());
        results.push({
          skillId: sk.id,
          isRequired: inTitle || results.length < 3,
          minimumScore: inTitle ? 70 : 60,
        });
      }
    }

    // 2. Rule-based + optional Gemini AI skills (matched against existing canonical skills)
    const extracted = options?.useAi
      ? await this.extractSkills(
          textPayload.title,
          textPayload.description,
          textPayload.requirements || undefined,
        )
      : this.fallbackRuleBasedExtractor(
          textPayload.title,
          textPayload.description,
          textPayload.requirements || undefined,
        );

    const canonicalMap: Record<string, { name: string; slug: string }> = {
      html5: { name: 'HTML', slug: 'html' },
      html: { name: 'HTML', slug: 'html' },
      css3: { name: 'CSS', slug: 'css' },
      css: { name: 'CSS', slug: 'css' },
      'node.js': { name: 'Node.js', slug: 'nodejs' },
      'next.js': { name: 'Next.js', slug: 'nextjs' },
      'tailwind css': { name: 'Tailwind CSS', slug: 'tailwindcss' },
      'vue.js': { name: 'Vue.js', slug: 'vue' },
      'c#': { name: 'C#', slug: 'csharp' },
      'ci/cd': { name: 'CI/CD', slug: 'ci-cd' },
    };

    for (const ext of extracted) {
      const canonical = canonicalMap[ext.name.trim().toLowerCase()];
      const targetName = canonical ? canonical.name : ext.name.trim();
      const targetSlug =
        canonical?.slug ||
        targetName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') ||
        `skill-${crypto.randomBytes(3).toString('hex')}`;

      let sk = allSkills.find(
        (s) =>
          s.name.toLowerCase() === targetName.toLowerCase() ||
          s.slug.toLowerCase() === targetSlug.toLowerCase(),
      );

      if (!sk) {
        try {
          sk = await this.prisma.skill.upsert({
            where: { slug: targetSlug },
            update: {},
            create: {
              name: targetName,
              slug: targetSlug,
              category: ext.category,
            },
          });
          allSkills.push(sk);
        } catch {
          sk =
            (await this.prisma.skill.findFirst({
              where: {
                OR: [
                  { name: { equals: targetName, mode: 'insensitive' } },
                  { slug: { equals: targetSlug, mode: 'insensitive' } },
                ],
              },
            })) || undefined;
          if (sk) allSkills.push(sk);
        }
      }

      if (sk && !matchedSkillIds.has(sk.id)) {
        matchedSkillIds.add(sk.id);
        results.push({
          skillId: sk.id,
          isRequired: ext.isRequired,
          minimumScore: ext.minimumScore,
        });
      }
    }

    return results;
  }

  private async callGeminiFlash(
    apiKey: string,
    title: string,
    description: string,
    requirements?: string,
  ): Promise<ExtractedSkill[]> {
    const candidateModels = Array.from(
      new Set([
        process.env.AI_EVALUATOR_MODEL || 'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.6-flash',
      ]),
    );

    const prompt = `Extract technical skills explicitly mentioned in this job posting:
Title: ${title}
Description: ${description}
Requirements: ${requirements || 'N/A'}
Return ONLY a JSON array of objects with fields: name, category, isRequired, minimumScore.`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    let lastError: any = null;
    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await axios.post(endpoint, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        });
        const candidateText =
          res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) continue;
        const cleanText = candidateText
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        const rawSkills = JSON.parse(cleanText);
        if (!Array.isArray(rawSkills)) continue;

        return rawSkills
          .filter((s) => s && s.name && typeof s.name === 'string')
          .map((s) => ({
            name: s.name.trim(),
            category: this.normalizeCategory(s.category),
            isRequired: Boolean(s.isRequired),
            minimumScore: Math.min(
              95,
              Math.max(50, Number(s.minimumScore) || 70),
            ),
          }));
      } catch (err: any) {
        lastError = err;
        if (err?.response?.status === 429) break;
      }
    }
    throw lastError || new Error('All candidate Gemini models failed');
  }

  private normalizeCategory(cat: string): SkillCategory {
    const upper = String(cat || '').toUpperCase();
    if (Object.values(SkillCategory).includes(upper as SkillCategory)) {
      return upper as SkillCategory;
    }
    if (/TEST|QA|QUALITY/i.test(upper)) return SkillCategory.TESTING;
    if (/SALES|PRESALES/i.test(upper)) return SkillCategory.SALES;
    if (/COORDINAT|COMMUNICAT|NEGOTIAT/i.test(upper))
      return SkillCategory.COORDINATION;
    if (/WRITING|EDITORIAL|COPYWRIT/i.test(upper)) return SkillCategory.WRITING;
    if (/FRONT|UI|UX|WEB|STYLE|DESIGN/i.test(upper))
      return SkillCategory.FRONTEND;
    if (/DATA|SQL|DB/i.test(upper)) return SkillCategory.DATABASE;
    if (/CLOUD|OPS|DOCKER|K8S|INFRA|SERVER|SYS/i.test(upper))
      return SkillCategory.DEVOPS;
    if (/MOBILE|IOS|ANDROID/i.test(upper)) return SkillCategory.MOBILE;
    if (/AI|ML|LEARNING/i.test(upper)) return SkillCategory.AI_ML;
    if (/SEC|CYBER/i.test(upper)) return SkillCategory.SECURITY;
    return SkillCategory.BACKEND;
  }

  fallbackRuleBasedExtractor(
    title: string,
    description: string,
    requirements?: string,
  ): ExtractedSkill[] {
    const text = `${title} ${description || ''} ${
      requirements || ''
    }`.toLowerCase();
    const skillsMap = new Map<string, ExtractedSkill>();

    const rules: Array<{
      name: string;
      category: SkillCategory;
      regex: RegExp;
      isReq?: boolean;
      minScore?: number;
    }> = [
      {
        name: 'Sales Proposal Writing',
        category: SkillCategory.SALES,
        regex: /จัดทำข้อเสนอ|\b(?:prepare|write|develop) sales proposals?\b/i,
      },
      {
        name: 'Sales Quotation',
        category: SkillCategory.SALES,
        regex: /ใบเสนอราคา|\bsales quotations?\b/i,
      },
      {
        name: 'Customer Relationship Management',
        category: SkillCategory.SALES,
        regex: /ดูแลฐานลูกค้า|\bcustomer relationship management\b/i,
      },
      {
        name: 'Coordination',
        category: SkillCategory.COORDINATION,
        regex: /ประสานงาน|\bcoordination skills\b/i,
      },
      {
        name: 'Communication',
        category: SkillCategory.COORDINATION,
        regex:
          /ทักษะในการสื่อสาร|\b(?:good|strong|excellent) communication skills\b/i,
      },
      {
        name: 'Negotiation',
        category: SkillCategory.COORDINATION,
        regex: /เจรจาต่อรอง|\bnegotiation skills\b/i,
      },
      {
        name: 'Content Writing',
        category: SkillCategory.WRITING,
        regex: /\bcontent writ(?:ers?|ing)\b|\b(?:write|create) articles\b/i,
      },
      {
        name: 'Microsoft Word',
        category: SkillCategory.WRITING,
        regex: /\bmicrosoft word\b/i,
      },
      {
        name: 'OpenOffice',
        category: SkillCategory.WRITING,
        regex: /\bopen ?office\b/i,
      },
      {
        name: 'React',
        category: SkillCategory.FRONTEND,
        regex: /\b(react|react\.js|reactjs)\b/i,
      },
      {
        name: 'Next.js',
        category: SkillCategory.FRONTEND,
        regex: /\b(next\.js|nextjs)\b/i,
      },
      {
        name: 'JavaScript',
        category: SkillCategory.FRONTEND,
        regex: /\b(javascript|js|es6|es5|jsx)\b/i,
      },
      {
        name: 'TypeScript',
        category: SkillCategory.FRONTEND,
        regex: /\b(typescript|ts)\b/i,
      },
      {
        name: 'HTML5',
        category: SkillCategory.FRONTEND,
        regex: /\b(html|html5)\b/i,
      },
      {
        name: 'CSS3',
        category: SkillCategory.FRONTEND,
        regex: /\b(css|css3|css libraries)\b/i,
      },
      {
        name: 'Tailwind CSS',
        category: SkillCategory.FRONTEND,
        regex: /\b(tailwind|tailwindcss)\b/i,
      },
      {
        name: 'Bootstrap',
        category: SkillCategory.FRONTEND,
        regex: /\b(bootstrap)\b/i,
      },
      {
        name: 'Angular',
        category: SkillCategory.FRONTEND,
        regex: /\b(angular|angular 2|angular 2\.0)\b/i,
      },
      {
        name: 'Vue.js',
        category: SkillCategory.FRONTEND,
        regex: /\b(vue|vue\.js|vuejs|nuxt)\b/i,
      },
      {
        name: 'Redux',
        category: SkillCategory.FRONTEND,
        regex: /\b(redux|flux)\b/i,
      },
      { name: 'RxJS', category: SkillCategory.FRONTEND, regex: /\b(rxjs)\b/i },
      {
        name: 'Adobe XD',
        category: SkillCategory.FRONTEND,
        regex: /\b(adobe xd)\b/i,
      },
      {
        name: 'Figma',
        category: SkillCategory.FRONTEND,
        regex: /\b(figma)\b/i,
      },
      {
        name: 'Node.js',
        category: SkillCategory.BACKEND,
        regex: /\b(node\.js|nodejs)\b/i,
      },
      {
        name: 'NestJS',
        category: SkillCategory.BACKEND,
        regex: /\b(nest\.js|nestjs)\b/i,
      },
      {
        name: 'REST APIs',
        category: SkillCategory.BACKEND,
        regex: /\b(rest api|rest apis|restful|restful api|restful apis)\b/i,
      },
      {
        name: 'GraphQL',
        category: SkillCategory.BACKEND,
        regex: /\b(graphql)\b/i,
      },
      {
        name: 'Python',
        category: SkillCategory.BACKEND,
        regex: /\b(python|django|fastapi|flask)\b/i,
      },
      { name: 'Java', category: SkillCategory.BACKEND, regex: /\b(java)\b/i },
      {
        name: 'Spring Boot',
        category: SkillCategory.BACKEND,
        regex: /\b(spring boot|spring technologies|spring framework)\b/i,
      },
      {
        name: 'Go',
        category: SkillCategory.BACKEND,
        regex: /\b(golang|\bgo\b)\b/i,
      },
      {
        name: 'C#',
        category: SkillCategory.BACKEND,
        regex: /(?:^|[^a-z0-9])(c#|\.net|dotnet|asp\.net)(?:$|[^a-z0-9])/i,
      },
      {
        name: 'PHP',
        category: SkillCategory.BACKEND,
        regex: /\b(php|laravel)\b/i,
      },
      {
        name: 'PostgreSQL',
        category: SkillCategory.DATABASE,
        regex: /\b(postgres|postgresql)\b/i,
      },
      {
        name: 'MySQL',
        category: SkillCategory.DATABASE,
        regex: /\b(mysql)\b/i,
      },
      {
        name: 'MongoDB',
        category: SkillCategory.DATABASE,
        regex: /\b(mongo|mongodb)\b/i,
      },
      {
        name: 'Redis',
        category: SkillCategory.DATABASE,
        regex: /\b(redis)\b/i,
      },
      { name: 'SQL', category: SkillCategory.DATABASE, regex: /\b(sql)\b/i },
      {
        name: 'Docker',
        category: SkillCategory.DEVOPS,
        regex: /\b(docker)\b/i,
      },
      {
        name: 'Kubernetes',
        category: SkillCategory.DEVOPS,
        regex: /\b(kubernetes|k8s)\b/i,
      },
      {
        name: 'AWS',
        category: SkillCategory.DEVOPS,
        regex: /\b(aws|amazon web services)\b/i,
      },
      {
        name: 'Git',
        category: SkillCategory.DEVOPS,
        regex: /\b(git|github|gitlab)\b/i,
      },
      {
        name: 'CI/CD',
        category: SkillCategory.DEVOPS,
        regex: /\b(ci\/cd|continuous integration|continuous development)\b/i,
      },
      {
        name: 'Linux',
        category: SkillCategory.DEVOPS,
        regex: /\b(linux)\b/i,
      },
      {
        name: 'OpenShift',
        category: SkillCategory.DEVOPS,
        regex: /\b(openshift|redhat openshift)\b/i,
      },
      {
        name: 'Tomcat',
        category: SkillCategory.DEVOPS,
        regex: /\b(tomcat)\b/i,
      },
      {
        name: 'Postman',
        category: SkillCategory.TESTING,
        regex: /\b(postman)\b/i,
      },
      {
        name: 'Selenium',
        category: SkillCategory.TESTING,
        regex: /\b(selenium)\b/i,
      },
      {
        name: 'Playwright',
        category: SkillCategory.TESTING,
        regex: /\b(playwright)\b/i,
      },
      {
        name: 'Cypress',
        category: SkillCategory.TESTING,
        regex: /\b(cypress)\b/i,
      },
      { name: 'Jest', category: SkillCategory.TESTING, regex: /\b(jest)\b/i },
      {
        name: 'Automated Testing',
        category: SkillCategory.TESTING,
        regex: /\b(automation test|automated test|automation testing)\b/i,
      },
      {
        name: 'Manual Testing',
        category: SkillCategory.TESTING,
        regex: /\b(manual test|manual testing)\b/i,
      },
      {
        name: 'Functional Testing',
        category: SkillCategory.TESTING,
        regex: /(?<!non[- ])\bfunctional testing\b/i,
      },
      {
        name: 'Non-Functional Testing',
        category: SkillCategory.TESTING,
        regex: /\bnon[- ]functional testing\b/i,
      },
      {
        name: 'Integration Testing',
        category: SkillCategory.TESTING,
        regex: /\bintegration test(?:ing)?\b/i,
      },
      {
        name: 'Performance Testing',
        category: SkillCategory.TESTING,
        regex: /\bperformance test(?:ing)?\b/i,
      },
      {
        name: 'Load Testing',
        category: SkillCategory.TESTING,
        regex: /\bload test(?:ing)?\b/i,
      },
      {
        name: 'Security Testing',
        category: SkillCategory.TESTING,
        regex: /\bsecurity test(?:ing)?\b/i,
      },
      {
        name: 'Test Case Design',
        category: SkillCategory.TESTING,
        regex: /\btest cases?\b/i,
      },
      { name: 'PLC', category: SkillCategory.BACKEND, regex: /\bPLC\b/i },
      {
        name: 'Storage Systems',
        category: SkillCategory.DEVOPS,
        regex: /\bstorage systems?\b|\bsystem and storage\b/i,
      },
      {
        name: 'Technical Support',
        category: SkillCategory.DEVOPS,
        regex: /\btechnical support\b|\blevel 2 support\b/i,
      },
      {
        name: 'Network Switching',
        category: SkillCategory.DEVOPS,
        regex: /\bnetwork switches\b/i,
      },
      {
        name: 'Structured Cabling',
        category: SkillCategory.DEVOPS,
        regex: /\bstructured cabling\b/i,
      },
      {
        name: 'Server Hardware',
        category: SkillCategory.DEVOPS,
        regex: /\bserver hardware\b/i,
      },
      {
        name: 'Network Security',
        category: SkillCategory.SECURITY,
        regex: /\bnetwork security\b/i,
      },
      {
        name: 'Cybersecurity',
        category: SkillCategory.SECURITY,
        regex: /\bcyber[ -]?security\b/i,
      },
      {
        name: 'Flutter',
        category: SkillCategory.MOBILE,
        regex: /\b(flutter)\b/i,
      },
      {
        name: 'React Native',
        category: SkillCategory.MOBILE,
        regex: /\b(react[- ]native)\b/i,
      },
      {
        name: 'iOS',
        category: SkillCategory.MOBILE,
        regex: /\b(ios|swift|objective[- ]c)\b/i,
      },
      {
        name: 'Android',
        category: SkillCategory.MOBILE,
        regex: /\b(android|kotlin)\b/i,
      },
      {
        name: 'UAT',
        category: SkillCategory.TESTING,
        regex: /\b(uat|user acceptance test(?:ing)?)\b/i,
      },
      {
        name: 'Project Management',
        category: SkillCategory.COORDINATION,
        regex:
          /\b(project management|agile|scrum)\b|บริหารโครงการ|ควบคุมโครงการ|จัดการโครงการ/i,
      },
      {
        name: 'Requirements Analysis',
        category: SkillCategory.COORDINATION,
        regex:
          /\b(requirements? analysis|business requirements?|system analysis)\b|วิเคราะห์ความต้องการ|รวบรวมความต้องการ/i,
      },
      {
        name: 'Network Administration',
        category: SkillCategory.DEVOPS,
        regex:
          /\b(vpn|lan\/wan|wan\/lan|firewall|mikrotik|cisco)\b|ดูแลระบบ\s*network|ระบบเครือข่าย/i,
      },
      {
        name: 'Hardware & Software Troubleshooting',
        category: SkillCategory.DEVOPS,
        regex:
          /ซ่อมบำรุง.*(?:คอมพิวเตอร์|hardware|software)|ดูแล.*(?:hardware|software)|วิเคราะห์ปัญหา.*(?:hardware|software)|\b(?:it support|helpdesk|service desk)\b/i,
      },
      {
        name: 'SEO',
        category: SkillCategory.WRITING,
        regex: /\b(seo|search engine optimization)\b/i,
      },
    ];

    for (const r of rules) {
      if (r.regex.test(text)) {
        skillsMap.set(r.name, {
          name: r.name,
          category: r.category,
          isRequired: r.isReq !== undefined ? r.isReq : true,
          minimumScore: r.minScore || 70,
        });
      }
    }

    return Array.from(skillsMap.values());
  }
}
