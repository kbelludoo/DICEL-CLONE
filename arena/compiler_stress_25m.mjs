import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const args = Object.fromEntries(process.argv.slice(2).map(x => { const [k, ...v] = x.split('='); return [k.replace(/^--/, ''), v.join('=')] }))
const durationMs = Number(args['duration-ms'] ?? 25 * 60 * 1000)
const seedInitial = Number(args.seed ?? 260809)
const delayMs = Number(args['delay-ms'] ?? 10)
const maxProbes = Number(args['max-probes'] ?? 0)
const compilerRoot = resolve(args.compiler ?? '/tmp/dicel-compiler')
const tsx = resolve(args.tsx ?? '/tmp/audit-tools/node_modules/.bin/tsx')
const typescriptModule = resolve(args.typescript ?? '/tmp/audit-tools/node_modules/typescript/lib/typescript.js')
const outputDir = resolve(args.output ?? 'arena')
const workerPath = resolve(args.worker ?? 'arena/compiler_worker.ts')
const reportPath = resolve(outputDir, args.report ?? 'ARENA_REPORT.dicel')
const jsonPath = resolve(outputDir, args.json ?? 'ARENA_RESULTS.json')
const progressPath = resolve(outputDir, args.progress ?? 'evidence/stress_progress.log')
mkdirSync(resolve(outputDir, 'evidence'), { recursive: true })
mkdirSync(resolve(outputDir, 'tmp'), { recursive: true })
rmSync(progressPath, { force: true })

let seed = seedInitial >>> 0
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000 }
const pick = xs => xs[Math.floor(random() * xs.length)]
const integer = (min, max) => min + Math.floor(random() * (max - min + 1))
const source = (returnType, body) => `@arena_probe:1.0.0\nfn$test()->${returnType} {\n  ${body}\n}\n`
const binary = ['+','-','*','/','%','<<','>>','&','|','^','<','>','<=','>=','==','!=']
function evalOp(a,op,b){ switch(op){ case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '%':return a%b;case '<<':return a<<b;case '>>':return a>>b;case '&':return a&b;case '|':return a|b;case '^':return a^b;case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;case '==':return a===b;case '!=':return a!==b;default:throw new Error('unknown_op_'+op)} }
function runtimeFields(expected){ return Object.is(expected,-0) ? {runtimeExpected:0,runtimeExpectedSpecial:'-0'} : {runtimeExpected:expected} }

function generate(id) {
  const family = pick(['P1_LEXICAL','P2_PARSER','P3_AST','P4_EMITTER','P5_RUNTIME'])
  const a = integer(0, 1000), b = integer(1, 1000)
  if (family === 'P1_LEXICAL') {
    const op = pick(['+','*','%','&','|','^','<<','>>','~'])
    const expected=op==='~' ? ~a : evalOp(a,op,b)
    return { id, family, name:`lex_${op}`, operator:op, source:source(typeof expected==='boolean'?'bool':'num',`ret ${op==='~'?`${op}${a}`:`${a}${op}${b}`}`), ...runtimeFields(expected) }
  }
  if (family === 'P2_PARSER') {
    const op1 = pick(binary), op2 = pick(binary), c = integer(1,20)
    const variants = [
      {form:`ret (${a}${op1}${b})${op2}${c}`, expected:evalOp(evalOp(a,op1,b),op2,c)},
      {form:`x = ${a}${op1}${b}\n  ret x`, expected:evalOp(a,op1,b)},
      {form:`ret -${a}`, expected:-a},
      {form:`ret ${a}==${b}`, expected:a===b},
    ]
    const variant=pick(variants)
    return { id, family, name:'precedence', operator:`${op1},${op2}`, source:source(typeof variant.expected==='boolean'?'bool':'num',variant.form), ...runtimeFields(variant.expected) }
  }
  if (family === 'P3_AST') {
    const variants = [
      { text:`@arena_probe:1.0.0\n~Box{value:num}\nfn$test()->num {\n  ret ${a}\n}\n`, expected:a },
      { text:`@arena_probe:1.0.0\nfn$test(xs:arr<num>)->num {\n  ret ${a}\n}\n`, expected:a, args:[[]] },
      { text:source('num',`?${a}==${a} { ret ${b} }:{ ret 0 }`), expected:b },
      { text:source('num',`%i in values { ret i }\n  ret 0`), expected:undefined },
    ]
    const variant = pick(variants)
    return { id, family, name:'ast_shape', operator:'NA', source:variant.text, args:variant.args ?? [], ...(variant.expected===undefined?{}:runtimeFields(variant.expected)) }
  }
  if (family === 'P4_EMITTER') {
    const op = pick(['==','!=','+','*','%'])
    const expected = op === '==' ? a === b : op === '!=' ? a !== b : op === '+' ? a+b : op === '*' ? a*b : a%b
    return { id, family, name:'emitter_operator', operator:op, source:source(typeof expected === 'boolean'?'bool':'num',`ret ${a}${op}${b}`), ...runtimeFields(expected) }
  }
  const kind = pick(['string','boolean','negative','equality','arithmetic'])
  if (kind === 'string') return { id, family, name:kind, operator:'NA', source:source('str',`ret "arena_${a}"`), ...runtimeFields(`arena_${a}`) }
  if (kind === 'boolean') return { id, family, name:kind, operator:'NA', source:source('bool','ret T'), ...runtimeFields(true) }
  if (kind === 'negative') return { id, family, name:kind, operator:'-', source:source('num',`ret -${a}`), ...runtimeFields(-a) }
  if (kind === 'equality') return { id, family, name:kind, operator:'==', source:source('bool',`ret ${a}==${a}`), ...runtimeFields(true) }
  return { id, family, name:kind, operator:'+', source:source('num',`ret ${a}+${b}`), ...runtimeFields(a+b) }
}

