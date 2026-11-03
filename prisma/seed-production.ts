import { PrismaClient, SkillCategory, AssessmentType, FeedbackVisibility, QuestionDifficulty, QuestionEvaluationMethod, CourseSource } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { AZ_204_FRAMEWORK } from '../packages/shared/src';

const prisma = new PrismaClient();

export const MASTER_SKILLS: Array<{
  name: string;
  slug: string;
  category: SkillCategory;
  description: string;
}> = [
  { name: 'JavaScript', slug: 'javascript', category: SkillCategory.FRONTEND, description: 'ภาษาหลักสำหรับพัฒนาเว็บแอปพลิเคชันทั้งฝั่ง Frontend และ Backend' },
  { name: 'TypeScript', slug: 'typescript', category: SkillCategory.FRONTEND, description: 'ภาษา JavaScript ที่มีการตรวจสอบชนิดข้อมูลแบบ Static Typing' },
  { name: 'React', slug: 'react', category: SkillCategory.FRONTEND, description: 'ไลบรารีสำหรับสร้างส่วนติดต่อผู้ใช้แบบ Component-based' },
  { name: 'Next.js', slug: 'nextjs', category: SkillCategory.FRONTEND, description: 'เฟรมเวิร์ก React สำหรับเว็บแอปพลิเคชันระดับ Production' },
  { name: 'Tailwind CSS', slug: 'tailwindcss', category: SkillCategory.FRONTEND, description: 'Utility-first CSS framework สำหรับออกแบบหน้าจออย่างรวดเร็ว' },
  { name: 'Node.js', slug: 'nodejs', category: SkillCategory.BACKEND, description: 'JavaScript runtime สำหรับสร้างบริการฝั่งเซิร์ฟเวอร์และ API' },
  { name: 'NestJS', slug: 'nestjs', category: SkillCategory.BACKEND, description: 'เฟรมเวิร์ก Node.js แบบสถาปัตยกรรมโมดูลสำหรับสร้างระบบ Backend' },
  { name: 'Python', slug: 'python', category: SkillCategory.BACKEND, description: 'ภาษาโปรแกรมสำหรับพัฒนา Backend, Data Engineering และ AI/ML' },
  { name: 'SQL', slug: 'sql', category: SkillCategory.DATABASE, description: 'ภาษาจัดการและสืบค้นข้อมูลในฐานข้อมูลเชิงสัมพันธ์' },
  { name: 'PostgreSQL', slug: 'postgresql', category: SkillCategory.DATABASE, description: 'ระบบฐานข้อมูลเชิงสัมพันธ์ระดับองค์กร' },
  { name: 'Docker', slug: 'docker', category: SkillCategory.DEVOPS, description: 'เครื่องมือสร้างและรันแอปพลิเคชันในรูปแบบ Container' },
  { name: 'Automated Testing', slug: 'automated-testing', category: SkillCategory.TESTING, description: 'การเขียนชุดทดสอบอัตโนมัติ (Unit, Integration, E2E)' },
  { name: 'Flutter', slug: 'flutter', category: SkillCategory.MOBILE, description: 'UI toolkit สำหรับพัฒนาแอปพลิเคชันมือถือแบบ Cross-platform' },
  { name: 'Machine Learning', slug: 'machine-learning', category: SkillCategory.AI_ML, description: 'การพัฒนาโมเดลการเรียนรู้ของเครื่องและการวิเคราะห์ข้อมูลเชิงลึก' },
  { name: 'Application Security', slug: 'application-security', category: SkillCategory.SECURITY, description: 'การรักษาความปลอดภัยของเว็บแอปพลิเคชันและ API (OWASP, OAuth, JWT)' },
  { name: 'HTML', slug: 'html', category: SkillCategory.FRONTEND, description: 'โครงสร้างมาตรฐานสำหรับหน้าเว็บแอปพลิเคชันยุคใหม่ (HTML5)' },
  { name: 'CSS', slug: 'css', category: SkillCategory.FRONTEND, description: 'การจัดวางเลย์เอาต์และตกแต่งส่วนติดต่อผู้ใช้แบบ Responsive' },
  { name: 'Vue.js', slug: 'vue', category: SkillCategory.FRONTEND, description: 'Progressive JavaScript Framework สำหรับพัฒนาส่วนติดต่อผู้ใช้' },
  { name: 'Angular', slug: 'angular', category: SkillCategory.FRONTEND, description: 'แพลตฟอร์มพัฒนาเว็บแอปพลิเคชันระดับองค์กรด้วย TypeScript' },
  { name: 'Express', slug: 'express', category: SkillCategory.BACKEND, description: 'เว็บเฟรมเวิร์กขนาดเบาสำหรับ Node.js และ RESTful API' },
  { name: 'GraphQL', slug: 'graphql', category: SkillCategory.BACKEND, description: 'ภาษาสืบค้นข้อมูลและจัดการ Schema สำหรับ API สมัยใหม่' },
  { name: 'Go', slug: 'go', category: SkillCategory.BACKEND, description: 'ภาษาโปรแกรมประสิทธิภาพสูงสำหรับระบบ Cloud-native และ Microservices' },
  { name: 'Java', slug: 'java', category: SkillCategory.BACKEND, description: 'ภาษาโปรแกรมหลักสำหรับระบบ Enterprise Backend และ Spring Boot' },
  { name: 'C#', slug: 'csharp', category: SkillCategory.BACKEND, description: 'ภาษาโปรแกรมสำหรับพัฒนาแอปพลิเคชันบนแพลตฟอร์ม .NET' },
  { name: 'MongoDB', slug: 'mongodb', category: SkillCategory.DATABASE, description: 'ฐานข้อมูล NoSQL แบบ Document-oriented สำหรับข้อมูลที่ยืดหยุ่น' },
  { name: 'Redis', slug: 'redis', category: SkillCategory.DATABASE, description: 'ระบบฐานข้อมูลในหน่วยความจำสำหรับ Caching และ Message Broker' },
  { name: 'Kubernetes', slug: 'kubernetes', category: SkillCategory.DEVOPS, description: 'ระบบจัดการและขยายขนาด Container อัตโนมัติระดับ Production' },
  { name: 'AWS', slug: 'aws', category: SkillCategory.DEVOPS, description: 'บริการ Cloud Computing และโครงสร้างพื้นฐานบน Amazon Web Services' },
  { name: 'Git', slug: 'git', category: SkillCategory.DEVOPS, description: 'ระบบควบคุมเวอร์ชันของซอร์สโค้ดและการทำงานร่วมกันเป็นทีม' },
  { name: 'CI/CD', slug: 'ci-cd', category: SkillCategory.DEVOPS, description: 'กระบวนการรวมโค้ด ทดสอบ และปล่อยใช้งานจริงแบบอัตโนมัติ' },
  { name: 'Linux', slug: 'linux', category: SkillCategory.DEVOPS, description: 'ระบบปฏิบัติการเซิร์ฟเวอร์และการจัดการโครงสร้างพื้นฐานผ่าน Command Line' },
];

