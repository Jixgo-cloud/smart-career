import { PrismaClient, UserRole, AuthProvider, VerificationStatus, JobType, JobSource, AssessmentType, FeedbackVisibility, QuestionDifficulty, QuestionEvaluationMethod } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { runProductionMasterSeed } from './seed-production';

const prisma = new PrismaClient();

async function main() {
  process.env.ALLOW_PRODUCTION_SEED = 'true';
  await runProductionMasterSeed();

  console.log('[seed:dev] Creating sample company, jobs, and demo accounts for local development...');

  const jsSkill = await prisma.skill.findUnique({ where: { slug: 'javascript' } });
  const sqlSkill = await prisma.skill.findUnique({ where: { slug: 'sql' } });
  const tsSkill = await prisma.skill.findUnique({ where: { slug: 'typescript' } });
  const reactSkill = await prisma.skill.findUnique({ where: { slug: 'react' } });
  const nodeSkill = await prisma.skill.findUnique({ where: { slug: 'nodejs' } });

  // Create default Admin for local dev if not present
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@smartcareer.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@SmartCareer2026!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      authProvider: AuthProvider.LOCAL,
      isActive: true,
    },
  });

  // Create sample Company User & Company
  const companyUser = await prisma.user.upsert({
    where: { email: 'hr@technova.co.th' },
    update: {},
    create: {
      email: 'hr@technova.co.th',
      role: UserRole.COMPANY,
      authProvider: AuthProvider.GOOGLE,
      providerId: 'google-demo-company-1',
      isActive: true,
    },
  });

  const company = await prisma.company.upsert({
    where: { slug: 'tech-nova-thailand' },
    update: {
      name: 'TechNova Solutions Thailand',
      description: 'บริษัทพัฒนาซอฟต์แวร์และแพลตฟอร์มคลาวด์สำหรับองค์กรชั้นนำในเอเชียตะวันออกเฉียงใต้',
      website: 'https://tech-nova.example.com',
      address: 'Sukhumvit Road, Watthana, Bangkok',
      contactEmail: 'hr@technova.co.th',
      contactPhone: '02-123-4567',
      verificationStatus: VerificationStatus.VERIFIED,
    },
    create: {
      name: 'TechNova Solutions Thailand',
      slug: 'tech-nova-thailand',
      description: 'บริษัทพัฒนาซอฟต์แวร์และแพลตฟอร์มคลาวด์สำหรับองค์กรชั้นนำในเอเชียตะวันออกเฉียงใต้',
      website: 'https://tech-nova.example.com',
      address: 'Sukhumvit Road, Watthana, Bangkok',
      contactEmail: 'hr@technova.co.th',
      contactPhone: '02-123-4567',
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  await prisma.companyMember.upsert({
    where: {
      userId_companyId: {
        userId: companyUser.id,
        companyId: company.id,
      },
    },
    update: { role: 'OWNER' },
    create: {
      userId: companyUser.id,
      companyId: company.id,
      role: 'OWNER',
    },
  });

  // Create sample Company Custom Assessment (OPEN_ENDED)
  const customExam = await prisma.assessment.upsert({
    where: { slug: 'tech-nova-order-validation-challenge' },
    update: {},
    create: {
      companyId: company.id,
      title: 'ออกแบบฟังก์ชันตรวจคำสั่งซื้อ (TechNova Challenge)',
      slug: 'tech-nova-order-validation-challenge',
      description: 'ข้อสอบปฏิบัติของบริษัทเพื่อประเมินการออกแบบโครงสร้างโค้ดและการจัดการข้อผิดพลาด',
      type: AssessmentType.PRACTICAL_CODING,
      skillId: jsSkill?.id ?? null,
      timeLimitMinutes: 45,
      passingScore: 70,
      feedbackVisibility: FeedbackVisibility.AFTER_REVIEW,
      isActive: true,
      questions: {
        create: [
          {
            title: 'Validate E-Commerce Order Payload',
            prompt: 'เขียนฟังก์ชัน `solution(order)` เพื่อตรวจสอบรายการสั่งซื้อ และอธิบายแนวคิดการจัดการข้อมูลผิดรูปแบบ (Edge cases)',
            difficulty: QuestionDifficulty.MEDIUM,
            points: 100,
            evaluationMethod: QuestionEvaluationMethod.OPEN_ENDED,
            starterCode: 'function solution(order) {\n  // ตรวจสอบ order.items และคำนวณยอดสุทธิ\n  return { valid: true, total: 0 };\n}',
            rubric: {
              customGuidelines: 'ประเมินความถูกต้อง ความชัดเจนของโค้ด และการดักจับกรณีข้อมูลไม่ครบถ้วน',
            },
          },
        ],
      },
    },
  });

  // Create sample Internal Jobs
  const existingJobs = await prisma.job.findMany({ where: { companyId: company.id } });
  if (existingJobs.length === 0 && jsSkill && sqlSkill) {
    const job1 = await prisma.job.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        title: 'Full Stack JavaScript Developer',
        slug: 'full-stack-javascript-developer-technova',
        description:
          'พัฒนาเว็บแอปพลิเคชันด้วย JavaScript, TypeScript, React และเชื่อมต่อฐานข้อมูล SQL ร่วมกับทีมวิศวกรผลิตภัณฑ์\n• ออกแบบและพัฒนาฟีเจอร์ทั้งฝั่ง Frontend (React / TypeScript) และ Backend API\n• ออกแบบตารางข้อมูลและเขียนคิวรี SQL ที่มีประสิทธิภาพและปลอดภัย\n• ร่วมทำ Code Review และเขียนชุดทดสอบอัตโนมัติร่วมกับทีมวิศวกร',
        requirements:
          '• มีพื้นฐาน JavaScript และ SQL ที่ดี\n• เข้าใจการพัฒนา REST API และการจัดการฐานข้อมูล\n• สามารถเขียนโค้ดที่อ่านง่ายและทดสอบได้',
        benefits:
          '• ประกันสุขภาพกลุ่ม\n• งบสนับสนุนคอร์สเรียนและหนังสือ\n• ทำงานแบบ Hybrid',
        location: 'Bangkok, Thailand',
        isRemote: false,
        employmentType: JobType.FULL_TIME,
        salaryMin: 35000,
        salaryMax: 60000,
        salaryCurrency: 'THB',
        source: JobSource.INTERNAL,
        isActive: true,
        acceptedQuota: 2,
        customAssessmentId: customExam.id,
        skills: {
          create: [
            { skillId: jsSkill.id, isRequired: true, minimumScore: 70, weight: 1.0 },
            { skillId: sqlSkill.id, isRequired: true, minimumScore: 60, weight: 1.0 },
          ],
        },
      },
    });

    if (tsSkill && reactSkill && nodeSkill) {
      await prisma.job.create({
        data: {
          companyId: company.id,
          companyName: company.name,
          title: 'Frontend Engineer (React / TypeScript)',
          slug: 'frontend-engineer-react-typescript-technova',
          description:
            'ออกแบบและพัฒนา UI สำหรับระบบวิเคราะห์ข้อมูลขนาดใหญ่ด้วย React, Next.js และ TypeScript\n• พัฒนา Reusable UI Components ที่รองรับการใช้งานทุกขนาดหน้าจอ\n• เชื่อมต่อ REST API และจัดการ State ของข้อมูลได้อย่างลื่นไหล\n• ปรับปรุงประสิทธิภาพการแสดงผล (Web Vitals & Accessibility)',
          requirements:
            '• เชี่ยวชาญ JavaScript และ TypeScript\n• มีประสบการณ์พัฒนา Responsive Web Application ด้วย React หรือ Next.js',
          benefits:
            '• วันลาพักร้อน 15 วัน\n• อุปกรณ์ทำงานครบชุด',
          location: 'Bangkok, Thailand',
          isRemote: true,
          employmentType: JobType.FULL_TIME,
          salaryMin: 40000,
          salaryMax: 70000,
          salaryCurrency: 'THB',
          source: JobSource.INTERNAL,
          isActive: true,
          acceptedQuota: 3,
          skills: {
            create: [
              { skillId: jsSkill.id, isRequired: true, minimumScore: 70, weight: 1.0 },
              { skillId: tsSkill.id, isRequired: false, minimumScore: 65, weight: 1.0 },
              { skillId: reactSkill.id, isRequired: false, minimumScore: 65, weight: 1.0 },
            ],
          },
        },
      });
    }

    // External Job example (has sourceUrl -> directs user to external site)
    await prisma.job.create({
      data: {
        companyId: null,
        companyName: 'Global Cloud Corp',
        title: 'Backend Node.js & SQL Engineer (External)',
        slug: 'backend-nodejs-sql-engineer-global-cloud',
        description:
          'Build scalable backend microservices with Node.js, JavaScript, and PostgreSQL/SQL.\n• Design and maintain high-availability REST APIs using Node.js and JavaScript\n• Optimize relational database schemas and SQL queries on PostgreSQL\n• Collaborate with DevOps and product teams on cloud deployments',
        requirements:
          '• Strong JavaScript and SQL skills\n• Experience with Node.js backend services and PostgreSQL',
        location: 'Bangkok / Remote',
        isRemote: true,
        employmentType: JobType.REMOTE,
        salaryMin: 50000,
        salaryMax: 85000,
        salaryCurrency: 'THB',
        source: JobSource.JOBSDB,
        sourceUrl: 'https://th.jobsdb.com/job/99887766',
        externalId: 'jobsdb-99887766',
        isActive: true,
        skills: {
          create: [
            { skillId: jsSkill.id, isRequired: true, minimumScore: 70, weight: 1.0 },
            { skillId: sqlSkill.id, isRequired: true, minimumScore: 70, weight: 1.0 },
          ],
        },
      },
    });

    console.log(`[seed:dev] Created sample internal job: ${job1.title}`);
  }

  console.log('[seed:dev] Seed finished.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