function normalizeError(error='') {
  return String(error)
    .replace(/"arena_\d+"/g,'"arena_N"')
    .replace(/\b\d+\b/g,'N')
    .replace(/<arena:\d+>/g,'<arena:N>')
    .slice(0, 500)
}
function classify(probe, result) {
  if (result.compile && result.runtime_equal === false) return 'runtime_divergence'
  if (result.compile) return 'compile_pass'
  const e = result.error ?? ''
  if (result.phase === 'typechecker') return 'typecheck_failure'
  if (result.phase === 'emitter') {
    if (probe.operator && probe.operator !== 'NA') return 'missing_operator_or_precedence'
    return 'emitter_failure'
  }
  if (result.phase === 'parser') {
    if (probe.operator && probe.operator !== 'NA') return ['<<','>>','&','|','^','+','*','/','%','<','>','<=','>='].some(x => probe.operator.includes(x)) ? 'missing_operator_or_precedence' : 'parser_failure'
    return 'parser_failure'
  }
  return 'worker_failure'
}

const worker = spawn(tsx, [workerPath], { env: { ...process.env, DICEL_COMPILER_ROOT: compilerRoot, TYPESCRIPT_MODULE: typescriptModule }, stdio:['pipe','pipe','pipe'] })
const lines = createInterface({ input: worker.stdout, crlfDelay: Infinity })
const pending = new Map()
lines.on('line', line => { try { const r=JSON.parse(line); const p=pending.get(r.id); if(p){pending.delete(r.id);p.resolve(r)} } catch {} })
let workerStderr=''; worker.stderr.on('data', d => workerStderr += d.toString())
function compileProbe(probe) { return new Promise((resolvePromise,reject) => { pending.set(probe.id,{resolve:resolvePromise,reject}); worker.stdin.write(JSON.stringify(probe)+'\n') }) }

