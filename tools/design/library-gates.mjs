// The upstream CLI expects system Chrome and file-based pages. Run its unmodified
// audit logic on rendered snapshots, using the workspace Chromium installation.
import {readFileSync,writeFileSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const kit=resolve('tmp/ux-ui-agent-skills');
if(!existsSync(kit))throw new Error('Clone https://github.com/plugin87/ux-ui-agent-skills into tmp/ux-ui-agent-skills first.');
if(!existsSync(`${kit}/node_modules`))symlinkSync(resolve('frontend/node_modules'),`${kit}/node_modules`,'junction');
const browser=process.env.FLAGMAN_BROWSER;
if(!browser)throw new Error('Set FLAGMAN_BROWSER to the installed Chromium executable.');
const output=resolve('test-results/redesign');mkdirSync(output,{recursive:true});
const targets=['login','overview-desktop'];
const gates=['verify_states','verify_target_size','verify_responsive','verify_mobile_first','verify_reduced_motion','axe_audit','slop_tells'];
const reports=[];let failed=false;
for(const gate of gates){
  const original=readFileSync(`${kit}/scripts/${gate}.mjs`,'utf8');
  const adapted=original.replaceAll("{ channel: 'chrome' }",`{ executablePath: ${JSON.stringify(browser)} }`).replaceAll("{ channel: 'chrome', headless: true }",`{ executablePath: ${JSON.stringify(browser)}, headless: true }`).replaceAll("chromium.launch()",`chromium.launch({ executablePath: ${JSON.stringify(browser)} })`);
  const runner=`${kit}/scripts/.flagman-${gate}.mjs`;writeFileSync(runner,adapted);
  for(const target of targets){
    const args=[runner,`${output}/${target}.html`];
    if(gate==='verify_responsive'||gate==='verify_mobile_first')args.push('--scale=1.25');
    if(gate==='slop_tells')args.push('--strict');
    const result=spawnSync(process.execPath,args,{cwd:kit,encoding:'utf8',env:{...process.env,DS_REQUIRE_BROWSER:'1'},timeout:45000});
    const report=`${gate} / ${target} (exit ${result.status})\n${result.stdout??''}${result.stderr??''}${result.error??''}`;
    reports.push(report);console.log(report);if(result.status!==0||/SKIPPED/.test(report))failed=true;
  }
}
writeFileSync(`${output}/library-gates.txt`,reports.join('\n\n'));
process.exitCode=failed?1:0;
