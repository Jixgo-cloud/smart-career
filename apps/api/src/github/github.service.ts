import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

export interface RepoAnalysisItem {
  repoName: string;
  fullName: string;
  description: string | null;
  url: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  isFork: boolean;
  lastCommitAt: string | null;
  topics: string[];
  languagesBreakdown: Record<string, number>;
  languagePercentages: Record<string, number>;
  detectedTools: string[];
}

const LANGUAGE_SKILL_MAP: Record<string, string[]> = {
  javascript: ['javascript'],
  typescript: ['typescript'],
  python: ['python'],
  sql: ['sql'],
  plpgsql: ['postgresql', 'sql'],
  dockerfile: ['docker'],
  dart: ['flutter'],
  html: ['html'],
  css: ['css'],
  ejs: ['html', 'javascript'],
  go: ['go'],
  java: ['java'],
  'c#': ['csharp'],
  php: ['php'],
  shell: ['linux'],
};

const DEPENDENCY_SKILL_MAP: Record<string, string[]> = {
  react: ['react'],
  'react-dom': ['react'],
  next: ['nextjs', 'react', 'nodejs'],
  vue: ['vue'],
  '@angular/core': ['angular'],
  tailwindcss: ['tailwindcss', 'css'],
  '@tailwindcss/postcss': ['tailwindcss', 'css'],
  '@nestjs/core': ['nestjs', 'nodejs', 'rest-apis'],
  express: ['express', 'nodejs', 'rest-apis'],
  graphql: ['graphql'],
  '@apollo/server': ['graphql'],
  '@apollo/client': ['graphql'],
  pg: ['postgresql', 'sql'],
  '@prisma/adapter-pg': ['postgresql', 'sql'],
  prisma: ['postgresql', 'sql'],
  '@prisma/client': ['postgresql', 'sql'],
  mysql: ['mysql', 'sql'],
  mysql2: ['mysql', 'sql'],
  mariadb: ['mysql', 'sql'],
  '@prisma/adapter-mariadb': ['mysql', 'sql'],
  mongodb: ['mongodb'],
  mongoose: ['mongodb'],
  redis: ['redis'],
  ioredis: ['redis'],
  jest: ['automated-testing'],
  vitest: ['automated-testing'],
  supertest: ['automated-testing'],
  cypress: ['automated-testing'],
  playwright: ['playwright', 'automated-testing'],
  '@playwright/test': ['playwright', 'automated-testing'],
  'react-native': ['react-native'],
  expo: ['react-native'],
  'aws-sdk': ['aws'],
  '@aws-sdk/client-s3': ['aws'],
};

const DEPENDENCY_LABEL_MAP: Record<string, string> = {
  next: 'Next.js',
  nextjs: 'Next.js',
  react: 'React',
  'react-dom': 'React',
  vue: 'Vue.js',
  '@angular/core': 'Angular',
  tailwindcss: 'Tailwind CSS',
  '@tailwindcss/postcss': 'Tailwind CSS',
  '@nestjs/core': 'NestJS',
  express: 'Express.js',
  graphql: 'GraphQL',
  '@apollo/server': 'Apollo GraphQL',
  '@apollo/client': 'Apollo GraphQL',
  pg: 'PostgreSQL',
  '@prisma/adapter-pg': 'PostgreSQL',
  prisma: 'Prisma ORM',
  '@prisma/client': 'Prisma ORM',
  mysql: 'MySQL',
  mysql2: 'MySQL',
  mariadb: 'MariaDB / MySQL',
  '@prisma/adapter-mariadb': 'MariaDB / MySQL',
  mongodb: 'MongoDB',
  mongoose: 'Mongoose (MongoDB)',
  redis: 'Redis',
  ioredis: 'Redis',
  jest: 'Jest',
  vitest: 'Vitest',
  supertest: 'Supertest',
  cypress: 'Cypress',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
  'react-native': 'React Native',
  expo: 'Expo (React Native)',
  'aws-sdk': 'AWS SDK',
  '@aws-sdk/client-s3': 'AWS S3',
};