const startedAt = new Date().toISOString()
const start = Date.now()
let id=0, compilePass=0, compileFail=0, runtimeTests=0, runtimePass=0, runtimeFail=0
const familyStats = {}, phaseStats = {}, categoryStats = {}, operatorStats = {}
const findings = new Map()
while (Date.now() - start < durationMs && (maxProbes <= 0 || id < maxProbes)) {
  id++
  const probe = generate(id)
  const result = await compileProbe(probe)
  const category = classify(probe,result)
  familyStats[probe.family] = (familyStats[probe.family]??0)+1
  phaseStats[result.phase] = (phaseStats[result.phase]??0)+1
  categoryStats[category] = (categoryStats[category]??0)+1
  operatorStats[probe.operator] = operatorStats[probe.operator] ?? {probes:0,pass:0,fail:0,runtime_fail:0}
  operatorStats[probe.operator].probes++
  if(result.compile){compilePass++;operatorStats[probe.operator].pass++}else{compileFail++;operatorStats[probe.operator].fail++}
  if(result.runtime !== undefined){runtimeTests++;if(result.runtime_equal)runtimePass++;else{runtimeFail++;operatorStats[probe.operator].runtime_fail++}}
  if(category !== 'compile_pass') {
    const signature = `${category}|${probe.family}|${probe.operator}|${normalizeError(result.error ?? result.runtime_error ?? '')}`
    const hash = createHash('sha256').update(signature).digest('hex').slice(0,16)
    if(!findings.has(hash)) findings.set(hash,{id:`ARENA-GAP-${String(findings.size+1).padStart(4,'0')}`,signature_hash:hash,category,family:probe.family,operator:probe.operator,source:probe.source,result,count:0})
    findings.get(hash).count++
  }
  if(id % 1000 === 0) appendFileSync(progressPath, `${new Date().toISOString()} probes=${id} findings=${findings.size} compile_pass=${compilePass} compile_fail=${compileFail} runtime_fail=${runtimeFail}\n`)
  if(delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
  else if(id % 100 === 0) await new Promise(r => setImmediate(r))
}
worker.stdin.end()
await new Promise(resolvePromise => worker.on('exit', resolvePromise))

const finishedAt = new Date().toISOString()
const resultDoc = {version:1,seed:seedInitial,delay_ms:delayMs,max_probes:maxProbes,duration_requested_ms:durationMs,duration_actual_ms:Date.now()-start,started_at:startedAt,finished_at:finishedAt,probes:id,compile_pass:compilePass,compile_fail:compileFail,runtime_tests:runtimeTests,runtime_pass:runtimePass,runtime_fail:runtimeFail,family_stats:familyStats,phase_stats:phaseStats,category_stats:categoryStats,operator_stats:operatorStats,unique_findings:[...findings.values()],worker_stderr:workerStderr}
writeFileSync(jsonPath, JSON.stringify(resultDoc,null,2)+'\n')

const esc = x => JSON.stringify(String(x))
const report=[]
report.push(`@DICE-L:arena-compiler-stress:1.0.0;duration_ms=${resultDoc.duration_actual_ms};seed=${seedInitial};status=completed`)
report.push(`~StressSummary{probes:${id},compile_pass:${compilePass},compile_fail:${compileFail},runtime_tests:${runtimeTests},runtime_pass:${runtimePass},runtime_fail:${runtimeFail},unique_findings:${findings.size},started_at:${esc(startedAt)},finished_at:${esc(finishedAt)}}`)
for(const [name,count] of Object.entries(familyStats).sort()) report.push(`~PhaseCount{phase:${esc(name)},count:${count}}`)
for(const [name,count] of Object.entries(categoryStats).sort()) report.push(`~CategoryCount{category:${esc(name)},count:${count}}`)
for(const [op,stat] of Object.entries(operatorStats).sort()) report.push(`~OperatorResult{operator:${esc(op)},probes:${stat.probes},pass:${stat.pass},fail:${stat.fail},runtime_fail:${stat.runtime_fail}}`)
for(const finding of findings.values()) report.push(`~Finding{id:${esc(finding.id)},signature_hash:${esc(finding.signature_hash)},category:${esc(finding.category)},family:${esc(finding.family)},operator:${esc(finding.operator)},count:${finding.count},source_sha256:${esc(createHash('sha256').update(finding.source).digest('hex'))},error:${esc(normalizeError(finding.result.error ?? finding.result.runtime_error ?? 'runtime_mismatch'))},status:"reported_unfixed"}`)
report.push(`~Changelog{duration_ms:${resultDoc.duration_actual_ms},probes:${id},findings:${findings.size},fixes_applied:0}`)
writeFileSync(reportPath, report.join('\n')+'\n')
console.log(JSON.stringify({report:reportPath,json:jsonPath,probes:id,findings:findings.size,compilePass,compileFail,runtimeTests,runtimePass,runtimeFail,durationMs:resultDoc.duration_actual_ms},null,2))
