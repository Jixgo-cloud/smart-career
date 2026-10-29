const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'ADMIN_PASSWORD must be at least 10 characters long.';
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'ADMIN_PASSWORD must contain uppercase, lowercase, and numeric characters.';
  }
  return null;
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Error: Valid ADMIN_EMAIL environment variable is required.');
    process.exit(1);
  }

  const pwdError = validateAdminPassword(password);
  if (pwdError) {
    console.error(`Error: ${pwdError}`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Error: User with email "${email}" already exists (will not overwrite existing user).`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      authProvider: 'LOCAL',
      isActive: true,
    },
  });

  console.log(`Admin account created successfully: id=${admin.id}, email=${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
