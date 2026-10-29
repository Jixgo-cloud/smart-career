const { execSync } = require('child_process');

function runStep(title, cmd) {
  console.log(`\n=== [VERIFY] ${title} ===`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  runStep('Build Shared Package', 'npm run build:shared');
  runStep('Domain Invariants Test Suite', 'npm run test:domain');
  runStep('Security & Isolation Test Suite', 'npm run test:security');
  runStep('Full UAT E2E Test Suite', 'npm run test:uat');
  console.log('\n✅ ALL CORE REGRESSION CHECKS PASSED');
} catch (err) {
  console.error('\n❌ CORE REGRESSION CHECK FAILED:', err.message);
  process.exit(1);
}