export const CURATED_COURSES: Array<{
  externalId: string;
  title: string;
  provider: CourseSource;
  source: string;
  description: string;
  url: string;
  duration: string;
  level: string;
  rating: number;
  skillSlugs: string[];
}> = [
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
    externalId: 'udemy-typescript-react-pro',
    title: 'Mastering TypeScript & React Modern Frontend Architecture',
    provider: CourseSource.UDEMY,
    source: 'Maximilian Schwarzmüller (Academind)',
    description:
      'Build type-safe web applications using TypeScript, React, Next.js, and modern state management patterns.\n• การพัฒนา Component และ Custom Hooks ใน React ร่วมกับ TypeScript แบบ Type-Safe\n• การจัดการ State ระดับแอปพลิเคชันด้วย Context API, Redux Toolkit และ React Router\n• การต่อยอดสู่ Full-Stack Frontend ด้วยเฟรมเวิร์ก Next.js และการเพิ่มประสิทธิภาพการเรนเดอร์',
    url: 'https://www.udemy.com/course/react-the-complete-guide-incl-redux/',
    duration: '50 hours',
    level: 'All Levels',
    rating: 4.8,
    skillSlugs: ['typescript', 'react', 'nextjs'],
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
];

export async function runProductionMasterSeed() {
  if (process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error(
      'Guard blocked execution: set ALLOW_PRODUCTION_SEED=true before running prisma:seed:prod.',
    );
  }

  console.log('[seed:prod] Upserting master skills...');
  const skillBySlug = new Map<string, { id: string; name: string; slug: string }>();

  for (const s of MASTER_SKILLS) {
    const record = await prisma.skill.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        category: s.category,
        description: s.description,
      },
      create: {
        name: s.name,
        slug: s.slug,
        category: s.category,
        description: s.description,
      },
    });
    skillBySlug.set(record.slug, record);
  }

  console.log('[seed:prod] Upserting AZ-204 skill framework...');
  const fw = await prisma.skillFramework.upsert({
    where: { code: AZ_204_FRAMEWORK.code },
    update: {
      name: AZ_204_FRAMEWORK.name,
      provider: AZ_204_FRAMEWORK.provider,
      version: AZ_204_FRAMEWORK.version,
      description: AZ_204_FRAMEWORK.disclaimer,
    },
    create: {
      code: AZ_204_FRAMEWORK.code,
      name: AZ_204_FRAMEWORK.name,
      provider: AZ_204_FRAMEWORK.provider,
      version: AZ_204_FRAMEWORK.version,
      description: AZ_204_FRAMEWORK.disclaimer,
    },
  });

  await prisma.skillFrameworkItem.deleteMany({ where: { frameworkId: fw.id } });
  const defaultSkill = skillBySlug.get('nodejs') || skillBySlug.get('javascript')!;
  for (const topic of AZ_204_FRAMEWORK.topics) {
    await prisma.skillFrameworkItem.create({
      data: {
        frameworkId: fw.id,
        skillId: defaultSkill.id,
        topicName: `${topic.id}: ${topic.title}`,
        level: 'ASSOCIATE',
        requiredScore: 70,
        description: topic.description,
      },
    });
  }

  console.log('[seed:prod] Upserting platform assessments from assessment-bank...');
  const bankPath = path.join(__dirname, 'assessment-bank', 'javascript-sandbox.json');
  const bankData = JSON.parse(fs.readFileSync(bankPath, 'utf8'));

  for (const exam of bankData.assessments || []) {
    const skill = exam.skillSlug ? skillBySlug.get(exam.skillSlug) : null;
    const existing = await prisma.assessment.findUnique({
      where: { slug: exam.slug },
      include: { attempts: { select: { id: true }, take: 1 } },
    });

    if (existing && existing.attempts.length > 0) {
      console.log(`[seed:prod] Skipping question replacement for ${exam.slug} (has existing attempts).`);
      continue;
    }

    const assessment = await prisma.assessment.upsert({
      where: { slug: exam.slug },
      update: {
        title: exam.title,
        description: exam.description,
        type: exam.type as AssessmentType,
        skillId: skill?.id ?? null,
        timeLimitMinutes: exam.timeLimitMinutes,
        passingScore: exam.passingScore,
        feedbackVisibility: (exam.feedbackVisibility || 'IMMEDIATE') as FeedbackVisibility,
        frameworkCode: exam.frameworkCode ?? null,
        frameworkVersion: exam.frameworkVersion ?? null,
        frameworkScope: exam.frameworkScope ?? null,
        isActive: true,
      },
      create: {
        slug: exam.slug,
        title: exam.title,
        description: exam.description,
        type: exam.type as AssessmentType,
        skillId: skill?.id ?? null,
        timeLimitMinutes: exam.timeLimitMinutes,
        passingScore: exam.passingScore,
        feedbackVisibility: (exam.feedbackVisibility || 'IMMEDIATE') as FeedbackVisibility,
        frameworkCode: exam.frameworkCode ?? null,
        frameworkVersion: exam.frameworkVersion ?? null,
        frameworkScope: exam.frameworkScope ?? null,
        isActive: true,
      },
    });

    await prisma.question.deleteMany({ where: { assessmentId: assessment.id } });

    for (const q of exam.questions || []) {
      const createdQuestion = await prisma.question.create({
        data: {
          assessmentId: assessment.id,
          title: q.title,
          prompt: q.prompt,
          difficulty: (q.difficulty || 'MEDIUM') as QuestionDifficulty,
          points: q.points || 10,
          starterCode: q.starterCode ?? null,
          solutionCode: q.solutionCode ?? null,
          explanation: q.explanation ?? null,
          evaluationMethod: (q.evaluationMethod || 'AUTOMATED_TEST_CASES') as QuestionEvaluationMethod,
          testCases: q.testCases ?? null,
          rubric: q.rubric ?? null,
          frameworkTopicId: q.frameworkTopicId ?? null,
          frameworkMappingNote: q.frameworkMappingNote ?? null,
        },
      });

      if (Array.isArray(q.choices) && q.choices.length > 0) {
        for (const c of q.choices) {
          await prisma.choice.create({
            data: {
              questionId: createdQuestion.id,
              text: c.text,
              isCorrect: Boolean(c.isCorrect),
              order: c.order ?? 0,
            },
          });
        }
      }
    }
  }

  console.log('[seed:prod] Upserting curated courses...');
  for (const c of CURATED_COURSES) {
    const existingCourse = await prisma.course.findFirst({
      where: { provider: c.provider, externalId: c.externalId },
    });

    const course = existingCourse
      ? await prisma.course.update({
          where: { id: existingCourse.id },
          data: {
            title: c.title,
            description: c.description,
            url: c.url,
            duration: c.duration,
            level: c.level,
            rating: c.rating,
          },
        })
      : await prisma.course.create({
          data: {
            externalId: c.externalId,
            title: c.title,
            provider: c.provider,
            source: c.source,
            description: c.description,
            url: c.url,
            duration: c.duration,
            level: c.level,
            rating: c.rating,
          },
        });

    for (const slug of c.skillSlugs) {
      const sk = skillBySlug.get(slug);
      if (sk) {
        await prisma.courseSkill.upsert({
          where: {
            courseId_skillId: {
              courseId: course.id,
              skillId: sk.id,
            },
          },
          update: { relevanceScore: 1.0 },
          create: {
            courseId: course.id,
            skillId: sk.id,
            relevanceScore: 1.0,
          },
        });
      }
    }
  }

  console.log('[seed:prod] Master seed completed successfully.');
}

if (require.main === module) {
  runProductionMasterSeed()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