@Injectable()
export class GitHubService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeUsername(raw?: string | null): string {
    const cleaned = (raw || '').trim().replace(/^@/, '');
    if (!cleaned || !/^[a-zA-Z0-9-]{1,39}$/.test(cleaned)) {
      throw new BadRequestException(
        'Invalid GitHub username. Must be 1-39 alphanumeric or hyphen characters.',
      );
    }
    return cleaned;
  }

  computeLanguagePercentages(breakdown: Record<string, number>): Record<string, number> {
    const entries = Object.entries(breakdown || {}).filter(
      ([, bytes]) => typeof bytes === 'number' && bytes > 0,
    );
    const totalBytes = entries.reduce((sum, [, b]) => sum + b, 0);
    if (totalBytes <= 0) return {};

    const out: Record<string, number> = {};
    for (const [lang, bytes] of entries) {
      out[lang] = Math.round((bytes / totalBytes) * 1000) / 10;
    }
    return out;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'SmartCareer-Platform',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
  }

  async fetchPublicRepositories(usernameInput: string): Promise<RepoAnalysisItem[]> {
    const username = this.normalizeUsername(usernameInput);

    try {
      const res = await axios.get(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=10&sort=updated`,
        { headers: this.buildHeaders(), timeout: 8000 },
      );

      if (Array.isArray(res.data)) {
        const items: RepoAnalysisItem[] = [];
        for (const repo of res.data.slice(0, 8)) {
          let breakdown: Record<string, number> = {};
          if (repo.language) {
            breakdown[repo.language] = 10000;
          }
          try {
            if (repo.languages_url) {
              const langRes = await axios.get(repo.languages_url, {
                headers: this.buildHeaders(),
                timeout: 4000,
              });
              if (langRes.data && typeof langRes.data === 'object') {
                breakdown = langRes.data;
              }
            }
          } catch {
            // Keep primary language fallback if languages_url quota reached
          }

          const fullName = String(repo.full_name || `${username}/${repo.name}`);
          const defaultBranch = String(repo.default_branch || 'main');
          const branchesToTry = Array.from(new Set([defaultBranch, 'main', 'master']));
          const detectedPackages: string[] = [];

          for (const branch of branchesToTry) {
            try {
              const pkgRes = await axios.get(
                `https://raw.githubusercontent.com/${fullName}/${branch}/package.json`,
                { timeout: 3500 },
              );
              if (pkgRes.data && typeof pkgRes.data === 'object') {
                const depNames = Object.keys({
                  ...(pkgRes.data.dependencies || {}),
                  ...(pkgRes.data.devDependencies || {}),
                });
                for (const dep of depNames) {
                  if (DEPENDENCY_SKILL_MAP[dep.toLowerCase()]) {
                    detectedPackages.push(dep.toLowerCase());
                  }
                }
                break;
              }
            } catch {
              // Ignore if package.json does not exist on this branch
            }
          }

          const percentages = this.computeLanguagePercentages(breakdown);
          const mergedTopics = Array.from(
            new Set([
              ...(Array.isArray(repo.topics) ? repo.topics : []),
              ...detectedPackages,
            ]),
          );
          const detectedTools = Array.from(
            new Set([...Object.keys(breakdown), ...detectedPackages]),
          );
          items.push({
            repoName: String(repo.name),
            fullName,
            description: repo.description || null,
            url: String(repo.html_url || `https://github.com/${username}/${repo.name}`),
            language: repo.language || null,
            stargazersCount: Number(repo.stargazers_count || 0),
            forksCount: Number(repo.forksCount || repo.forks_count || 0),
            isFork: Boolean(repo.fork),
            lastCommitAt: repo.pushed_at || repo.updated_at || null,
            topics: mergedTopics,
            languagesBreakdown: breakdown,
            languagePercentages: percentages,
            detectedTools,
          });
        }
        return items;
      }
    } catch {
      // Fallback for offline/rate-limited test environments when ENABLE_DEV_MOCK_AUTH is enabled
      if (process.env.ENABLE_DEV_MOCK_AUTH === 'true') {
        const breakdown = { TypeScript: 68000, JavaScript: 22000, SQL: 10000 };
        return [
          {
            repoName: 'smart-web-portfolio',
            fullName: `${username}/smart-web-portfolio`,
            description: 'Full stack web application repository (context evidence only)',
            url: `https://github.com/${username}/smart-web-portfolio`,
            language: 'TypeScript',
            stargazersCount: 12,
            forksCount: 2,
            isFork: false,
            lastCommitAt: new Date().toISOString(),
            topics: ['nextjs', 'react', 'postgresql'],
            languagesBreakdown: breakdown,
            languagePercentages: this.computeLanguagePercentages(breakdown),
            detectedTools: ['TypeScript', 'JavaScript', 'React', 'Next.js', 'PostgreSQL'],
          },
        ];
      }
    }

    return [];
  }

  async analyzePublicUser(usernameInput: string) {
    const username = this.normalizeUsername(usernameInput);
    const repositories = await this.fetchPublicRepositories(username);

    const toolsSet = new Set<string>();
    const languageCountMap = new Map<string, number>();
    const frameworkCountMap = new Map<string, number>();

    for (const r of repositories) {
      const repoLanguages = new Set<string>();
      const repoFrameworks = new Set<string>();
      for (const lang of Object.keys(r.languagesBreakdown || {})) {
        repoLanguages.add(lang);
        toolsSet.add(lang);
        if (lang.toLowerCase() === 'dockerfile') {
          repoFrameworks.add('Docker');
        }
      }
      if (r.language) {
        repoLanguages.add(r.language);
      }
      for (const lang of repoLanguages) {
        languageCountMap.set(lang, (languageCountMap.get(lang) || 0) + 1);
      }
      for (const t of r.detectedTools || []) {
        toolsSet.add(t);
      }
      for (const topic of r.topics || []) {
        toolsSet.add(topic);
        const label = DEPENDENCY_LABEL_MAP[topic.toLowerCase()] || topic;
        repoFrameworks.add(label);
        if (
          topic.toLowerCase() === 'next' ||
          topic.toLowerCase() === 'express' ||
          topic.toLowerCase() === '@nestjs/core'
        ) {
          repoFrameworks.add('Node.js');
        }
      }
      for (const fw of repoFrameworks) {
        frameworkCountMap.set(fw, (frameworkCountMap.get(fw) || 0) + 1);
      }
    }

    const detectedLanguages = Array.from(languageCountMap.entries())
      .map(([name, repoCount]) => ({ name, repoCount }))
      .sort((a, b) => b.repoCount - a.repoCount || a.name.localeCompare(b.name));

    const detectedFrameworks = Array.from(frameworkCountMap.entries())
      .map(([name, repoCount]) => ({ name, repoCount }))
      .sort((a, b) => b.repoCount - a.repoCount || a.name.localeCompare(b.name));

    return {
      username,
      contextOnly: true,
      proficiencyScore: null,
      policyNote:
        'ข้อมูลจาก GitHub ใช้แสดงรายการภาษาและเทคโนโลยีที่ตรวจพบจากโปรเจกต์จริงเพื่อเป็นหลักฐานประกอบโปรไฟล์เท่านั้น (ไม่นำไปคำนวณเป็นคะแนนทักษะ)',
      repositoryCount: repositories.length,
      detectedLanguages,
      detectedTools: Array.from(toolsSet),
      detectedFrameworks,
      repositories,
    };
  }

  async syncCandidateGitHub(userId: string, requestedUsername?: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const targetUsername = requestedUsername
      ? this.normalizeUsername(requestedUsername)
      : profile.githubUsername
        ? this.normalizeUsername(profile.githubUsername)
        : null;

    if (!targetUsername) {
      throw new BadRequestException('Please provide a GitHub username to sync.');
    }

    if (
      profile.githubUsername &&
      profile.githubUsername.toLowerCase() !== targetUsername.toLowerCase()
    ) {
      throw new ForbiddenException(
        'Cannot switch GitHub account to a different username once linked.',
      );
    }

    // Ensure no other candidate owns this username
    const otherOwner = await this.prisma.candidateProfile.findFirst({
      where: {
        githubUsername: { equals: targetUsername, mode: 'insensitive' },
        userId: { not: userId },
      },
    });

    if (otherOwner) {
      throw new ForbiddenException('This GitHub username is already linked to another candidate.');
    }

    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: {
        githubUsername: targetUsername,
        githubConnectedAt: new Date(),
      },
    });

    const repos = await this.fetchPublicRepositories(targetUsername);
    const allSkills = await this.prisma.skill.findMany();
    const skillBySlug = new Map(allSkills.map((s) => [s.slug.toLowerCase(), s]));

    const syncedRepos = [];
    for (const repo of repos) {
      const savedRepo = await this.prisma.gitHubRepository.upsert({
        where: {
          candidateId_fullName: {
            candidateId: profile.id,
            fullName: repo.fullName,
          },
        },
        update: {
          repoName: repo.repoName,
          description: repo.description,
          url: repo.url,
          language: repo.language,
          stargazersCount: repo.stargazersCount,
          forksCount: repo.forksCount,
          isFork: repo.isFork,
          lastCommitAt: repo.lastCommitAt ? new Date(repo.lastCommitAt) : null,
          topics: repo.topics as any,
          languagesBreakdown: repo.languagesBreakdown as any,
        },
        create: {
          candidateId: profile.id,
          repoName: repo.repoName,
          fullName: repo.fullName,
          description: repo.description,
          url: repo.url,
          language: repo.language,
          stargazersCount: repo.stargazersCount,
          forksCount: repo.forksCount,
          isFork: repo.isFork,
          lastCommitAt: repo.lastCommitAt ? new Date(repo.lastCommitAt) : null,
          topics: repo.topics as any,
          languagesBreakdown: repo.languagesBreakdown as any,
        },
      });

      syncedRepos.push(savedRepo);

      // Link context evidence to CandidateSkill with scoreContribution = 0 (never modifies proficiency scores)
      const matchedSlugs = new Set<string>();
      if (skillBySlug.has('git')) {
        matchedSlugs.add('git');
      }
      for (const lang of Object.keys(repo.languagesBreakdown || {})) {
        const mappedList = LANGUAGE_SKILL_MAP[lang.toLowerCase()] || [lang.toLowerCase()];
        for (const mapped of mappedList) {
          if (skillBySlug.has(mapped)) {
            matchedSlugs.add(mapped);
          }
        }
      }
      for (const topic of repo.topics || []) {
        const mappedList = DEPENDENCY_SKILL_MAP[topic.toLowerCase()] || [topic.toLowerCase()];
        for (const mapped of mappedList) {
          if (skillBySlug.has(mapped)) {
            matchedSlugs.add(mapped);
          }
        }
      }

      for (const slug of matchedSlugs) {
        const skill = skillBySlug.get(slug)!;
        const candidateSkill = await this.prisma.candidateSkill.upsert({
          where: {
            candidateId_skillId: {
              candidateId: profile.id,
              skillId: skill.id,
            },
          },
          update: {},
          create: {
            candidateId: profile.id,
            skillId: skill.id,
            practicalScore: 0,
            theoryScore: 0,
            codingScore: 0,
            verifiedScore: 0,
            isVerified: false,
          },
        });

        await this.prisma.gitHubEvidence.deleteMany({
          where: {
            candidateSkillId: candidateSkill.id,
            repositoryId: savedRepo.id,
          },
        });

        await this.prisma.gitHubEvidence.create({
          data: {
            candidateSkillId: candidateSkill.id,
            repositoryId: savedRepo.id,
            dependencyMatches: repo.detectedTools as any,
            commitCount: 0,
            linesOfCode: 0,
            scoreContribution: 0, // Strictly 0 per policy
          },
        });
      }
    }

    return {
      username: targetUsername,
      syncedRepositoryCount: syncedRepos.length,
      scoreContribution: 0,
      repositories: syncedRepos,
    };
  }
}
