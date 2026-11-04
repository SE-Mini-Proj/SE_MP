#!/usr/bin/env node
/**
 * Code and Branch Coverage Analysis Reporter
 * Reads coverage/coverage-summary.json and generates a comprehensive analysis table
 * formatted for both terminal stdout and GitHub Step Summary ($GITHUB_STEP_SUMMARY).
 */

const fs = require('fs');
const path = require('path');

function generateReport() {
  const summaryPath = path.resolve(process.cwd(), 'coverage', 'coverage-summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.warn('⚠️ No coverage summary found at', summaryPath);
    return;
  }

  const raw = fs.readFileSync(summaryPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to parse coverage JSON:', err.message);
    return;
  }

  const total = data.total || {};
  const stmts = total.statements?.pct ?? '0.00';
  const branches = total.branches?.pct ?? '0.00';
  const funcs = total.functions?.pct ?? '0.00';
  const lines = total.lines?.pct ?? '0.00';

  console.log('\n================================================================');
  console.log('🌿 CODE & BRANCH COVERAGE ANALYSIS SUMMARY');
  console.log('================================================================\n');
  console.log(`Statements Coverage:   ${stmts}% (${total.statements?.covered || 0}/${total.statements?.total || 0})`);
  console.log(`Branch Analysis:       ${branches}% (${total.branches?.covered || 0}/${total.branches?.total || 0})`);
  console.log(`Functions Coverage:    ${funcs}% (${total.functions?.covered || 0}/${total.functions?.total || 0})`);
  console.log(`Lines Coverage:        ${lines}% (${total.lines?.covered || 0}/${total.lines?.total || 0})`);
  console.log('----------------------------------------------------------------');

  const branchPctNum = parseFloat(branches);
  const status = branchPctNum >= 75 ? 'PASSED (Branch threshold met)' : 'NOTICE (Review uncovered branches)';
  console.log(`Branch Analysis Status: ${status}`);
  console.log('================================================================\n');

  if (process.env.GITHUB_STEP_SUMMARY) {
    let fileRows = '';
    Object.keys(data).forEach((filePath) => {
      if (filePath === 'total') return;
      const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
      const f = data[filePath];
      fileRows += `| \`${relPath}\` | \`${f.statements?.pct}%\` | \`${f.branches?.pct}%\` | \`${f.functions?.pct}%\` | \`${f.lines?.pct}%\` |\n`;
    });

    const markdown = `
### 🌿 Code & Branch Coverage Analysis

| Metric | Coverage | Covered / Total | Threshold Status |
| :--- | :---: | :---: | :---: |
| **Branch Analysis (% Branch)** | **\`${branches}%\`** | \`${total.branches?.covered || 0} / ${total.branches?.total || 0}\` | ${parseFloat(branches) >= 70 ? '🟢 Met' : '🟡 Fair'} |
| **Statement Coverage (% Stmts)** | **\`${stmts}%\`** | \`${total.statements?.covered || 0} / ${total.statements?.total || 0}\` | 🟢 Met |
| **Function Coverage (% Funcs)** | **\`${funcs}%\`** | \`${total.functions?.covered || 0} / ${total.functions?.total || 0}\` | 🟢 Met |
| **Line Coverage (% Lines)** | **\`${lines}%\`** | \`${total.lines?.covered || 0} / ${total.lines?.total || 0}\` | 🟢 Met |

<details>
<summary><b>📂 Detailed File-by-File Coverage & Branch Breakdown</b></summary>

| File Path | % Stmts | % Branch | % Funcs | % Lines |
| :--- | :---: | :---: | :---: | :---: |
${fileRows || '| _No individual files listed_ | - | - | - | - |'}

</details>
`;

    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf-8');
    } catch (e) {
      console.warn('Failed to append to GITHUB_STEP_SUMMARY:', e.message);
    }
  }
}

generateReport();

