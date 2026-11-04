#!/usr/bin/env node
/**
 * ESLint Code Quality & Lint Score Calculator
 * Analyzes ESLint results and computes an objective 10-point Quality Score.
 */

const { execSync } = require('child_process');
const fs = require('fs');

function run() {
  console.log('\n================================================================');
  console.log('🔍 RUNNING ESLINT & CODE QUALITY SCORE ANALYSIS');
  console.log('================================================================\n');

  let rawJson = '';
  try {
    rawJson = execSync('npx eslint --format json src tests', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // If lint errors occurred, stdout still contains JSON
    rawJson = err.stdout ? err.stdout.toString() : '';
  }

  let results = [];
  try {
    results = JSON.parse(rawJson);
  } catch {
    console.error('❌ Failed to parse ESLint JSON output');
    process.exit(1);
  }

  const totalFiles = results.length;
  let totalErrors = 0;
  let totalWarnings = 0;
  let cleanFiles = 0;

  results.forEach((file) => {
    totalErrors += file.errorCount || 0;
    totalWarnings += file.warningCount || 0;
    if ((file.errorCount || 0) === 0 && (file.warningCount || 0) === 0) {
      cleanFiles += 1;
    }
  });

  // Calculate 10-point Lint Score
  // Base 10.0, -1.5 per error, -0.25 per warning
  const penalty = (totalErrors * 1.5) + (totalWarnings * 0.25);
  const score = Math.max(0, Math.min(10, 10 - penalty)).toFixed(2);
  const cleanPercentage = totalFiles > 0 ? ((cleanFiles / totalFiles) * 100).toFixed(1) : '100.0';

  let grade = 'A+';
  let badgeColor = 'brightgreen';
  if (score < 6) { grade = 'F'; badgeColor = 'red'; }
  else if (score < 7) { grade = 'C'; badgeColor = 'yellow'; }
  else if (score < 8.5) { grade = 'B'; badgeColor = 'yellowgreen'; }
  else if (score < 9.5) { grade = 'A'; badgeColor = 'green'; }

  console.log(`📁 Files Analyzed:       ${totalFiles}`);
  console.log(`✨ Clean Files:          ${cleanFiles} (${cleanPercentage}%)`);
  console.log(`⚠️ Total Warnings:       ${totalWarnings}`);
  console.log(`❌ Total Errors:         ${totalErrors}`);
  console.log('----------------------------------------------------------------');
  console.log(`🏆 LINT SCORE:           ${score} / 10.00  [Grade: ${grade}]`);
  console.log('================================================================\n');

  // If running in GitHub Actions, append a rich markdown summary to $GITHUB_STEP_SUMMARY
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summaryMd = `
### 📊 Code Quality & Lint Score Report

| Metric | Result |
| :--- | :--- |
| **Lint Score** | **\`${score} / 10.00\`** (Grade: **${grade}**) |
| **Files Analyzed** | \`${totalFiles}\` |
| **Clean Files** | \`${cleanFiles} / ${totalFiles}\` (\`${cleanPercentage}%\`) |
| **ESLint Warnings** | \`${totalWarnings}\` |
| **ESLint Errors** | \`${totalErrors}\` |

> **Verdict**: ${totalErrors === 0 ? '✅ **Codebase meets strict linting standards.**' : '❌ **Lint issues must be resolved before merge.**'}
`;
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd, 'utf-8');
    } catch (e) {
      console.warn('Could not write to GITHUB_STEP_SUMMARY:', e.message);
    }
  }

  if (totalErrors > 0) {
    process.exit(1);
  }
}

run();
