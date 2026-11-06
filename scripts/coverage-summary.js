#!/usr/bin/env node
/**
 * Branch & Code Coverage Analysis Reporter
 * Validates that Branch Coverage is >= 75.0% and formats summary tables.
 */

const fs = require('fs');
const path = require('path');

const summaryPath = path.resolve(__dirname, '../coverage/coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('❌ Error: coverage/coverage-summary.json not found. Run tests with coverage first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total;

const branchPct = Number(total.branches.pct);
const stmtPct = Number(total.statements.pct);
const linePct = Number(total.lines.pct);
const funcPct = Number(total.functions.pct);

const REQUIRED_BRANCH_COVERAGE = 75.0;

console.log('\n================================================================');
console.log('📈 CODE AND BRANCH COVERAGE ANALYSIS REPORT');
console.log('================================================================\n');

console.log(`🌿 Branch Coverage:     ${branchPct.toFixed(2)}%  (${total.branches.covered} / ${total.branches.total})  [Required: >= ${REQUIRED_BRANCH_COVERAGE}%]`);
console.log(`📝 Statement Coverage:  ${stmtPct.toFixed(2)}%  (${total.statements.covered} / ${total.statements.total})`);
console.log(`⚡ Function Coverage:   ${funcPct.toFixed(2)}%  (${total.functions.covered} / ${total.functions.total})`);
console.log(`📄 Line Coverage:       ${linePct.toFixed(2)}%  (${total.lines.covered} / ${total.lines.total})`);
console.log('----------------------------------------------------------------');

const meetsRequirement = branchPct >= REQUIRED_BRANCH_COVERAGE;
if (meetsRequirement) {
  console.log(`✅ SUCCESS: Branch coverage of ${branchPct.toFixed(2)}% satisfies the >= 75% requirement!`);
} else {
  console.error(`❌ FAILURE: Branch coverage of ${branchPct.toFixed(2)}% is below the required ${REQUIRED_BRANCH_COVERAGE}% threshold!`);
}
console.log('================================================================\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  const markdown = `
### 📈 Code & Branch Coverage Summary

| Metric | Coverage | Covered / Total | Requirement | Status |
| :--- | :--- | :--- | :--- | :--- |
| **🌿 Branches** | **\`${branchPct.toFixed(2)}%\`** | \`${total.branches.covered} / ${total.branches.total}\` | \`>= 75.0%\` | ${meetsRequirement ? '✅ **PASSED**' : '❌ **FAILED**'} |
| **📝 Statements** | **\`${stmtPct.toFixed(2)}%\`** | \`${total.statements.covered} / ${total.statements.total}\` | - | ✅ |
| **⚡ Functions** | **\`${funcPct.toFixed(2)}%\`** | \`${total.functions.covered} / ${total.functions.total}\` | - | ✅ |
| **📄 Lines** | **\`${linePct.toFixed(2)}%\`** | \`${total.lines.covered} / ${total.lines.total}\` | - | ✅ |

> **Branch Coverage Status**: ${meetsRequirement ? '✅ **Branch coverage requirement (>= 75%) successfully achieved.**' : '❌ **Branch coverage below threshold.**'}
`;
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf-8');
  } catch (err) {
    console.warn('Could not write to GITHUB_STEP_SUMMARY:', err.message);
  }
}

if (!meetsRequirement) {
  process.exit(1);
}
