import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CourseSource,
  IngestionStatus,
  JobSource,
  JobType,
} from '@prisma/client';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionConfigService } from './ingestion-config.service';
import { GeminiExtractorService } from './gemini-extractor.service';
import {
  LocalJobBatchInput,
  LocalJobItemInput,
  validateLocalJobBatch,
} from './local-job-batch';
import { fetchRenderedJobHtml } from './rendered-job-html';
import { fetchPublicJobHttp2 } from './public-job-http2';
import { fetchBlognonePublicJobs } from './blognone-public-jobs';
import {
  formatStructuredJobText,
  jobSections,
  jobText,
} from './job-detail-content';
import {
  youtubeDurationFromHtml,
  youtubeDurationFromIso,
} from './youtube-duration';
import { sourceTags, udemySourceTags } from './course-source-tags';
import {
  hasCourseSkillEvidence,
  mentionsSkill,
  normalizeCourseUrl,
} from '../recommendations/course-skill-evidence';

export function formatCourseDescription(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const cleaned = formatStructuredJobText(value);
  return cleaned
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CURATED_COURSES_CATALOG = [
  {
    externalId: 'yt-js-full-course',
    title: 'JavaScript Full Course for Web Developers',
    provider: CourseSource.YOUTUBE,
    source: 'freeCodeCamp.org',
    description:
      'Comprehensive JavaScript tutorial covering functions, arrays, asynchronous programming, and DOM manipulation.\n• พื้นฐานตัวแปร ชนิดข้อมูล Functions, Arrays และ Objects ใน JavaScript (ES6+)\n• การเขียนโปรแกรมแบบ Asynchronous (Promises, Async/Await) และการจัดการ Event บน DOM\n• ฝึกปฏิบัติสร้างเว็บแอปพลิเคชันจริงสำหรับ Web Developers',
    url: 'https://www.youtube.com/watch?v=PkZNo7MFNFg',
    duration: '3h 26m',
    level: 'Beginner to Intermediate',
    rating: 4.8,
    skillSlugs: ['javascript'],
  },
  {
    externalId: 'yt-sql-postgresql-bootcamp',
    title: 'SQL and PostgreSQL Complete Database Tutorial',
    provider: CourseSource.YOUTUBE,
    source: 'freeCodeCamp.org',
    description:
      'Learn SQL queries, joins, aggregation, indexing, and relational database design with PostgreSQL.\n• การออกแบบฐานข้อมูลเชิงสัมพันธ์ (Relational Database Design) ด้วย PostgreSQL\n• การเขียนคำสั่ง SQL Queries, Joins, GROUP BY, Aggregation และ Subqueries\n• การทำ Indexing, Constraints และการปรับแต่งประสิทธิภาพฐานข้อมูล',
    url: 'https://www.youtube.com/watch?v=HXV3zeQKqGY',
    duration: '4h 20m',
    level: 'All Levels',
    rating: 4.9,
    skillSlugs: ['sql', 'postgresql'],
  },
  {
    externalId: 'yt-nodejs-nestjs-api',
    title: 'Node.js & NestJS REST API Engineering Guide',
    provider: CourseSource.YOUTUBE,
    source: 'freeCodeCamp.org',
    description:
      'Design and build secure backend services using Node.js, NestJS, Prisma ORM, and PostgreSQL.\n• สถาปัตยกรรมโมดูลของ NestJS (Controllers, Providers, Dependency Injection) บน Node.js\n• การเชื่อมต่อฐานข้อมูล PostgreSQL ด้วย Prisma ORM และการทำ Data Validation\n• การทำ Authentication (JWT / Guards) และการทดสอบระบบ REST API',
    url: 'https://www.youtube.com/watch?v=GHTA143_b-s',
    duration: '3h 45m',
    level: 'Intermediate',
    rating: 4.8,
    skillSlugs: ['nodejs', 'nestjs', 'postgresql'],
  },
  {
    externalId: 'yt-python-data-engineering',
    title: 'Python Programming for Backend & Data Processing',
    provider: CourseSource.YOUTUBE,
    source: 'Programming with Mosh',
    description:
      'Master Python data structures, algorithms, automation scripts, and data analysis workflows.\n• โครงสร้างข้อมูลของ Python (Lists, Tuples, Dictionaries, Sets) และ OOP\n• การเขียนสคริปต์อัตโนมัติ (Automation Scripts) และการประมวลผลข้อมูล\n• พื้นฐานการพัฒนา Backend และการจัดการแพ็กเกจมาตรฐานในโปรเจกต์จริง',
    url: 'https://www.youtube.com/watch?v=_uQrJ0TkZlc',
    duration: '6h 14m',
    level: 'All Levels',
    rating: 4.9,
    skillSlugs: ['python'],
  },
  {
    externalId: 'udemy-typescript-react-pro',
    title: 'Mastering TypeScript & React Modern Frontend Architecture',
    provider: CourseSource.UDEMY,
    source: 'Maximilian Schwarzmüller (Academind)',
    description:
      'Build type-safe web applications using TypeScript, React, Next.js, and modern state management patterns.\n• การพัฒนา Component และ Custom Hooks ใน React ร่วมกับ TypeScript แบบ Type-Safe\n• การจัดการ State ระดับแอปพลิเคชันด้วย Context API, Redux Toolkit และ React Router\n• การต่อยอดสู่ Full-Stack Frontend ด้วยเฟรมเวิร์ก Next.js และการเพิ่มประสิทธิภาพการเรนเดอร์',
    url: 'https://www.udemy.com/course/react-the-complete-guide-incl-redux/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&h=225&fit=crop',
    duration: '50 hours',
    level: 'All Levels',
    rating: 4.8,
    skillSlugs: ['typescript', 'react', 'nextjs'],
  },
  {
    externalId: 'udemy-the-web-developer-bootcamp',
    title: 'The Web Developer Bootcamp 2026',
    provider: CourseSource.UDEMY,
    source: 'Colt Steele',
    description:
      'The only course you need to learn web development: HTML, CSS, JavaScript, React, Node.js, MongoDB, and modern deployments.\n• พื้นฐานโครงสร้างเว็บและการจัดวาง Responsive Layout ด้วย HTML5, CSS3 และ Modern JavaScript\n• การสร้าง SPA ด้วย React และการเขียน Backend Server ด้วย Node.js และ Express\n• การออกแบบฐานข้อมูล NoSQL ด้วย MongoDB พร้อมการตั้งค่า Security และ Cloud Deployment',
    url: 'https://www.udemy.com/course/the-web-developer-bootcamp/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=225&fit=crop',
    duration: '74 hours',
    level: 'Beginner to Professional',
    rating: 4.8,
    skillSlugs: ['html', 'css', 'javascript', 'react', 'nodejs', 'mongodb'],
  },
  {
    externalId: 'udemy-complete-2026-web-development',
    title: 'The Complete Full-Stack Web Development Bootcamp',
    provider: CourseSource.UDEMY,
    source: 'Dr. Angela Yu (App Brewery)',
    description:
      'Learn modern full-stack development with hands-on projects, RESTful APIs, PostgreSQL, authentication, and cloud deployment.\n• การพัฒนา Full-Stack Web Application ด้วย JavaScript, Node.js และ Express\n• การออกแบบและคิวรีฐานข้อมูล SQL / PostgreSQL สำหรับระบบงานระดับ Production\n• การสร้าง RESTful APIs, ระบบ Authentication และการนำขึ้นระบบ Cloud',
    url: 'https://www.udemy.com/course/the-complete-web-development-bootcamp/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=225&fit=crop',
    duration: '62 hours',
    level: 'Beginner to Advanced',
    rating: 4.9,
    skillSlugs: ['javascript', 'nodejs', 'postgresql', 'sql'],
  },
  {
    externalId: 'udemy-aws-certified-developer',
    title: 'Ultimate AWS Certified Developer Associate 2026',
    provider: CourseSource.UDEMY,
    source: 'Stephane Maarek',
    description:
      'Pass the AWS Certified Developer Associate DVA-C02 exam with full hands-on practice labs on AWS, Lambda, ECS, DynamoDB.\n• การออกแบบและพัฒนา Cloud Application บน AWS (EC2, S3, IAM, VPC และ CloudFormation)\n• สถาปัตยกรรม Serverless และ Container ด้วย AWS Lambda, API Gateway, DynamoDB และ ECS\n• การตั้งค่าระบบ CI/CD, CloudWatch Monitoring และแนวทางความปลอดภัยตามมาตรฐาน AWS',
    url: 'https://www.udemy.com/course/aws-certified-developer-associate-dva-c01/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=225&fit=crop',
    duration: '32 hours',
    level: 'Intermediate',
    rating: 4.9,
    skillSlugs: ['aws'],
  },
  {
    externalId: 'udemy-nestjs-zero-to-hero',
    title: 'NestJS: The Complete Developer Guide',
    provider: CourseSource.UDEMY,
    source: 'Stephen Grider',
    description:
      'Develop scalable backend microservices with NestJS, TypeScript, dependency injection, TypeORM/Prisma integration, and production automated testing.\n• โครงสร้าง Enterprise Backend ด้วย NestJS, TypeScript และ Node.js\n• การทำ Dependency Injection, Custom Decorators, Interceptors และ Validation Pipes\n• การเชื่อมต่อฐานข้อมูลด้วย TypeORM / Prisma และการเขียน Unit & E2E Automated Testing',
    url: 'https://www.udemy.com/course/nestjs-the-complete-developers-guide/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=225&fit=crop',
    duration: '18 hours',
    level: 'Intermediate',
    rating: 4.8,
    skillSlugs: ['nestjs', 'typescript', 'nodejs'],
  },
  {
    externalId: 'udemy-complete-javascript-course',
    title: 'The Complete JavaScript Course 2026: From Zero to Expert!',
    provider: CourseSource.UDEMY,
    source: 'Jonas Schmedtmann',
    description:
      'Master modern JavaScript (ES6+, OOP, Async/Await, Webpack, Babel) by building real-world projects and learning core theory.\n• เจาะลึกการทำงานเบื้องหลังของ JavaScript Engine (Execution Context, Closures, Prototypes)\n• การเขียน Object-Oriented Programming (OOP) และ Functional Programming ใน JavaScript\n• การดึงข้อมูล API ด้วย Fetch / Async-Await และการจัดโครงสร้างโมดูลด้วย Modern Tooling',
    url: 'https://www.udemy.com/course/the-complete-javascript-course/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1579468118864-1b9ea3c0db4a?w=400&h=225&fit=crop',
    duration: '68 hours',
    level: 'All Levels',
    rating: 4.8,
    skillSlugs: ['javascript'],
  },
  {
    externalId: 'udemy-complete-node-developer',
    title: 'Complete Node.js Developer: Zero to Mastery (GraphQL, REST, Deno)',
    provider: CourseSource.UDEMY,
    source: 'Andrei Neagoie & Adam Odziemkowski',
    description:
      'Master Node.js, Express, MongoDB, REST APIs, GraphQL, sockets, authentication, CI/CD, and microservices.\n• สถาปัตยกรรม Event Loop และ Streams ใน Node.js ร่วมกับการสร้าง REST APIs ด้วย Express\n• การพัฒนา GraphQL Server, ระบบ Real-Time WebSockets และการจัดการฐานข้อมูล MongoDB\n• การทำ Authentication, Security Hardening และระบบอัตโนมัติด้วย CI/CD Pipelines',
    url: 'https://www.udemy.com/course/complete-nodejs-developer-zero-to-mastery/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=225&fit=crop',
    duration: '46 hours',
    level: 'Intermediate',
    rating: 4.8,
    skillSlugs: ['nodejs', 'express', 'mongodb', 'graphql', 'ci-cd'],
  },
  {
    externalId: 'udemy-docker-kubernetes-practical',
    title: 'Docker & Kubernetes: The Practical Guide',
    provider: CourseSource.UDEMY,
    source: 'Maximilian Schwarzmüller',
    description:
      'Learn Docker, Docker Compose, Multi-Container Apps, Kubernetes, EKS deployment, and configuration management from scratch.\n• การสร้างและปรับแต่ง Docker Images, Volumes, Networks และ Multi-Stage Builds\n• การจัดการระบบหลายคอนเทนเนอร์ด้วย Docker Compose สำหรับสภาพแวดล้อม Dev และ Production\n• การบริหารจัดการ Cluster, Pods, Deployments, Services และ Ingress บน Kubernetes',
    url: 'https://www.udemy.com/course/docker-kubernetes-the-practical-guide/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1605745341112-85968b19335b?w=400&h=225&fit=crop',
    duration: '23 hours',
    level: 'All Levels',
    rating: 4.9,
    skillSlugs: ['docker', 'kubernetes'],
  },
  {
    externalId: 'udemy-python-mega-course',
    title: '100 Days of Code: The Complete Python Pro Bootcamp',
    provider: CourseSource.UDEMY,
    source: 'Dr. Angela Yu',
    description:
      'Master Python by building 100 projects in 100 days. Learn Data Science, Automation, Web Development with Flask, APIs and GUI.\n• พื้นฐานถึงขั้นสูงของภาษา Python ผ่านการลงมือสร้างโปรเจกต์จริงอย่างเป็นขั้นตอน\n• การทำ Web Scraping, Workflow Automation และการสร้าง REST API / Web App ด้วย Python\n• การวิเคราะห์และประมวลผลข้อมูลด้วยไลบรารีมาตรฐานสำหรับงานสาย Data และ Backend',
    url: 'https://www.udemy.com/course/100-days-of-code/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=225&fit=crop',
    duration: '56 hours',
    level: 'Beginner to Advanced',
    rating: 4.9,
    skillSlugs: ['python'],
  },
  {
    externalId: 'udemy-sql-and-postgresql',
    title: 'SQL and PostgreSQL: The Complete Developer Guide',
    provider: CourseSource.UDEMY,
    source: 'Stephen Grider',
    description:
      'Become an expert with SQL and PostgreSQL. Master database design, complex joins, views, indexing, and query optimization.\n• การออกแบบ Schema, Normalization และการจัดการความสัมพันธ์ของข้อมูลใน PostgreSQL\n• การเขียนคำสั่ง SQL ขั้นสูง (CTEs, Window Functions, Views, Materialized Views)\n• การวิเคราะห์ Query Plan (EXPLAIN ANALYZE), B-Tree Indexing และการทำ Transactions',
    url: 'https://www.udemy.com/course/sql-and-postgresql/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=400&h=225&fit=crop',
    duration: '22 hours',
    level: 'All Levels',
    rating: 4.8,
    skillSlugs: ['sql', 'postgresql'],
  },
  {
    externalId: 'udemy-git-github-bootcamp',
    title: 'The Git & GitHub Bootcamp',
    provider: CourseSource.UDEMY,
    source: 'Colt Steele',
    description:
      'Master Git, GitHub, branching, rebasing, stash, cherry-picking, interactive rebase, and open-source contributions.\n• การจัดการ Version Control ด้วย Git (Commits, Branches, Merging และ Conflict Resolution)\n• เทคนิคระดับมืออาชีพ: Git Stash, Interactive Rebase, Cherry-Pick และ Reflog\n• การทำงานร่วมกันเป็นทีมผ่าน GitHub Pull Requests, Code Reviews และ Git Workflows',
    url: 'https://www.udemy.com/course/git-and-github-bootcamp/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1618401471353-b98aedd04e11?w=400&h=225&fit=crop',
    duration: '17 hours',
    level: 'Beginner to Advanced',
    rating: 4.8,
    skillSlugs: ['git'],
  },
  {
    externalId: 'udemy-go-complete-developer',
    title: 'Go: The Complete Developer Guide (Golang)',
    provider: CourseSource.UDEMY,
    source: 'Stephen Grider',
    description:
      'Master concurrency with goroutines and channels, type interfaces, testing, and building web servers with Go.\n• โครงสร้างภาษา Go (Structs,Slices, Maps, Pointers และ Type Interfaces)\n• การเขียนโปรแกรมแบบ Concurrency ประสิทธิภาพสูงด้วย Goroutines และ Channels\n• การจัดการ Package, Automated Testing และการสร้างระบบ Backend Services ด้วย Golang',
    url: 'https://www.udemy.com/course/go-the-complete-developers-guide/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=225&fit=crop',
    duration: '10 hours',
    level: 'Intermediate',
    rating: 4.8,
    skillSlugs: ['go'],
  },
  {
    externalId: 'udemy-typescript-developer-guide',
    title: 'TypeScript: The Complete Developer Guide',
    provider: CourseSource.UDEMY,
    source: 'Stephen Grider',
    description:
      'Master TypeScript design patterns, generic classes, decorators, and integration with React and Redux.\n• ระบบ Type Annotations, Interfaces, Type Guards และ Generics ขั้นสูงใน TypeScript\n• การประยุกต์ใช้ Design Patterns และ Decorators สำหรับโค้ดขนาดใหญ่ที่ดูแลรักษาง่าย\n• การผสาน TypeScript เข้ากับโปรเจกต์ React, Redux และ Express อย่างสมบูรณ์',
    url: 'https://www.udemy.com/course/typescript-the-complete-developers-guide/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516116211227-bbc03a276e7b?w=400&h=225&fit=crop',
    duration: '24 hours',
    level: 'All Levels',
    rating: 4.8,
    skillSlugs: ['typescript', 'react'],
  },
  {
    externalId: 'udemy-nextjs-complete-guide',
    title: 'Next.js 15 & React - The Complete Guide',
    provider: CourseSource.UDEMY,
    source: 'Maximilian Schwarzmüller',
    description:
      'Build fullstack React applications with Next.js 15, App Router, Server Actions, Authentication, and Vercel Deployment.\n• สถาปัตยกรรม Next.js App Router, React Server Components (RSC) และ Streaming SSR\n• การจัดการข้อมูลด้วย Server Actions, Caching, Revalidation และ API Routes\n• การทำระบบ Authentication, SEO Metadata และการ Deploy ขึ้นระบบ Production',
    url: 'https://www.udemy.com/course/nextjs-react-the-complete-guide/',
    thumbnailUrl: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400&h=225&fit=crop',
    duration: '31 hours',
    level: 'All Levels',
    rating: 4.9,
    skillSlugs: ['nextjs', 'react'],
  },
];

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: IngestionConfigService,
    private readonly extractor: GeminiExtractorService,
  ) {}

  private async fetchNativeHtml(url: string, timeoutSec = 12): Promise<string> {
    try {
      const response = await axios.get<string>(url, {
        timeout: timeoutSec * 1000,
        maxContentLength: 25 * 1024 * 1024,
        responseType: 'text',
        headers: {
          'User-Agent': 'SmartCareer/1.0',
          Accept: 'text/html',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.7',
        },
      });
      if (!response.data?.trim()) {
        throw new Error('SOURCE_EMPTY_RESPONSE: ต้นทางส่งหน้าว่าง');
      }
      return response.data;
    } catch (err: any) {
      if (err.message?.startsWith('SOURCE_')) throw err;
      const status = err.response?.status;
      throw new Error(
        status
          ? `SOURCE_HTTP_${status}: ต้นทางปฏิเสธหรือไม่พร้อมให้ดึงข้อมูล รักษางานเดิมไว้`
          : 'SOURCE_CONNECTION_FAILED: ติดต่อแหล่งงานไม่ได้หรือหมดเวลารอ รักษางานเดิมไว้',
      );
    }
  }

  public async fetchJobSourceHtml(url: string): Promise<string> {
    try {
      const html = await this.fetchNativeHtml(url);
      const $ = cheerio.load(html);
      const ready =
        new URL(url).hostname === 'th.jobsdb.com'
          ? $('[data-testid="job-card"], script')
              .toArray()
              .some(
                (el) =>
                  $(el).is('[data-testid="job-card"]') ||
                  ($(el).html() || '').includes('window.SEEK_REDUX_DATA'),
              )
          : $('a[href*="/job/"] h3').length > 0;
      if (ready) return html;
    } catch (error: any) {
      if (!/^SOURCE_HTTP_403:/.test(error?.message || '')) throw error;
      try {
        const html = await fetchPublicJobHttp2(url);
        const $ = cheerio.load(html);
        const ready =
          new URL(url).hostname === 'th.jobsdb.com'
            ? $('[data-testid="job-card"]').length > 0 ||
              html.includes('window.SEEK_REDUX_DATA')
            : $('a[href*="/job/"] h3').length > 0;
        if (ready) return html;
      } catch (http2Error: any) {
        if (
          !/^SOURCE_HTTP_403:|^SOURCE_HTTP2_CONNECTION_FAILED:|^SOURCE_HTTP2_ENCODING_UNSUPPORTED:/.test(
            http2Error?.message || '',
          )
        ) {
          throw http2Error;
        }
      }
    }
    this.logger.log(
      '[Job Scraper] Reading the public listing with a fresh browser',
    );
    return fetchRenderedJobHtml(url);
  }

  async collectLocalJobs(source: JobSource, limit: number) {
    if (
      ![JobSource.JOBSDB, JobSource.BLOGNONE].includes(source as any) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 60
    ) {
      throw new BadRequestException('แหล่งงานหรือจำนวนไม่ถูกต้อง');
    }
    const candidateLimit = Math.min(Math.max(limit * 2, 10), 60);
    const rawJobs =
      source === JobSource.JOBSDB
        ? await this.scrapeJobsDBJobs('developer', candidateLimit)
        : await this.scrapeBlognoneJobs(candidateLimit);

    const jobs: any[] = [];
    for (const raw of rawJobs) {
      if (jobs.length >= limit) break;
      try {
        if (
          source !== JobSource.BLOGNONE ||
          !raw.description ||
          raw.description.length < 200 ||
          (!raw.logoUrl && !raw.companyLogoUrl)
        ) {
          const deep = await this.extractor.fetchDeepJobDetails(
            source,
            raw.url,
            {},
          );
          Object.assign(raw, deep);
        }
      } catch (err: any) {
        if (err?.message === 'SOURCE_LISTING_CLOSED') {
          raw.isActive = false;
        }
      }
      if (raw.isActive === false) {
        const extId = String(raw.id || raw.externalId || '');
        const srcUrl = String(raw.url || '');
        if (extId || srcUrl) {
          await this.prisma.job
            .updateMany({
              where: {
                source,
                isActive: true,
                OR: [
                  ...(extId ? [{ externalId: extId }] : []),
                  ...(srcUrl ? [{ sourceUrl: srcUrl }] : []),
                ],
              },
              data: { isActive: false },
            })
            .catch(() => {});
        }
        continue;
      }

      const cleanedDesc = jobText(raw.description || raw.title);
      const sections = jobSections(cleanedDesc);
      raw.description = cleanedDesc || raw.title;
      raw.requirements = raw.requirements || sections.requirements || undefined;
      raw.benefits = raw.benefits || sections.benefits || undefined;

      const extracted = await this.extractor.extractJobSkills({
        title: raw.title,
        description: raw.description,
        requirements: raw.requirements,
      });
      if (extracted.length === 0) continue;

      jobs.push(raw);
    }

    const { validatedBatch } = validateLocalJobBatch({
      version: 1,
      source,
      collectedAt: new Date().toISOString(),
      jobs,
    });
    return validatedBatch;
  }

  private async scrapeBlognoneJobs(limit = 15): Promise<any[]> {
    this.logger.log(
      `[Blognone Scraper] Fetching live jobs from Blognone (quota: ${limit})...`,
    );
    const jobs: any[] = [];
    try {
      // Primary Strategy: Direct HTTP/2 GraphQL API (home_jobs + active jobs catalog with full descriptions)
      try {
        const publicJobs = await fetchBlognonePublicJobs(limit);
        if (publicJobs.length > 0) {
          this.logger.log(
            `[Blognone Scraper] Read ${publicJobs.length} real active jobs from the public GraphQL API over HTTP/2`,
          );
          return publicJobs;
        }
      } catch (apiError: any) {
        this.logger.warn(
          `[Blognone Scraper] GraphQL HTTP/2 fallback triggered: ${apiError?.message}`,
        );
      }

      // Secondary Strategy: HTML over HTTP/1.1 -> HTTP/2 -> Isolated Browser
      let html: string;
      try {
        html = await this.fetchJobSourceHtml(
          'https://jobs.blognone.com/search',
        );
      } catch (error: any) {
        if (!/^SOURCE_HTTP_403:/.test(error?.message || '')) throw error;
        html = await fetchPublicJobHttp2('https://jobs.blognone.com/');
      }
      const $ = cheerio.load(html);
      $('style, script').remove();

      $('a[href*="/job/"]').each((_, el) => {
        if (jobs.length >= limit) return;
        const href = $(el).attr('href');
        const rawText = $(el).text().trim().replace(/\s+/g, ' ');
        if (
          !href ||
          !rawText ||
          !$(el).find('h3').first().text().trim() ||
          jobs.some((j) => j.url.includes(href))
        ) {
          return;
        }

        const salaryMatch = rawText.match(/฿([\d,]+)-฿([\d,]+)/);
        let salaryMin: number | null = null;
        let salaryMax: number | null = null;
        if (salaryMatch) {
          salaryMin = parseInt(salaryMatch[1].replace(/,/g, ''), 10) || null;
          salaryMax = parseInt(salaryMatch[2].replace(/,/g, ''), 10) || null;
        }

        const cleanedTitle = (
          $(el).find('h3').first().text().trim() || rawText
        )
          .replace(/฿[\d,]+-฿[\d,]+.*$/, '')
          .replace(/^[0-9]+ (hours|days|mins|day) ago/i, '')
          .replace(/\.css-[a-z0-9]+/gi, '')
          .trim();

        const company =
          $(el)
            .find('h4')
            .first()
            .nextAll('span')
            .not('[itemtype], .text-muted')
            .first()
            .text()
            .trim() || 'ไม่ระบุบริษัท';

        const rawImgSrc = $(el).find('img').first().attr('src')?.trim() || '';
        const cardLogoUrl = rawImgSrc.startsWith('https://') ? rawImgSrc : null;

        jobs.push({
          id: href.replace(/^\/.*\/job\//, '').replace(/\//g, '-'),
          title: cleanedTitle.slice(0, 100),
          company,
          logoUrl: cardLogoUrl,
          companyLogoUrl: cardLogoUrl,
          description: cleanedTitle,
          location:
            rawText.includes('กรุงเทพ') || rawText.includes('Bangkok')
              ? 'Bangkok, Thailand'
              : 'ไม่ระบุสถานที่',
          isRemote:
            rawText.toLowerCase().includes('remote') ||
            rawText.toLowerCase().includes('wfh'),
          employmentType: /contract/i.test($(el).find('h4').first().text())
            ? JobType.CONTRACT
            : /part[ -]?time/i.test($(el).find('h4').first().text())
              ? JobType.PART_TIME
              : /intern/i.test($(el).find('h4').first().text())
                ? JobType.INTERNSHIP
                : JobType.FULL_TIME,
          salaryMin,
          salaryMax,
          url: new URL(href, 'https://jobs.blognone.com').href,
        });
      });

      if (jobs.length > 0) {
        this.logger.log(
          `[Blognone Scraper] Successfully extracted ${jobs.length} real live jobs from Blognone HTML!`,
        );
      }
    } catch (err: any) {
      throw new Error(
        `BLOGNONE: ${
          err.message?.startsWith('SOURCE_')
            ? err.message
            : 'SOURCE_PARSE_FAILED: อ่านรายการงานจากต้นทางไม่ได้'
        }`,
      );
    }

    return jobs.slice(0, limit);
  }

  private async scrapeJobsDBJobs(
    keyword = 'developer',
    limit = 30,
  ): Promise<any[]> {
    this.logger.log(
      `[JobsDB Scraper] Fetching live jobs for '${keyword}' from th.jobsdb.com (quota: ${limit})...`,
    );
    const jobs: any[] = [];
    const maxPages = Math.min(2, Math.ceil(limit / 30));

    for (let page = 1; page <= maxPages; page++) {
      if (jobs.length >= limit) break;
      try {
        const pageUrl =
          page === 1
            ? `https://th.jobsdb.com/jobs?keywords=${encodeURIComponent(
                keyword,
              )}`
            : `https://th.jobsdb.com/jobs?keywords=${encodeURIComponent(
                keyword,
              )}&page=${page}`;

        const html = await this.fetchJobSourceHtml(pageUrl);
        const $ = cheerio.load(html);

        $('[data-testid="job-card"]').each((_, el) => {
          if (jobs.length >= limit) return;
          const card = $(el);
          const title = card
            .find('[data-automation="jobTitle"]')
            .first()
            .text()
            .trim();
          const href = card
            .find('[data-automation="jobTitle"]')
            .first()
            .attr('href');
          const jobNumber = href?.match(/^\/job\/(\d+)(?:[?#]|$)/)?.[1];
          const company = card
            .find('[data-automation="jobCompany"]')
            .first()
            .text()
            .trim();
          if (
            !title ||
            !jobNumber ||
            !company ||
            jobs.some((job) => job.id === `jobsdb-${jobNumber}`)
          ) {
            return;
          }
          const description = card
            .find('[data-automation="jobShortDescription"]')
            .first()
            .text()
            .trim();
          const arrangement = card
            .find('[data-testid="work-arrangement"]')
            .first()
            .text()
            .trim();
          const rawCardLogo =
            card
              .find(
                '[data-automation="company-logo"] img, [data-testid="company-logo-container"] img, img[data-testid="job-list-item-logo"], img',
              )
              .first()
              .attr('src')
              ?.trim() || '';
          const cardLogoUrl = rawCardLogo.startsWith('https://')
            ? rawCardLogo
            : null;
          jobs.push({
            id: `jobsdb-${jobNumber}`,
            title,
            company,
            logoUrl: cardLogoUrl,
            companyLogoUrl: cardLogoUrl,
            description: description || title,
            location:
              card
                .find('[data-automation="jobLocation"]')
                .first()
                .text()
                .trim() || 'Bangkok, Thailand',
            isRemote: /remote|work from home|wfh/i.test(arrangement),
            employmentType: /Contract\/Temp/.test(card.text())
              ? JobType.CONTRACT
              : /Part time/.test(card.text())
                ? JobType.PART_TIME
                : JobType.FULL_TIME,
            salaryMin: null,
            salaryMax: null,
            url: `https://th.jobsdb.com/job/${jobNumber}`,
          });
        });

        $('script').each((_, el) => {
          if (jobs.length >= limit) return;
          const text = $(el).html() || '';
          const match = text.match(/window\.SEEK_REDUX_DATA\s*=\s*(\{.*?\});/s);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              const results = data?.results?.results?.jobs || [];
              for (const j of results) {
                if (jobs.length >= limit) break;
                if (j && j.id && j.title) {
                  const jobId = `jobsdb-${j.id}`;
                  if (jobs.some((existing) => existing.id === jobId)) continue;

                  const isRemote =
                    (j.title + ' ' + (j.teaser || ''))
                      .toLowerCase()
                      .includes('remote') ||
                    (j.title + ' ' + (j.teaser || ''))
                      .toLowerCase()
                      .includes('wfh');

                  const rawSeekLogo =
                    j.branding?.serpLogoUrl ||
                    j.branding?.assets?.logo?.strategies?.jdpLogo ||
                    j.branding?.assets?.logo?.strategies?.serpLogo ||
                    j.advertiser?.logoUrl ||
                    '';
                  const seekLogoUrl =
                    typeof rawSeekLogo === 'string' &&
                    rawSeekLogo.trim().startsWith('https://')
                      ? rawSeekLogo.trim()
                      : null;

                  jobs.push({
                    id: jobId,
                    title: j.title,
                    company: j.advertiser?.description || 'ไม่ระบุบริษัท',
                    logoUrl: seekLogoUrl,
                    companyLogoUrl: seekLogoUrl,
                    description: j.teaser || j.title,
                    location: j.location || 'Bangkok, Thailand',
                    isRemote,
                    employmentType: JobType.FULL_TIME,
                    salaryMin: null,
                    salaryMax: null,
                    url: `https://th.jobsdb.com/job/${j.id}`,
                  });
                }
              }
            } catch (e: any) {
              this.logger.warn(
                `[JobsDB Scraper] Failed to parse SEEK JSON: ${e.message}`,
              );
            }
          }
        });
      } catch (err: any) {
        if (!jobs.length) {
          throw new Error(
            `JOBSDB: ${
              err.message?.startsWith('SOURCE_')
                ? err.message
                : 'SOURCE_PARSE_FAILED: อ่านรายการงานจากต้นทางไม่ได้'
            }`,
          );
        }
        this.logger.warn(
          `[JobsDB Scraper] Could not fetch additional page ${page}; retaining ${jobs.length} fetched jobs`,
        );
      }
    }

    if (jobs.length > 0) {
      this.logger.log(
        `[JobsDB Scraper] Successfully extracted ${jobs.length} real live tech jobs from JobsDB Thailand (SEEK)!`,
      );
    }

    return jobs.slice(0, limit);
  }

  private async scrapeJobThaiJobs(limit = 25): Promise<any[]> {
    this.logger.log(
      `[JobThai Scraper] Running live JobThai extractor for software jobs (quota: ${limit})...`,
    );
    const jobs: any[] = [];
    const maxPages = Math.min(3, Math.ceil(limit / 20));

    for (let page = 1; page <= maxPages; page++) {
      if (jobs.length >= limit) break;
      try {
        const pageUrl =
          page === 1
            ? 'https://www.jobthai.com/th/jobs?keyword=software'
            : `https://www.jobthai.com/th/jobs?keyword=software&page=${page}`;

        const html = await this.fetchNativeHtml(pageUrl);
        const $ = cheerio.load(html);

        $('a[href*="/company/job/"], a[id^="job-list-job-"]').each((_, el) => {
          if (jobs.length >= limit) return;
          const href = $(el).attr('href');
          const title =
            $(el).find('h2, .title, strong').first().text().trim() ||
            $(el).text().trim();
          const company =
            $(el).find('[id^="job-list-company-name-"]').first().text().trim() ||
            $(el).find('.company-name').first().text().trim() ||
            'ไม่ระบุบริษัท';
          const invalidTitles = [
            'มุมมองแผนที่',
            'แผนที่',
            'กลับสู่ด้านบน',
            'สมัครงาน',
          ];
          if (
            href &&
            title &&
            title.length >= 3 &&
            !invalidTitles.some((inv) => title.includes(inv)) &&
            !jobs.some((j) => j.url.includes(href))
          ) {
            const rawImg = $(el).find('img').first().attr('src')?.trim() || '';
            let cardLogoUrl: string | null = null;
            if (rawImg) {
              try {
                const resolvedLogo = new URL(rawImg, 'https://www.jobthai.com');
                if (resolvedLogo.protocol === 'https:') {
                  cardLogoUrl = resolvedLogo.href;
                }
              } catch {}
            }
            jobs.push({
              id: href.replace(/[^0-9]/g, '') || `jobthai-${jobs.length + 1}`,
              title: title.slice(0, 100),
              company,
              logoUrl: cardLogoUrl,
              companyLogoUrl: cardLogoUrl,
              description: title,
              location: 'Bangkok, Thailand',
              isRemote: false,
              employmentType: JobType.FULL_TIME,
              salaryMin: null,
              salaryMax: null,
              url: href.startsWith('http')
                ? href
                : `https://www.jobthai.com${href}`,
            });
          }
        });
      } catch (err: any) {
        if (!jobs.length) {
          throw new Error(
            `JOBTHAI: ${
              err.message?.startsWith('SOURCE_')
                ? err.message
                : 'SOURCE_PARSE_FAILED: อ่านรายการงานจากต้นทางไม่ได้'
            }`,
          );
        }
        this.logger.warn(
          `[JobThai Scraper] Could not fetch additional page ${page}; retaining ${jobs.length} fetched jobs`,
        );
      }
    }

    if (jobs.length > 0) {
      this.logger.log(
        `[JobThai Scraper] Successfully extracted ${jobs.length} live jobs from JobThai!`,
      );
    }

    return jobs.slice(0, limit);
  }

  private async recoverStaleRuns() {
    const staleThreshold = new Date(Date.now() - 120 * 1000); // 120 seconds
    await this.prisma.ingestionRun.updateMany({
      where: {
        state: { in: ['RUNNING', 'FOLLOWING'] },
        heartbeatAt: { lt: staleThreshold },
      },
      data: {
        state: 'INTERRUPTED',
        activeKey: null,
        finishedAt: new Date(),
      },
    });
  }

  async listJobRuns(requestKey?: string) {
    await this.recoverStaleRuns();

    if (requestKey && requestKey.trim()) {
      const run = await this.prisma.ingestionRun.findUnique({
        where: { requestKey: requestKey.trim() },
      });
      return run ? [run] : [];
    }

    return this.prisma.ingestionRun.findMany({
      where: { state: { in: ['RUNNING', 'FOLLOWING'] } },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
  }

  async getJobRunById(id: string) {
    await this.recoverStaleRuns();
    const run = await this.prisma.ingestionRun.findUnique({ where: { id } });
    if (!run) {
      throw new NotFoundException('Ingestion run not found.');
    }

    if (run.state === 'FOLLOWING' && run.parentId) {
      const parent = await this.prisma.ingestionRun.findUnique({
        where: { id: run.parentId },
      });
      if (parent && parent.state !== 'RUNNING') {
        return this.prisma.ingestionRun.update({
          where: { id: run.id },
          data: {
            state: parent.state,
            finishedAt: parent.finishedAt || new Date(),
            result: parent.result as any,
          },
        });
      }
    }

    return run;
  }

  private async upsertExternalJobItem(
    source: JobSource,
    item: {
      externalId: string;
      title: string;
      companyName: string;
      companyLogoUrl?: string | null;
      description: string;
      requirements?: string | null;
      benefits?: string | null;
      location?: string;
      isRemote?: boolean;
      employmentType?: JobType;
      salaryMin?: number | null;
      salaryMax?: number | null;
      salaryCurrency?: string;
      sourceUrl: string;
    },
  ): Promise<'CREATED' | 'UPDATED' | 'DUPLICATE' | 'SKIPPED'> {
    const existingByExt = await this.prisma.job.findFirst({
      where: {
        source,
        externalId: item.externalId,
      },
      include: {
        skills: { select: { skillId: true } },
        _count: { select: { applications: true } },
      },
    });

    const existingByTitleCompany = existingByExt
      ? null
      : await this.prisma.job.findFirst({
          where: {
            title: { equals: item.title, mode: 'insensitive' },
            companyName: { equals: item.companyName, mode: 'insensitive' },
          },
          include: {
            skills: { select: { skillId: true } },
            _count: { select: { applications: true } },
          },
        });

    item.description = formatStructuredJobText(item.description);
    const initialSections = jobSections(item.description);
    item.requirements = item.requirements
      ? formatStructuredJobText(item.requirements)
      : initialSections.requirements || null;
    item.benefits = item.benefits
      ? formatStructuredJobText(item.benefits)
      : initialSections.benefits || null;

    const existing = existingByExt || existingByTitleCompany;
    let extractedSkills = await this.extractor.extractJobSkills({
      title: item.title,
      description: item.description,
      requirements: item.requirements,
    });

    if (
      extractedSkills.length === 0 &&
      (item.description || '').length < 200 &&
      ['BLOGNONE', 'JOBSDB', 'JOBTHAI'].includes(source) &&
      item.sourceUrl
    ) {
      try {
        const deep = await this.extractor.fetchDeepJobDetails(
          source,
          item.sourceUrl,
          {},
        );
        if (
          deep.description &&
          deep.description.length > (item.description || '').length
        ) {
          const cleanedDesc = formatStructuredJobText(deep.description);
          const sections = jobSections(cleanedDesc);
          item.description = cleanedDesc || item.description;
          item.requirements =
            deep.requirements || sections.requirements || item.requirements;
          item.benefits = deep.benefits || sections.benefits || item.benefits;
        }
        if (deep.logoUrl && !item.companyLogoUrl) {
          item.companyLogoUrl = deep.logoUrl;
        }
        extractedSkills = await this.extractor.extractJobSkills({
          title: item.title,
          description: item.description,
          requirements: item.requirements,
        });
      } catch (err: any) {
        if (err?.message === 'SOURCE_LISTING_CLOSED') {
          if (existing && existing.isActive) {
            await this.prisma.job
              .update({
                where: { id: existing.id },
                data: { isActive: false },
              })
              .catch(() => {});
          }
          return 'SKIPPED';
        }
      }
    }

    if (existing) {
      if (
        extractedSkills.length === 0 &&
        (existing.description || '').length > (item.description || '').length
      ) {
        extractedSkills = await this.extractor.extractJobSkills({
          title: existing.title,
          description: existing.description,
          requirements: existing.requirements,
        });
      }

      if (extractedSkills.length === 0 && existing.skills.length === 0) {
        if (
          existing.source !== JobSource.INTERNAL &&
          existing._count.applications === 0
        ) {
          await this.prisma.job.delete({ where: { id: existing.id } });
        }
        return 'SKIPPED';
      }

      const existingIsUnformatted = !(existing.description || '').includes('\n');
      const incomingIsFormatted =
        (item.description || '').includes('\n') &&
        (item.description || '').length >= 40;

      // Preserve longer verified description unless existing description was flattened without line breaks
      const keepExistingDesc =
        !(existingIsUnformatted && incomingIsFormatted) &&
        (existing.description || '').length >= (item.description || '').length;

      const hasNewSkills = extractedSkills.some(
        (sk) => !existing.skills.some((es) => es.skillId === sk.skillId),
      );

      const shouldUpdate =
        !keepExistingDesc ||
        hasNewSkills ||
        (existing.salaryMin === null && item.salaryMin !== null) ||
        (!existing.requirements && Boolean(item.requirements)) ||
        (!existing.benefits && Boolean(item.benefits)) ||
        (!existing.companyLogoUrl && Boolean(item.companyLogoUrl));

      if (!shouldUpdate) {
        return 'DUPLICATE';
      }

      await this.prisma.job.update({
        where: { id: existing.id },
        data: {
          companyLogoUrl: item.companyLogoUrl || existing.companyLogoUrl,
          description: keepExistingDesc ? existing.description : item.description,
          requirements: item.requirements || existing.requirements,
          benefits: item.benefits || existing.benefits,
          salaryMin: item.salaryMin ?? existing.salaryMin,
          salaryMax: item.salaryMax ?? existing.salaryMax,
          sourceUrl: item.sourceUrl || existing.sourceUrl,
        },
      });

      for (const sk of extractedSkills) {
        await this.prisma.jobSkill.upsert({
          where: {
            jobId_skillId: {
              jobId: existing.id,
              skillId: sk.skillId,
            },
          },
          update: {},
          create: {
            jobId: existing.id,
            skillId: sk.skillId,
            isRequired: sk.isRequired,
            minimumScore: sk.minimumScore,
            weight: 1.0,
          },
        });
      }

      return 'UPDATED';
    }

    if (extractedSkills.length === 0) {
      return 'SKIPPED';
    }

    const slug = `${item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'external-job'}-${crypto.randomBytes(3).toString('hex')}`;

    await this.prisma.job.create({
      data: {
        companyId: null,
        companyName: item.companyName,
        companyLogoUrl: item.companyLogoUrl ?? null,
        title: item.title,
        slug,
        description: item.description,
        requirements: item.requirements ?? null,
        benefits: item.benefits ?? null,
        location: item.location || 'Bangkok, Thailand',
        isRemote: Boolean(item.isRemote),
        employmentType: item.employmentType || JobType.FULL_TIME,
        salaryMin: item.salaryMin ?? null,
        salaryMax: item.salaryMax ?? null,
        salaryCurrency: item.salaryCurrency || 'THB',
        source,
        sourceUrl: item.sourceUrl,
        externalId: item.externalId,
        isActive: true,
        skills: {
          create: extractedSkills.map((sk) => ({
            skillId: sk.skillId,
            isRequired: sk.isRequired,
            minimumScore: sk.minimumScore,
            weight: 1.0,
          })),
        },
      },
    });

    return 'CREATED';
  }

  private async fetchFromExternalProvider(
    source: JobSource,
    limit: number,
  ): Promise<{
    items: Array<{
      externalId: string;
      title: string;
      companyName: string;
      companyLogoUrl?: string | null;
      requirements?: string | null;
      benefits?: string | null;
      description: string;
      location: string;
      isRemote: boolean;
      employmentType: JobType;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string;
      sourceUrl: string;
    }>;
    errorMessage: string | null;
  }> {
    if (process.env.INGESTION_SIMULATE_PROVIDER_FAILURE === 'true') {
      return {
        items: [],
        errorMessage: `Provider ${source} returned error or timed out (no sample jobs inserted).`,
      };
    }

    if (source === JobSource.REMOTIVE) {
      try {
        const candidateLimit = Math.min(Math.max(limit * 4, 20), 80);
        let res = await axios.get(
          `https://remotive.com/api/remote-jobs?category=software-dev&limit=${candidateLimit}`,
          { timeout: 10000 },
        );
        let rawJobs = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
        if (rawJobs.length === 0) {
          res = await axios.get(
            `https://remotive.com/api/remote-jobs?limit=${candidateLimit}`,
            { timeout: 10000 },
          );
          rawJobs = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
        }
        if (rawJobs.length === 0) {
          return {
            items: [],
            errorMessage: 'Remotive returned 0 jobs.',
          };
        }

        const items: Array<any> = [];
        for (const j of rawJobs) {
          if (items.length >= limit) break;
          const rawRemotiveLogo = String(
            j.company_logo || j.company_logo_url || '',
          ).trim();
          const cleanedRemotiveDesc = formatStructuredJobText(
            String(j.description || ''),
          ).slice(0, 15000);
          const remotiveSections = jobSections(cleanedRemotiveDesc);
          const candidateItem = {
            externalId: `remotive-${j.id}`,
            title: String(j.title || 'Software Engineer').trim(),
            companyName: String(j.company_name || 'Remote Company').trim(),
            companyLogoUrl: rawRemotiveLogo.startsWith('https://')
              ? rawRemotiveLogo
              : null,
            description: cleanedRemotiveDesc,
            requirements: remotiveSections.requirements || null,
            benefits: remotiveSections.benefits || null,
            location: String(j.candidate_required_location || 'Remote'),
            isRemote: true,
            employmentType: JobType.REMOTE,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: 'USD',
            sourceUrl: String(j.url || 'https://remotive.com'),
          };

          const extractedSkills = await this.extractor.extractJobSkills({
            title: candidateItem.title,
            description: candidateItem.description,
          });
          if (extractedSkills.length === 0) continue;

          items.push(candidateItem);
        }

        if (items.length === 0) {
          return {
            items: [],
            errorMessage:
              'Remotive returned 0 jobs with verifiable skills.',
          };
        }

        return {
          items,
          errorMessage: null,
        };
      } catch (err: any) {
        return {
          items: [],
          errorMessage: `Remotive request failed: ${err?.message || 'network error'}`,
        };
      }
    }

    if (source === JobSource.JSEARCH) {
      const apiKey = (process.env.JSEARCH_API_KEY || process.env.RAPIDAPI_KEY || '').trim();
      if (!apiKey) {
        return {
          items: [],
          errorMessage: 'JSEARCH_API_KEY is not configured. Preserving existing jobs without inserting sample jobs.',
        };
      }
      try {
        const url =
          process.env.JSEARCH_API_URL ||
          'https://jsearch.p.rapidapi.com/search-v2';
        const isV2 = url.includes('search-v2');
        const res = await axios.get(url, {
          params: isV2
            ? { query: 'software developer', country: 'th', num_pages: '1' }
            : {
                query: 'software developer in thailand',
                page: '1',
                num_pages: '1',
              },
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          },
          timeout: 15000,
        });
        const rawList = Array.isArray(res.data?.data?.jobs)
          ? res.data.data.jobs
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        if (rawList.length === 0) {
          return { items: [], errorMessage: 'JSearch returned 0 items.' };
        }
        const items: Array<any> = [];
        for (const j of rawList) {
          if (items.length >= limit) break;
          const cleanedJSearchDesc = formatStructuredJobText(
            String(j.job_description || j.description || 'Job description'),
          );
          const jsearchSections = jobSections(cleanedJSearchDesc);
          const candidateItem = {
            externalId: `jsearch-${j.job_id || j.id}`,
            title: String(j.job_title || j.title || 'Developer').trim(),
            companyName: String(
              j.employer_name || j.company_name || 'Company',
            ).trim(),
            companyLogoUrl: j.employer_logo || null,
            description: cleanedJSearchDesc,
            requirements: Array.isArray(j.job_highlights?.Qualifications)
              ? j.job_highlights.Qualifications.map((q: string) =>
                  /^[-•*]/.test(String(q).trim()) ? String(q).trim() : `• ${String(q).trim()}`,
                ).join('\n')
              : jsearchSections.requirements || null,
            benefits: Array.isArray(j.job_highlights?.Benefits)
              ? j.job_highlights.Benefits.map((b: string) =>
                  /^[-•*]/.test(String(b).trim()) ? String(b).trim() : `• ${String(b).trim()}`,
                ).join('\n')
              : jsearchSections.benefits || null,
            location: String(
              j.job_location || j.job_city || j.job_country || 'Thailand',
            ),
            isRemote: Boolean(j.job_is_remote),
            employmentType: JobType.FULL_TIME,
            salaryMin:
              typeof j.job_min_salary === 'number'
                ? Math.round(j.job_min_salary)
                : null,
            salaryMax:
              typeof j.job_max_salary === 'number'
                ? Math.round(j.job_max_salary)
                : null,
            salaryCurrency: String(j.job_salary_currency || 'THB').slice(0, 3),
            sourceUrl: String(
              j.job_apply_link || j.job_google_link || 'https://example.com',
            ),
          };
          const extractedSkills = await this.extractor.extractJobSkills({
            title: candidateItem.title,
            description: candidateItem.description,
            requirements: candidateItem.requirements,
          });
          if (extractedSkills.length === 0) continue;
          items.push(candidateItem);
        }
        if (items.length === 0) {
          return {
            items: [],
            errorMessage: 'JSearch returned 0 items with verifiable skills.',
          };
        }
        return {
          items,
          errorMessage: null,
        };
      } catch (err: any) {
        return {
          items: [],
          errorMessage: `JSearch request failed: ${err?.message || 'error'}`,
        };
      }
    }

    if (
      source === JobSource.BLOGNONE ||
      source === JobSource.JOBSDB ||
      source === JobSource.JOBTHAI
    ) {
      try {
        const candidateLimit = Math.min(Math.max(limit * 3, 12), 45);
        const rawJobs =
          source === JobSource.BLOGNONE
            ? await this.scrapeBlognoneJobs(candidateLimit)
            : source === JobSource.JOBSDB
              ? await this.scrapeJobsDBJobs('developer', candidateLimit)
              : await this.scrapeJobThaiJobs(candidateLimit);

        if (rawJobs.length === 0) {
          return {
            items: [],
            errorMessage: `No live jobs returned from ${source}; existing jobs were kept and no sample jobs were inserted.`,
          };
        }

        const items: Array<any> = [];
        let partialDetailError: string | null = null;

        for (const raw of rawJobs) {
          if (items.length >= limit) break;
          try {
            // Always fetch deep details for JOBSDB & JOBTHAI (card only has short teaser),
            // and for BLOGNONE if GraphQL description was shorter than 200 chars or missing logo
            if (
              source !== JobSource.BLOGNONE ||
              !raw.description ||
              raw.description.length < 200 ||
              (!raw.logoUrl && !raw.companyLogoUrl)
            ) {
              const deep = await this.extractor.fetchDeepJobDetails(
                source,
                raw.url,
                {},
              );
              Object.assign(raw, deep);
            }
          } catch (detailErr: any) {
            if (detailErr?.message === 'SOURCE_LISTING_CLOSED') {
              raw.isActive = false;
            } else {
              partialDetailError = `${source}: บางรายการอ่านรายละเอียดเต็มไม่ได้ เก็บข้อมูลที่ยืนยันได้และรักษารายละเอียดเดิมไว้`;
            }
          }

          if (raw.isActive === false) {
            const extId = String(raw.id || raw.externalId || '');
            const srcUrl = String(raw.url || '');
            if (extId || srcUrl) {
              await this.prisma.job
                .updateMany({
                  where: {
                    source,
                    isActive: true,
                    OR: [
                      ...(extId ? [{ externalId: extId }] : []),
                      ...(srcUrl ? [{ sourceUrl: srcUrl }] : []),
                    ],
                  },
                  data: { isActive: false },
                })
                .catch(() => {});
            }
            continue;
          }

          const cleanedDesc = jobText(raw.description || raw.title);
          const sections = jobSections(cleanedDesc);

          const candidateItem = {
            externalId: String(
              raw.id ||
                raw.externalId ||
                `${source.toLowerCase()}-${raw.title}`,
            ),
            title: String(raw.title || 'Software Engineer').trim(),
            companyName: String(raw.company || 'Verified Company').trim(),
            companyLogoUrl: raw.logoUrl || raw.companyLogoUrl || null,
            description: cleanedDesc || String(raw.title),
            requirements: raw.requirements || sections.requirements || null,
            benefits: raw.benefits || sections.benefits || null,
            location: String(raw.location || 'Bangkok, Thailand'),
            isRemote: Boolean(raw.isRemote),
            employmentType: (raw.employmentType as JobType) || JobType.FULL_TIME,
            salaryMin:
              typeof raw.salaryMin === 'number' ? Math.round(raw.salaryMin) : null,
            salaryMax:
              typeof raw.salaryMax === 'number' ? Math.round(raw.salaryMax) : null,
            salaryCurrency: String(raw.salaryCurrency || 'THB').slice(0, 3),
            sourceUrl: String(raw.url),
          };

          const extractedSkills = await this.extractor.extractJobSkills({
            title: candidateItem.title,
            description: candidateItem.description,
            requirements: candidateItem.requirements,
          });
          if (extractedSkills.length === 0) continue;

          items.push(candidateItem);
        }

        if (items.length === 0) {
          return {
            items: [],
            errorMessage: `${source} returned 0 active jobs with verifiable skills.`,
          };
        }

        return { items, errorMessage: partialDetailError };
      } catch (err: any) {
        return {
          items: [],
          errorMessage: `${source} scraping failed: ${err?.message || 'error'}`,
        };
      }
    }

    // For other sources when live scraping is blocked or unreachable, report failure honestly (NEVER insert sample jobs!)
    return {
      items: [],
      errorMessage: `Live source ${source} is unreachable from this host or returned 0 verifiable items. Use Local Job Batch import if needed.`,
    };
  }

  async startOrFollowJobRun(body: {
    source: string;
    limit?: number;
    requestKey?: string;
  }) {
    await this.recoverStaleRuns();

    const sourceStr = String(body?.source || 'JOBSDB').toUpperCase();
    if (
      !Object.values(JobSource).includes(sourceStr as JobSource) ||
      sourceStr === 'INTERNAL'
    ) {
      throw new BadRequestException(`Invalid external job source "${sourceStr}".`);
    }

    const quota =
      body?.limit !== undefined
        ? Math.max(1, Math.min(100, Math.floor(Number(body.limit))))
        : this.configService.getQuotaForSource(sourceStr);

    const requestKey = (body?.requestKey || crypto.randomUUID()).trim();

    // 1. Check idempotency by requestKey
    const existingByKey = await this.prisma.ingestionRun.findUnique({
      where: { requestKey },
    });

    if (existingByKey) {
      if (existingByKey.source !== sourceStr || existingByKey.quota !== quota) {
        throw new ConflictException(
          'requestKey was already used with a different source or limit.',
        );
      }
      return this.getJobRunById(existingByKey.id);
    }

    // 2. Check if there is an active RUNNING run for the same source
    const activeParent = await this.prisma.ingestionRun.findFirst({
      where: {
        activeKey: sourceStr,
        state: 'RUNNING',
      },
    });

    if (activeParent) {
      return this.prisma.ingestionRun.create({
        data: {
          requestKey,
          source: sourceStr,
          quota,
          parentId: activeParent.id,
          activeKey: null,
          state: 'FOLLOWING',
        },
      });
    }

    // 3. Create active run and execute import
    const run = await this.prisma.ingestionRun.create({
      data: {
        requestKey,
        source: sourceStr,
        quota,
        activeKey: sourceStr,
        state: 'RUNNING',
      },
    });

    const startedAt = new Date();
    const fetched = await this.fetchFromExternalProvider(sourceStr as JobSource, quota);

    let createdCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let errorCount = fetched.errorMessage ? 1 : 0;

    for (const item of fetched.items) {
      try {
        const outcome = await this.upsertExternalJobItem(
          sourceStr as JobSource,
          item,
        );
        if (outcome === 'CREATED') createdCount += 1;
        else if (outcome === 'UPDATED') updatedCount += 1;
        else if (outcome === 'SKIPPED') skippedCount += 1;
        else duplicateCount += 1;
      } catch {
        errorCount += 1;
      }
    }

    let deactivatedClosedCount = 0;
    try {
      const cleanup = await this.cleanupClosedJobs('ALL', 300, {
        deleteMode: 'DEACTIVATE',
      });
      deactivatedClosedCount = cleanup.deactivatedCount;
    } catch {}

    const status: IngestionStatus =
      fetched.items.length === 0 && errorCount > 0
        ? IngestionStatus.FAILED
        : errorCount > 0
          ? IngestionStatus.PARTIAL_SUCCESS
          : IngestionStatus.SUCCESS;

    const resultPayload = {
      status,
      source: sourceStr,
      quota,
      createdCount,
      updatedCount,
      duplicateCount,
      skippedCount,
      deactivatedClosedCount,
      errorCount,
      errorMessage: fetched.errorMessage,
    };

    await this.prisma.ingestionLog.create({
      data: {
        source: sourceStr,
        status,
        startedAt,
        finishedAt: new Date(),
        createdCount,
        updatedCount,
        duplicateCount,
        errorCount,
        errorMessage: fetched.errorMessage,
        metadata: {
          requestKey,
          runId: run.id,
          skippedCount,
          deactivatedClosedCount,
        } as any,
      },
    });

    const completedRun = await this.prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        state: 'COMPLETED',
        activeKey: null,
        heartbeatAt: new Date(),
        finishedAt: new Date(),
        result: resultPayload as any,
      },
    });

    // Update any FOLLOWING child runs
    await this.prisma.ingestionRun.updateMany({
      where: { parentId: run.id, state: 'FOLLOWING' },
      data: {
        state: 'COMPLETED',
        finishedAt: new Date(),
        result: resultPayload as any,
      },
    });

    return completedRun;
  }

  async previewLocalJobs(rawBatch: any) {
    const { validatedBatch, digest } = validateLocalJobBatch(rawBatch);
    const source = validatedBatch.source as JobSource;

    let newCount = 0;
    let duplicateCount = 0;
    let skippedNoSkillCount = 0;
    const previewItems = [];

    for (const job of validatedBatch.jobs) {
      const existing = await this.prisma.job.findFirst({
        where: {
          OR: [
            { source, externalId: job.id },
            {
              title: { equals: job.title, mode: 'insensitive' },
              companyName: { equals: job.company, mode: 'insensitive' },
            },
          ],
        },
        select: { id: true },
      });

      const extractedSkills = await this.extractor.extractJobSkills({
        title: job.title,
        description: job.description,
        requirements: job.requirements,
      });

      if (extractedSkills.length === 0) {
        skippedNoSkillCount += 1;
      } else if (existing) {
        duplicateCount += 1;
      } else {
        newCount += 1;
      }

      previewItems.push({
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        isDuplicate: Boolean(existing),
        extractedSkillsCount: extractedSkills.length,
        willSkipNoSkills: extractedSkills.length === 0,
      });
    }

    return {
      valid: true,
      source: validatedBatch.source,
      collectedAt: validatedBatch.collectedAt,
      digest,
      totalCount: validatedBatch.jobs.length,
      newCount,
      duplicateCount,
      skippedNoSkillCount,
      items: previewItems,
    };
  }

  async importLocalJobs(body: { batch: any; requestKey?: string }) {
    await this.recoverStaleRuns();
    const { validatedBatch, digest } = validateLocalJobBatch(body?.batch);
    const sourceStr = validatedBatch.source;
    const quota = validatedBatch.jobs.length;
    const requestKey = (body?.requestKey || crypto.randomUUID()).trim();

    const existingByKey = await this.prisma.ingestionRun.findUnique({
      where: { requestKey },
    });

    if (existingByKey) {
      const existingDigest = (existingByKey.result as any)?.digest;
      if (
        existingByKey.source !== sourceStr ||
        existingByKey.quota !== quota ||
        (existingDigest && existingDigest !== digest)
      ) {
        throw new ConflictException(
          'requestKey was already used with a different local batch payload.',
        );
      }
      return existingByKey;
    }

    const activeRun = await this.prisma.ingestionRun.findFirst({
      where: { activeKey: sourceStr, state: 'RUNNING' },
    });
    if (activeRun) {
      throw new ConflictException(
        `An import run for ${sourceStr} is currently active. Please wait for it to finish.`,
      );
    }

    const run = await this.prisma.ingestionRun.create({
      data: {
        requestKey,
        source: sourceStr,
        quota,
        activeKey: sourceStr,
        state: 'RUNNING',
      },
    });

    const startedAt = new Date();
    let createdCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const item of validatedBatch.jobs) {
      try {
        const outcome = await this.upsertExternalJobItem(
          sourceStr as JobSource,
          {
            externalId: item.id,
            title: item.title,
            companyName: item.company,
            companyLogoUrl: item.companyLogoUrl || item.logoUrl || null,
            description: item.description,
            requirements: item.requirements,
            benefits: item.benefits,
            location: item.location,
            isRemote: item.isRemote,
            employmentType: (item.employmentType || 'FULL_TIME') as JobType,
            salaryMin: item.salaryMin,
            salaryMax: item.salaryMax,
            salaryCurrency: item.salaryCurrency || 'THB',
            sourceUrl: item.url,
          },
        );
        if (outcome === 'CREATED') createdCount += 1;
        else if (outcome === 'UPDATED') updatedCount += 1;
        else if (outcome === 'SKIPPED') skippedCount += 1;
        else duplicateCount += 1;
      } catch {
        errorCount += 1;
      }
    }

    let deactivatedClosedCount = 0;
    try {
      const cleanup = await this.cleanupClosedJobs('ALL', 300, {
        deleteMode: 'DEACTIVATE',
      });
      deactivatedClosedCount = cleanup.deactivatedCount;
    } catch {}

    const status =
      errorCount === 0
        ? IngestionStatus.SUCCESS
        : createdCount + updatedCount > 0
          ? IngestionStatus.PARTIAL_SUCCESS
          : IngestionStatus.FAILED;

    const resultPayload = {
      status,
      source: sourceStr,
      digest,
      createdCount,
      updatedCount,
      duplicateCount,
      skippedCount,
      deactivatedClosedCount,
      errorCount,
    };

    await this.prisma.ingestionLog.create({
      data: {
        source: sourceStr,
        status,
        startedAt,
        finishedAt: new Date(),
        createdCount,
        updatedCount,
        duplicateCount,
        errorCount,
        metadata: {
          mode: 'LOCAL_BATCH',
          requestKey,
          digest,
          skippedCount,
          deactivatedClosedCount,
        } as any,
      },
    });

    return this.prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        state: 'COMPLETED',
        activeKey: null,
        heartbeatAt: new Date(),
        finishedAt: new Date(),
        result: resultPayload as any,
      },
    });
  }

  private async fetchYouTubeCourses(
    limit = 10,
    targetSkillName?: string,
    keyword?: string,
  ): Promise<any[]> {
    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    const quota = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 10;
    if (!quota) return [];
    if (!apiKey) {
      return CURATED_COURSES_CATALOG.filter(
        (c) =>
          c.provider === CourseSource.YOUTUBE &&
          (!keyword ||
            c.title.toLowerCase().includes(keyword.toLowerCase()) ||
            c.description.toLowerCase().includes(keyword.toLowerCase())),
      ).slice(0, quota);
    }

    const courses: any[] = [];
    const seen = new Set<string>();
    const tokens = new Set<string>();
    const searchTerms = [targetSkillName?.trim(), keyword?.trim()].filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );
    const query = `${searchTerms.join(' ') || 'programming'} course tutorial`;
    let pageToken: string | undefined;
    try {
      for (
        let page = 0;
        page < Math.ceil(quota / 50) + 2 && courses.length < quota;
        page++
      ) {
        const search = await axios.get(
          'https://www.googleapis.com/youtube/v3/search',
          {
            timeout: 10000,
            params: {
              key: apiKey,
              part: 'snippet',
              type: 'video',
              q: query,
              maxResults: Math.min(50, quota - courses.length),
              pageToken,
            },
          },
        );
        if (!Array.isArray(search.data?.items)) {
          throw new Error('Invalid search response');
        }
        const ids: string[] = [];
        for (const item of search.data.items) {
          const id = item.id?.videoId;
          if (
            typeof id === 'string' &&
            /^[\w-]{11}$/.test(id) &&
            !seen.has(id)
          ) {
            seen.add(id);
            ids.push(id);
          }
        }
        if (ids.length) {
          const details = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
              timeout: 10000,
              params: {
                key: apiKey,
                part: 'snippet,contentDetails,status',
                id: ids.join(','),
              },
            },
          );
          if (!Array.isArray(details.data?.items)) {
            throw new Error('Invalid video response');
          }
          const byId = new Map<string, any>(
            details.data.items.map((video: any) => [video.id, video]),
          );
          for (const id of ids) {
            const video = byId.get(id);
            const snippet = video?.snippet;
            const duration = youtubeDurationFromIso(
              video?.contentDetails?.duration,
            );
            if (
              !snippet?.title ||
              !duration ||
              video.status?.privacyStatus !== 'public' ||
              (snippet.liveBroadcastContent &&
                snippet.liveBroadcastContent !== 'none')
            ) {
              continue;
            }
            const date = new Date(snippet.publishedAt);
            courses.push({
              externalId: id,
              title: snippet.title,
              description: formatCourseDescription(
                snippet.description || snippet.title,
              ),
              url: `https://www.youtube.com/watch?v=${id}`,
              thumbnailUrl:
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.medium?.url ||
                snippet.thumbnails?.default?.url ||
                null,
              duration,
              durationVerified: true,
              level: 'All Levels',
              rating: null,
              source: snippet.channelTitle || 'YouTube',
              sourceTags: sourceTags(snippet.tags),
              publishedAt: Number.isNaN(date.getTime()) ? undefined : date,
              skillSlugs: [],
            });
          }
        }
        const next = search.data.nextPageToken;
        if (typeof next !== 'string' || !next || tokens.has(next)) break;
        tokens.add(next);
        pageToken = next;
      }
      if (courses.length > 0) {
        return courses.slice(0, quota);
      }
    } catch {
      this.logger.warn(
        '[YouTube] Data API unavailable; using the existing course catalog',
      );
    }

    return CURATED_COURSES_CATALOG.filter(
      (c) =>
        c.provider === CourseSource.YOUTUBE &&
        (!keyword ||
          c.title.toLowerCase().includes(keyword.toLowerCase()) ||
          c.description.toLowerCase().includes(keyword.toLowerCase())),
    ).slice(0, quota);
  }

  private async fetchUdemyCourses(
    searchQuery: string,
    limit = 10,
    targetSkillName?: string,
  ): Promise<any[]> {
    const clientId = process.env.UDEMY_CLIENT_ID?.trim();
    const clientSecret = process.env.UDEMY_CLIENT_SECRET?.trim();
    const placeholder = /your[_-]|placeholder|example|changeme/i.test(
      `${clientId || ''} ${clientSecret || ''}`,
    );

    if (clientId && clientSecret && !placeholder) {
      try {
        this.logger.log(
          `[Udemy API] Connecting to https://www.udemy.com/api-2.0/courses with client credentials for query "${searchQuery}" (limit: ${limit})...`,
        );
        const token = Buffer.from(`${clientId}:${clientSecret}`).toString(
          'base64',
        );
        const pageSize = Math.min(Math.max(limit, 5), 50);
        const response = await axios.get(
          `https://www.udemy.com/api-2.0/courses/?search=${encodeURIComponent(
            searchQuery,
          )}&page=1&page_size=${pageSize}`,
          {
            headers: {
              Authorization: `Basic ${token}`,
              Accept: 'application/json',
              'User-Agent': 'SmartCareer-App/1.0',
            },
            timeout: 8000,
            params: { 'fields[course]': '@all' },
          },
        );

        if (
          response.data &&
          Array.isArray(response.data.results) &&
          response.data.results.length > 0
        ) {
          return response.data.results.slice(0, limit).map((c: any) => ({
            externalId: `udemy-${c.id}`,
            title: c.title,
            provider: CourseSource.UDEMY,
            description: formatCourseDescription(
              c.description || c.headline || c.title,
            ),
            url: `https://www.udemy.com${c.url}`,
            thumbnailUrl: c.image_480x270 || c.image_240x135 || null,
            duration: c.content_info || 'Comprehensive course',
            level: 'All Levels',
            rating: c.rating ? parseFloat(c.rating.toFixed(1)) : 4.8,
            source: 'Udemy Official API',
            sourceTags: udemySourceTags(c),
            skillSlugs: [],
          }));
        }
      } catch (err: any) {
        const status = err?.response?.status;
        const reason =
          status === 401
            ? 'Authentication rejected (401); check the API client credentials.'
            : status === 403
              ? 'Access denied (403); the API client must have permission for the Affiliate course catalog.'
              : status === 429
                ? 'Rate limit exceeded (429); retry later.'
                : 'Official endpoint unavailable.';
        this.logger.warn(
          `[Udemy API] ${reason} Using verified Udemy course catalog.`,
        );
      }
    }

    let catalog = CURATED_COURSES_CATALOG.filter(
      (c) => c.provider === CourseSource.UDEMY,
    );
    const filterTerm = (targetSkillName || searchQuery || '')
      .trim()
      .toLowerCase();
    if (filterTerm && filterTerm !== 'web development') {
      const filtered = catalog.filter((c) => {
        const titleMatch = c.title.toLowerCase().includes(filterTerm);
        const descMatch = (c.description || '')
          .toLowerCase()
          .includes(filterTerm);
        const skillMatch = (c.skillSlugs || []).some(
          (s) =>
            s.toLowerCase().includes(filterTerm) ||
            filterTerm.includes(s.toLowerCase()),
        );
        return titleMatch || descMatch || skillMatch;
      });
      if (filtered.length > 0) {
        catalog = filtered;
      }
    }

    return catalog.slice(0, limit);
  }

  async syncCourses(query: {
    provider?: string;
    limit?: string | number;
    keyword?: string;
    skillId?: string;
  }) {
    const rawProvider = String(query.provider || 'ALL').toUpperCase();
    const providersToSync: CourseSource[] =
      rawProvider === 'ALL'
        ? [CourseSource.UDEMY, CourseSource.YOUTUBE]
        : Object.values(CourseSource).includes(rawProvider as CourseSource)
          ? [rawProvider as CourseSource]
          : [];

    if (providersToSync.length === 0) {
      throw new BadRequestException(
        `Invalid course provider "${rawProvider}".`,
      );
    }

    const allSkills = await this.prisma.skill.findMany();
    const skillBySlug = new Map(allSkills.map((s) => [s.slug, s]));
    const targetSkill =
      query.skillId && query.skillId !== 'ALL'
        ? allSkills.find((s) => s.id === query.skillId) || null
        : null;

    let totalCreatedCount = 0;
    let totalUpdatedCount = 0;
    let totalDuplicateCount = 0;

    for (const provider of providersToSync) {
      const limit = query.limit
        ? Math.max(1, Math.min(100, Math.floor(Number(query.limit))))
        : this.configService.getQuotaForSource(provider);
      const startedAt = new Date();

      const catalogItems =
        provider === CourseSource.YOUTUBE
          ? await this.fetchYouTubeCourses(
              limit,
              targetSkill?.name,
              query.keyword,
            )
          : await this.fetchUdemyCourses(
              query.keyword || targetSkill?.name || 'web development',
              limit,
              targetSkill?.name,
            );

      let createdCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;

      for (const item of catalogItems) {
        const normUrl = normalizeCourseUrl(item.url);
        const existing = await this.prisma.course.findFirst({
          where: {
            OR: [{ provider, externalId: item.externalId }, { url: normUrl }],
          },
        });

        let courseRecord;
        const formattedCourseDesc = formatCourseDescription(item.description);
        if (existing) {
          courseRecord = existing;
          duplicateCount += 1;
          const nextDuration =
            (provider === CourseSource.YOUTUBE && item.durationVerified) ||
            !existing.duration
              ? item.duration
              : existing.duration;
          const nextSource =
            item.source &&
            (!existing.source ||
              existing.source === 'YouTube' ||
              existing.source === 'Udemy')
              ? item.source
              : existing.source;
          const shouldUpdateCourse =
            (formattedCourseDesc && existing.description !== formattedCourseDesc) ||
            existing.duration !== nextDuration ||
            existing.source !== nextSource ||
            (existing.rating === null && item.rating !== null && item.rating !== undefined);

          if (shouldUpdateCourse) {
            courseRecord = await this.prisma.course.update({
              where: { id: existing.id },
              data: {
                description: formattedCourseDesc || existing.description,
                duration: nextDuration,
                source: nextSource,
                level: item.level || existing.level,
                rating: item.rating ?? existing.rating,
              },
            });
            updatedCount += 1;
          }
        } else {
          courseRecord = await this.prisma.course.create({
            data: {
              externalId: item.externalId,
              title: item.title,
              provider,
              source:
                item.source ||
                (provider === CourseSource.UDEMY ? 'Udemy' : 'YouTube'),
              description: formattedCourseDesc || item.description,
              url: normUrl,
              thumbnailUrl: item.thumbnailUrl ?? null,
              duration: item.duration,
              level: item.level,
              rating: item.rating ?? null,
              publishedAt: item.publishedAt ?? null,
            },
          });
          createdCount += 1;
        }

        if (targetSkill) {
          await this.prisma.courseSkill.upsert({
            where: {
              courseId_skillId: {
                courseId: courseRecord.id,
                skillId: targetSkill.id,
              },
            },
            update: { relevanceScore: 1.0 },
            create: {
              courseId: courseRecord.id,
              skillId: targetSkill.id,
              relevanceScore: 1.0,
            },
          });
        }

        for (const slug of item.skillSlugs || []) {
          const sk = skillBySlug.get(slug);
          if (sk && hasCourseSkillEvidence(courseRecord, sk)) {
            await this.prisma.courseSkill.upsert({
              where: {
                courseId_skillId: {
                  courseId: courseRecord.id,
                  skillId: sk.id,
                },
              },
              update: { relevanceScore: 1.0 },
              create: {
                courseId: courseRecord.id,
                skillId: sk.id,
                relevanceScore: 1.0,
              },
            });
          }
        }

        for (const sk of allSkills) {
          if (
            hasCourseSkillEvidence(courseRecord, sk) ||
            (item.sourceTags || []).some((tag: string) =>
              mentionsSkill(tag, sk.name),
            )
          ) {
            await this.prisma.courseSkill.upsert({
              where: {
                courseId_skillId: {
                  courseId: courseRecord.id,
                  skillId: sk.id,
                },
              },
              update: {},
              create: {
                courseId: courseRecord.id,
                skillId: sk.id,
                relevanceScore: 0.9,
              },
            });
          }
        }
      }

      totalCreatedCount += createdCount;
      totalUpdatedCount += updatedCount;
      totalDuplicateCount += duplicateCount;

      await this.prisma.ingestionLog.create({
        data: {
          source: provider,
          status: IngestionStatus.SUCCESS,
          startedAt,
          finishedAt: new Date(),
          createdCount,
          updatedCount,
          duplicateCount,
          errorCount: 0,
        },
      });
    }

    let cleanedClosedCount = 0;
    try {
      const closedPreview = await this.previewClosedCourses('ALL', 200);
      const closedIds = closedPreview.items.map((c) => c.id);
      if (closedIds.length > 0) {
        const cleaned = await this.cleanupClosedCourses({
          courseIds: closedIds,
        });
        cleanedClosedCount = cleaned.deletedCount;
      }
    } catch {}

    return {
      provider: providersToSync.length === 1 ? providersToSync[0] : 'ALL',
      status: 'SUCCESS',
      createdCount: totalCreatedCount,
      updatedCount: totalUpdatedCount,
      duplicateCount: totalDuplicateCount,
      cleanedClosedCount,
    };
  }

  async backfillJobSkills() {
    const jobs = await this.prisma.job.findMany({
      include: {
        skills: true,
        company: { select: { logoUrl: true } },
        _count: { select: { applications: true } },
      },
    });

    let blognoneLogoBySlug = new Map<string, string>();
    try {
      const bnCatalog = await fetchBlognonePublicJobs(60);
      for (const item of bnCatalog) {
        if (item.id && item.companyLogoUrl) {
          blognoneLogoBySlug.set(item.id, item.companyLogoUrl);
        }
      }
    } catch {}

    let remotiveLogoById = new Map<string, string>();
    let remotiveLogoByUrl = new Map<string, string>();
    let remotiveDescById = new Map<string, string>();
    let remotiveDescByUrl = new Map<string, string>();
    try {
      const [remotiveRes1, remotiveRes2] = await Promise.all([
        axios
          .get('https://remotive.com/api/remote-jobs?limit=100', {
            timeout: 10000,
          })
          .catch(() => ({ data: { jobs: [] } })),
        axios
          .get(
            'https://remotive.com/api/remote-jobs?category=software-dev&limit=100',
            { timeout: 10000 },
          )
          .catch(() => ({ data: { jobs: [] } })),
      ]);
      const remotiveJobs: any[] = [
        ...(Array.isArray(remotiveRes1.data?.jobs) ? remotiveRes1.data.jobs : []),
        ...(Array.isArray(remotiveRes2.data?.jobs) ? remotiveRes2.data.jobs : []),
      ];
      for (const rj of remotiveJobs) {
        const rLogo = rj.company_logo || rj.company_logo_url;
        if (typeof rLogo === 'string' && rLogo.startsWith('https://')) {
          if (rj.id) remotiveLogoById.set(`remotive-${rj.id}`, rLogo);
          if (rj.url) remotiveLogoByUrl.set(String(rj.url), rLogo);
        }
        if (typeof rj.description === 'string' && rj.description.trim()) {
          const structuredDesc = formatStructuredJobText(rj.description).slice(
            0,
            15000,
          );
          if (structuredDesc) {
            if (rj.id) remotiveDescById.set(`remotive-${rj.id}`, structuredDesc);
            if (rj.url) remotiveDescByUrl.set(String(rj.url), structuredDesc);
          }
        }
      }
    } catch {}

    let updatedJobs = 0;
    let linkedSkills = 0;
    let backfilledLogos = 0;
    let removedSkilllessJobs = 0;
    let deactivatedClosedCount = 0;
    let deepFetches = 0;

    const seededJobFormattedBySlug: Record<
      string,
      { description: string; requirements?: string; benefits?: string }
    > = {
      'full-stack-javascript-developer-technova': {
        description:
          'พัฒนาเว็บแอปพลิเคชันด้วย JavaScript, TypeScript, React และเชื่อมต่อฐานข้อมูล SQL ร่วมกับทีมวิศวกรผลิตภัณฑ์\n• ออกแบบและพัฒนาฟีเจอร์ทั้งฝั่ง Frontend (React / TypeScript) และ Backend API\n• ออกแบบตารางข้อมูลและเขียนคิวรี SQL ที่มีประสิทธิภาพและปลอดภัย\n• ร่วมทำ Code Review และเขียนชุดทดสอบอัตโนมัติร่วมกับทีมวิศวกร',
        requirements:
          '• มีพื้นฐาน JavaScript และ SQL ที่ดี\n• เข้าใจการพัฒนา REST API และการจัดการฐานข้อมูล\n• สามารถเขียนโค้ดที่อ่านง่ายและทดสอบได้',
        benefits:
          '• ประกันสุขภาพกลุ่ม\n• งบสนับสนุนคอร์สเรียนและหนังสือ\n• ทำงานแบบ Hybrid',
      },
      'frontend-engineer-react-typescript-technova': {
        description:
          'ออกแบบและพัฒนา UI สำหรับระบบวิเคราะห์ข้อมูลขนาดใหญ่ด้วย React, Next.js และ TypeScript\n• พัฒนา Reusable UI Components ที่รองรับการใช้งานทุกขนาดหน้าจอ\n• เชื่อมต่อ REST API และจัดการ State ของข้อมูลได้อย่างลื่นไหล\n• ปรับปรุงประสิทธิภาพการแสดงผล (Web Vitals & Accessibility)',
        requirements:
          '• เชี่ยวชาญ JavaScript และ TypeScript\n• มีประสบการณ์พัฒนา Responsive Web Application ด้วย React หรือ Next.js',
        benefits: '• วันลาพักร้อน 15 วัน\n• อุปกรณ์ทำงานครบชุด',
      },
      'backend-nodejs-sql-engineer-global-cloud': {
        description:
          'Build scalable backend microservices with Node.js, JavaScript, and PostgreSQL/SQL.\n• Design and maintain high-availability REST APIs using Node.js and JavaScript\n• Optimize relational database schemas and SQL queries on PostgreSQL\n• Collaborate with DevOps and product teams on cloud deployments',
        requirements:
          '• Strong JavaScript and SQL skills\n• Experience with Node.js backend services and PostgreSQL',
      },
    };

    for (const job of jobs) {
      let currentDescription = job.description;
      let currentRequirements = job.requirements;
      let currentBenefits = job.benefits;
      let resolvedLogo: string | null = job.companyLogoUrl || null;
      let listingClosedAtSource = false;

      if (job.slug && seededJobFormattedBySlug[job.slug]) {
        const seeded = seededJobFormattedBySlug[job.slug];
        currentDescription = seeded.description;
        currentRequirements = seeded.requirements || currentRequirements;
        currentBenefits = seeded.benefits || currentBenefits;
      }

      if (job.source === JobSource.REMOTIVE) {
        const remotiveFreshDesc =
          (job.externalId && remotiveDescById.get(job.externalId)) ||
          (job.sourceUrl && remotiveDescByUrl.get(job.sourceUrl)) ||
          null;
        if (remotiveFreshDesc) {
          currentDescription = remotiveFreshDesc;
        }
      }

      currentDescription = formatStructuredJobText(currentDescription);
      const baseSections = jobSections(currentDescription);
      currentRequirements = currentRequirements
        ? formatStructuredJobText(currentRequirements)
        : baseSections.requirements || null;
      currentBenefits = currentBenefits
        ? formatStructuredJobText(currentBenefits)
        : baseSections.benefits || null;

      if (
        currentDescription !== job.description ||
        currentRequirements !== job.requirements ||
        currentBenefits !== job.benefits
      ) {
        await this.prisma.job
          .update({
            where: { id: job.id },
            data: {
              description: currentDescription,
              requirements: currentRequirements,
              benefits: currentBenefits,
            },
          })
          .catch(() => {});
      }

      if (!resolvedLogo) {
        if (job.company?.logoUrl) {
          resolvedLogo = job.company.logoUrl;
        } else if (job.source === JobSource.BLOGNONE) {
          const slugKey = (job.externalId || '').replace(/^blognone-/, '');
          resolvedLogo = blognoneLogoBySlug.get(slugKey) || null;
        } else if (job.source === JobSource.REMOTIVE) {
          resolvedLogo =
            (job.externalId && remotiveLogoById.get(job.externalId)) ||
            (job.sourceUrl && remotiveLogoByUrl.get(job.sourceUrl)) ||
            null;
        }
      }

      let extracted = await this.extractor.extractJobSkills({
        title: job.title,
        description: currentDescription,
        requirements: currentRequirements,
      });

      if (
        job.source !== JobSource.INTERNAL &&
        job.sourceUrl &&
        ['BLOGNONE', 'JOBSDB', 'JOBTHAI'].includes(job.source) &&
        (!resolvedLogo || extracted.length === 0 || (currentDescription || '').length < 200) &&
        deepFetches < 20
      ) {
        deepFetches += 1;
        try {
          const deep = await this.extractor.fetchDeepJobDetails(
            job.source,
            job.sourceUrl,
            {},
          );
          if (deep.logoUrl && !resolvedLogo) {
            resolvedLogo = deep.logoUrl;
          }
          if (
            deep.description &&
            deep.description.length > (currentDescription || '').length
          ) {
            const cleanedDesc = jobText(deep.description);
            const sections = jobSections(cleanedDesc);
            currentDescription = cleanedDesc || currentDescription;
            currentRequirements =
              deep.requirements || sections.requirements || currentRequirements;
            await this.prisma.job.update({
              where: { id: job.id },
              data: {
                description: currentDescription,
                requirements: currentRequirements,
                benefits: deep.benefits || sections.benefits || job.benefits,
                ...(resolvedLogo && !job.companyLogoUrl
                  ? { companyLogoUrl: resolvedLogo }
                  : {}),
              },
            });
            if (resolvedLogo && !job.companyLogoUrl) {
              backfilledLogos += 1;
            }
            extracted = await this.extractor.extractJobSkills({
              title: job.title,
              description: currentDescription,
              requirements: currentRequirements,
            });
          }
        } catch (err: any) {
          if (err?.message === 'SOURCE_LISTING_CLOSED') {
            listingClosedAtSource = true;
          }
        }
      }

      if (listingClosedAtSource && job.isActive) {
        await this.prisma.job
          .update({
            where: { id: job.id },
            data: { isActive: false },
          })
          .catch(() => {});
        deactivatedClosedCount += 1;
        continue;
      }

      if (resolvedLogo && !job.companyLogoUrl) {
        try {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { companyLogoUrl: resolvedLogo },
          });
          backfilledLogos += 1;
        } catch {}
      }

      if (extracted.length === 0 && job.source !== JobSource.INTERNAL) {
        if (job._count.applications === 0) {
          await this.prisma.job.delete({ where: { id: job.id } });
        } else {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { isActive: false },
          });
        }
        removedSkilllessJobs += 1;
        continue;
      }

      const validIds = new Set(extracted.map((e) => e.skillId));
      if (job.source !== JobSource.INTERNAL) {
        const stale = job.skills
          .filter((js) => !validIds.has(js.skillId))
          .map((js) => js.skillId);
        if (stale.length > 0) {
          await this.prisma.jobSkill.deleteMany({
            where: { jobId: job.id, skillId: { in: stale } },
          });
        }
      }

      for (const sk of extracted) {
        const exists = job.skills.some((js) => js.skillId === sk.skillId);
        if (!exists) {
          await this.prisma.jobSkill.create({
            data: {
              jobId: job.id,
              skillId: sk.skillId,
              isRequired: sk.isRequired,
              minimumScore: sk.minimumScore,
              weight: 1.0,
            },
          });
          linkedSkills += 1;
        }
      }
      if (extracted.length > 0) updatedJobs += 1;
    }

    try {
      const cleanup = await this.cleanupClosedJobs('ALL', 300, {
        deleteMode: 'DEACTIVATE',
      });
      deactivatedClosedCount += cleanup.deactivatedCount;
    } catch {}

    await this.backfillCourseSkills();

    return {
      scannedJobs: jobs.length,
      updatedJobs,
      linkedSkills,
      backfilledLogos,
      removedSkilllessJobs,
      deactivatedClosedCount,
    };
  }

  async backfillCourseSkills() {
    let cleanedClosedCount = 0;
    try {
      const closedPreview = await this.previewClosedCourses('ALL', 200);
      const closedIds = closedPreview.items.map((c) => c.id);
      if (closedIds.length > 0) {
        const cleaned = await this.cleanupClosedCourses({
          courseIds: closedIds,
        });
        cleanedClosedCount = cleaned.deletedCount;
      }
    } catch {}

    const [courses, skills] = await Promise.all([
      this.prisma.course.findMany({ include: { skills: true } }),
      this.prisma.skill.findMany(),
    ]);

    const catalogByExt = new Map(
      CURATED_COURSES_CATALOG.map((item) => [item.externalId, item]),
    );
    const catalogByUrl = new Map(
      CURATED_COURSES_CATALOG.map((item) => [
        normalizeCourseUrl(item.url),
        item,
      ]),
    );

    let linkedCount = 0;
    let removedInvalidCount = 0;

    for (const c of courses) {
      const matchedCatalog =
        (c.externalId && catalogByExt.get(c.externalId)) ||
        catalogByUrl.get(normalizeCourseUrl(c.url)) ||
        null;
      let targetDescription = matchedCatalog
        ? formatCourseDescription(matchedCatalog.description)
        : formatCourseDescription(c.description);
      const targetSource =
        matchedCatalog?.source &&
        (!c.source || c.source === 'YouTube' || c.source === 'Udemy')
          ? matchedCatalog.source
          : c.source;
      const targetDuration = c.duration || matchedCatalog?.duration || null;
      const targetRating = c.rating ?? matchedCatalog?.rating ?? null;

      if (
        targetDescription &&
        !targetDescription.includes('\n') &&
        targetDescription.trim() === c.title.trim()
      ) {
        targetDescription = `${c.title.trim()}\n• ผู้สอน / ช่อง: ${targetSource || c.provider}\n• รูปแบบการเรียน: วิดีโอคอร์สออนไลน์ (${targetDuration || 'เรียนตามอัธยาศัย'})`;
      }

      if (
        (targetDescription && targetDescription !== c.description) ||
        targetSource !== c.source ||
        targetDuration !== c.duration ||
        targetRating !== c.rating
      ) {
        await this.prisma.course
          .update({
            where: { id: c.id },
            data: {
              description: targetDescription || c.description,
              source: targetSource,
              duration: targetDuration,
              rating: targetRating,
            },
          })
          .catch(() => {});
        c.description = targetDescription || c.description;
      }

      // Remove tags without textual evidence
      for (const cs of c.skills) {
        const sk = skills.find((s) => s.id === cs.skillId);
        if (sk && !hasCourseSkillEvidence(c, sk)) {
          await this.prisma.courseSkill.delete({ where: { id: cs.id } });
          removedInvalidCount += 1;
        }
      }

      // Add verified tags
      for (const sk of skills) {
        if (
          hasCourseSkillEvidence(c, sk) &&
          !c.skills.some((cs) => cs.skillId === sk.id)
        ) {
          await this.prisma.courseSkill.create({
            data: {
              courseId: c.id,
              skillId: sk.id,
              relevanceScore: 1.0,
            },
          });
          linkedCount += 1;
        }
      }
    }

    return {
      scannedCourses: courses.length,
      linkedCount,
      removedInvalidCount,
      cleanedClosedCount,
    };
  }

  async enrichJobsAi(limitInput?: string | number) {
    const limit = Math.max(1, Math.min(100, Number(limitInput ?? 20) || 20));
    const jobs = await this.prisma.job.findMany({
      where: { isActive: true },
      include: {
        skills: true,
        _count: { select: { applications: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    let enrichedCount = 0;
    let removedSkilllessJobs = 0;
    for (const job of jobs) {
      const extracted = await this.extractor.extractJobSkills(
        {
          title: job.title,
          description: job.description,
          requirements: job.requirements,
        },
        { useAi: true },
      );

      if (
        extracted.length === 0 &&
        job.skills.length === 0 &&
        job.source !== JobSource.INTERNAL
      ) {
        if (job._count.applications === 0) {
          await this.prisma.job.delete({ where: { id: job.id } });
        } else {
          await this.prisma.job.update({
            where: { id: job.id },
            data: { isActive: false },
          });
        }
        removedSkilllessJobs += 1;
        continue;
      }

      for (const sk of extracted) {
        await this.prisma.jobSkill.upsert({
          where: {
            jobId_skillId: {
              jobId: job.id,
              skillId: sk.skillId,
            },
          },
          update: {},
          create: {
            jobId: job.id,
            skillId: sk.skillId,
            isRequired: sk.isRequired,
            minimumScore: sk.minimumScore,
            weight: 1.0,
          },
        });
      }
      enrichedCount += 1;
    }

    let deactivatedClosedCount = 0;
    try {
      const cleanup = await this.cleanupClosedJobs('ALL', 300, {
        deleteMode: 'DEACTIVATE',
      });
      deactivatedClosedCount = cleanup.deactivatedCount;
    } catch {}

    return {
      processedJobs: jobs.length,
      enrichedCount,
      removedSkilllessJobs,
      deactivatedClosedCount,
    };
  }

  async previewClosedJobs(source?: string, limitInput?: string | number) {
    const limit = Math.max(1, Math.min(300, Number(limitInput ?? 100) || 100));
    const now = new Date();

    const where: any = {
      OR: [
        { isActive: false },
        { expiresAt: { lte: now } },
      ],
    };

    if (source && source !== 'ALL' && Object.values(JobSource).includes(source as JobSource)) {
      where.source = source as JobSource;
    }

    const items = await this.prisma.job.findMany({
      where,
      select: {
        id: true,
        title: true,
        companyName: true,
        source: true,
        isActive: true,
        expiresAt: true,
        _count: { select: { applications: true } },
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return {
      totalPreviewed: items.length,
      items,
    };
  }

  async cleanupClosedJobs(
    source?: string,
    limitInput?: string | number,
    body?: { deleteMode?: string },
  ) {
    if (body?.deleteMode !== undefined && String(body.deleteMode).trim() !== '') {
      const requestedMode = String(body.deleteMode).trim().toUpperCase();
      if (requestedMode !== 'DEACTIVATE') {
        throw new BadRequestException(
          `Unsupported deleteMode "${body.deleteMode}". Only "DEACTIVATE" is permitted to preserve job application history.`,
        );
      }
    }

    const preview = await this.previewClosedJobs(source, limitInput ?? 200);
    const ids = preview.items.map((i) => i.id);
    const activeExpiredIds = preview.items
      .filter((i) => i.isActive)
      .map((i) => i.id);

    if (ids.length === 0) {
      return {
        mode: 'DEACTIVATE',
        deactivatedCount: 0,
        totalClosedCount: 0,
        ids: [],
      };
    }

    // Section 7.7 & 14.2: Always preserve job applications & status history by deactivating closed jobs
    let newlyDeactivatedCount = 0;
    if (activeExpiredIds.length > 0) {
      const res = await this.prisma.job.updateMany({
        where: { id: { in: activeExpiredIds }, isActive: true },
        data: { isActive: false },
      });
      newlyDeactivatedCount = res.count;
    }

    return {
      mode: 'DEACTIVATE',
      deactivatedCount: newlyDeactivatedCount,
      totalClosedCount: ids.length,
      ids,
    };
  }

  async previewClosedCourses(provider?: string, limitInput?: string | number) {
    const limit = Math.max(1, Math.min(200, Number(limitInput ?? 100) || 100));
    const courses = await this.prisma.course.findMany({
      where:
        provider &&
        provider !== 'ALL' &&
        Object.values(CourseSource).includes(provider as CourseSource)
          ? { provider: provider as CourseSource }
          : {},
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    // Identify courses with invalid/non-HTTPS URLs or marked as closed
    const closedItems = courses.filter(
      (c) => !c.url.startsWith('https://') || c.title.toLowerCase().includes('[closed]'),
    );

    return {
      totalPreviewed: closedItems.length,
      items: closedItems,
    };
  }

  async cleanupClosedCourses(body: { courseIds: string[] }) {
    const ids = Array.isArray(body?.courseIds) ? body.courseIds : [];
    if (ids.length < 1 || ids.length > 200) {
      throw new BadRequestException('courseIds must contain between 1 and 200 IDs.');
    }

    const uniqueIds = Array.from(new Set(ids.map((id) => String(id).trim())));
    if (uniqueIds.length !== ids.length) {
      throw new BadRequestException('courseIds must not contain duplicates.');
    }

    const foundCourses = await this.prisma.course.findMany({
      where: { id: { in: uniqueIds } },
    });

    const eligibleClosedIds = foundCourses
      .filter(
        (c) =>
          !c.url.startsWith('https://') ||
          c.title.toLowerCase().includes('[closed]'),
      )
      .map((c) => c.id);

    const eligibleSet = new Set(eligibleClosedIds);
    const rejectedIds = uniqueIds.filter((id) => !eligibleSet.has(id));

    if (rejectedIds.length > 0) {
      throw new BadRequestException(
        `Cannot delete active or non-existent courses (${rejectedIds.length} rejected). Only closed courses may be cleaned up.`,
      );
    }

    const res = await this.prisma.course.deleteMany({
      where: { id: { in: eligibleClosedIds } },
    });

    return {
      deletedCount: res.count,
      courseIds: eligibleClosedIds,
    };
  }
}
