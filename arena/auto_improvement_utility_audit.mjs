import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d};
const target=path.resolve(arg('--target','/tmp/dicel-current'));
const out=path.resolve(arg('--out','arena'));
const evidence=path.join(out,'evidence');fs.mkdirSync(evidence,{recursive:true});
const scripts={p119:'scripts/pipeline/p119_continuous_evolution.mjs',p121:'scripts/pipeline/p121_independent_learning_discovery.mjs',p129:'scripts/pipeline/p129_recursive_meta_evolution.mjs',p130:'scripts/pipeline/p130_meta_governance.mjs'};
const runs={};for(const [id,rel] of Object.entries(scripts)){const r=spawnSync('node',[path.join(target,rel)],{cwd:target,encoding:'utf8',timeout:120000});runs[id]={exit:r.status,stdout:r.stdout,stderr:r.stderr};fs.writeFileSync(path.join(evidence,`auto_${id}.stdout.log`),r.stdout);fs.writeFileSync(path.join(evidence,`auto_${id}.stderr.log`),r.stderr);}
const src=Object.fromEntries(Object.entries(scripts).map(([id,rel])=>[id,fs.readFileSync(path.join(target,rel),'utf8')]));
const staticChecks={
 p129_mechanism_hardcoded:/const mechanismV02\s*=/.test(src.p129),
 p129_expected_hardcoded:/const expected\s*=\s*\[7, 0, 0, 5, 1e9, 0\]/.test(src.p129),
 p129_real_compiler_mutation:/writeFileSync\([^\n]*(semantic|parser|emitter|compiler)/i.test(src.p129),
 p130_candidates_hardcoded:/const M_good\s*=/.test(src.p130)&&/const M_bad\s*=/.test(src.p130),
 p130_circular_oracle:/const expected\s*=\s*inputs\.map\(\(\[x, k\]\)\s*=>\s*\{\s*const r = rotordown\(x, k\)/s.test(src.p130),
 p130_operator_stub:/fn\$applyRotordown[\s\S]*return x/.test(src.p130),
 p119_gap_hardcoded:/anomaly:\s*'dynamic_concurrency_deadlock_on_resource_contention'/.test(src.p119),
 p119_rule_hardcoded:/name:\s*'concurrency_reordering_guard'/.test(src.p119),
 p121_lexical_marker_scan:/const novelMarkers\s*=/.test(src.p121)&&/lower\.includes\(marker\)/.test(src.p121),
 p121_real_compile_or_test:/\bcompile\s*\(|spawnSync|execFile|execSync/.test(src.p121),
};
// P130 circular-oracle mutation test
const inputs=[[0x12345678,4],[1,1],[0xFFFFFFFF,8],[1e12,16],[-5,3]];
const independent=(x,k)=>{const clamped=Math.max(-1e9,Math.min(1e9,x));const s=k&31;const v=clamped|0;return((v>>>s)|(v<<(32-s)))>>>0};
const mutant=()=>0;const circularGot=inputs.map(([x,k])=>mutant(x,k));const circularExpected=inputs.map(([x,k])=>mutant(x,k));const circularPass=circularGot.every((x,i)=>x===circularExpected[i]);const independentExpected=inputs.map(([x,k])=>independent(x,k));const independentMismatch=circularGot.filter((x,i)=>x!==independentExpected[i]).length;
// P129 external utility objective: finite normalization should preserve finite magnitude.
const v01=x=>{const v=Number(x);return Number.isFinite(v)?v:0};const v02=x=>{const v=Number(x);if(!Number.isFinite(v))return 0;const c=Math.max(-1e9,Math.min(1e9,v));return Object.is(c,-0)?0:c};const utilityInputs=['1e300','-1e300','42','-0'];const preservationError=f=>utilityInputs.reduce((sum,x)=>{const original=Number(x);const y=f(x);return sum+(Number.isFinite(original)?Math.abs(y-original):0)},0);const p129External={inputs:utilityInputs,v01_error:preservationError(v01),v02_error:preservationError(v02)};
// P119 novelty: the two actual cycles are hardcoded identical.
const p119Text=runs.p119.stdout;const cycleLines=p119Text.split(/\r?\n/).filter(x=>/Ciclo \d+: Lacuna/.test(x));const p119Unique=new Set(cycleLines.map(x=>x.replace(/Ciclo \d+:/,'Ciclo:'))).size;
// P121 controlled false-positive sandbox.
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'p121-audit-'));fs.mkdirSync(path.join(sandbox,'scripts','pipeline'),{recursive:true});fs.mkdirSync(path.join(sandbox,'src'),{recursive:true});fs.copyFileSync(path.join(target,scripts.p121),path.join(sandbox,scripts.p121));fs.writeFileSync(path.join(sandbox,'src','probe.dicel'),'discover banana_operator\n');const p121Run=spawnSync('node',[path.join(sandbox,scripts.p121)],{cwd:sandbox,encoding:'utf8'});let p121Json={};try{const start=p121Run.stdout.indexOf('{');p121Json=JSON.parse(p121Run.stdout.slice(start));}catch{}
const criteria={
 scripts_execute:Object.values(runs).every(r=>r.exit===0),
 autonomous_candidate_generation:!staticChecks.p129_mechanism_hardcoded&&!staticChecks.p130_candidates_hardcoded,
 real_compiler_self_modification:staticChecks.p129_real_compiler_mutation,
 independent_oracle:!staticChecks.p130_circular_oracle&&independentMismatch===0,
 external_heldout_improvement:p129External.v02_error<p129External.v01_error,
 nontrivial_cycle_novelty:p119Unique>1,
 semantic_discovery_not_keyword_scan:!staticChecks.p121_lexical_marker_scan&&p121Json.novel_operator_discovery_rate!==1,
 real_compile_execute_compare:staticChecks.p121_real_compile_or_test,
};
const useful=Object.values(criteria).filter(Boolean).length;const total=Object.keys(criteria).length;
const result={target_head:'e59c84b66c23abb95338162d5deefd7c6000dcc2',runs:Object.fromEntries(Object.entries(runs).map(([k,v])=>[k,{exit:v.exit,stdout_sha256:crypto.createHash('sha256').update(v.stdout).digest('hex'),stderr:v.stderr}])),static_checks:staticChecks,p130_adversarial:{mutant_circular_oracle_pass:circularPass,independent_oracle_mismatches:independentMismatch,independent_expected:independentExpected},p129_external_utility:p129External,p119_cycle_novelty:{cycles:cycleLines.length,unique_behaviors:p119Unique},p121_false_positive:{sandbox_exit:p121Run.status,novel_operator_discovery_rate:p121Json.novel_operator_discovery_rate,novel_candidates:p121Json.novel_candidates},criteria,criteria_pass:useful,criteria_total:total,final_status:useful>=6?'USEFUL':useful>=3?'LIMITED_DEMO_UTILITY':'SIMULATION_ONLY_NOT_REAL_AUTO_IMPROVEMENT'};
fs.writeFileSync(path.join(out,'AUTO_IMPROVEMENT_UTILITY_AUDIT.json'),JSON.stringify(result,null,2)+'\n');
const L=[];L.push(`@DICE-L:auto-improvement-utility-audit:1.0.0;status=${result.final_status}`);L.push(`~AuditSummary{criteria_pass:${useful},criteria_total:${total},scripts_execute:${criteria.scripts_execute},autonomous_candidate_generation:${criteria.autonomous_candidate_generation},real_compiler_self_modification:${criteria.real_compiler_self_modification},independent_oracle:${criteria.independent_oracle},external_heldout_improvement:${criteria.external_heldout_improvement},nontrivial_cycle_novelty:${criteria.nontrivial_cycle_novelty},semantic_discovery:${criteria.semantic_discovery_not_keyword_scan},real_compile_execute_compare:${criteria.real_compile_execute_compare},final_status:"${result.final_status}"}`);L.push(`~Finding{id:"AUTO-001",category:"hardcoded_mechanism",evidence:"P129_mechanismV02_pre_authored",impact:"no_autonomous_mechanism_generation"}`);L.push(`~Finding{id:"AUTO-002",category:"circular_oracle",evidence:"mutant_zero_operator_passes_self_derived_expected",impact:"operator_correctness_not_discriminated"}`);L.push(`~Finding{id:"AUTO-003",category:"stub_operator",evidence:"applyRotordown_compiler_probe_returns_x",impact:"invented_operator_not_compiled_or_executed"}`);L.push(`~Finding{id:"AUTO-004",category:"external_utility_regression",evidence:"v02_preservation_error_${p129External.v02_error}",impact:"hardcoded_objective_hides_magnitude_loss"}`);L.push(`~Finding{id:"AUTO-005",category:"duplicate_evolution_cycle",evidence:"P119_cycles_${cycleLines.length}_unique_${p119Unique}",impact:"memory_growth_without_new_discovery"}`);L.push(`~Finding{id:"AUTO-006",category:"lexical_false_novelty",evidence:"banana_operator_rate_${p121Json.novel_operator_discovery_rate}",impact:"keyword_presence_misclassified_as_learning_operator"}`);L.push(`~Verdict{useful_for:"demo_report_generation",not_proven_for:"autonomous_compiler_improvement",status:"${result.final_status}"}`);fs.writeFileSync(path.join(out,'AUTO_IMPROVEMENT_UTILITY_AUDIT.dicel'),L.join('\n')+'\n');console.log(JSON.stringify({criteria_pass:useful,criteria_total:total,status:result.final_status,p130_mutant_pass:circularPass,p130_independent_mismatches:independentMismatch,p121_false_novelty:p121Json.novel_operator_discovery_rate},null,2));
