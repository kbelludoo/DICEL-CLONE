import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const[k,...v]=x.split('=');return[k.replace(/^--/,''),v.join('=')]}));
const durationMs=Number(args['duration-ms']??1500000),delayMs=Number(args['delay-ms']??20),seedInitial=Number(args.seed??260825);
const latestRoot=resolve(args.latest??'/tmp/dicel-latest'),outputDir=resolve(args.output??'arena'),workerPath=resolve(args.worker??'arena/latest_compiler_worker.mjs');
const reportPath=resolve(outputDir,args.report??'ARENA_UPDATE_20M_REPORT.dicel'),jsonPath=resolve(outputDir,args.json??'ARENA_UPDATE_20M_RESULTS.json'),progressPath=resolve(outputDir,args.progress??'evidence/update_20m_progress.log');
mkdirSync(resolve(outputDir,'evidence'),{recursive:true});rmSync(progressPath,{force:true});
let seed=seedInitial>>>0;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/0x100000000};const pick=a=>a[Math.floor(random()*a.length)];const integer=(a,b)=>a+Math.floor(random()*(b-a+1));
const src=(ret,body,params='')=>`@arena_update_probe:1.0.0\nfn$test(${params})->${ret} {\n  ${body}\n}\n`;
function op(a,o,b){switch(o){case'+':return a+b;case'-':return a-b;case'*':return a*b;case'/':return a/b;case'%':return a%b;case'<<':return a<<b;case'>>':return a>>b;case'&':return a&b;case'|':return a|b;case'^':return a^b;case'<':return a<b;case'>':return a>b;case'<=':return a<=b;case'>=':return a>=b;case'==':return a===b;case'!=':return a!==b;case'&&':return Boolean(a&&b);case'||':return Boolean(a||b);default:throw new Error(o)}}
const expected=x=>Object.is(x,-0)?{runtimeExpected:0,runtimeExpectedSpecial:'-0'}:{runtimeExpected:x};
const supported=new Set(['+','-','*','/','%','<<','>>','&','|','^','~','==','!=','&&','||']);
function generate(id){
 const family=pick(['P1_LEXICAL','P2_PARSER','P3_AST','P4_EMITTER','P5_RUNTIME']);const a=integer(1,1000),b=integer(1,1000),c=integer(1,30),d=integer(1,5);
 if(family==='P1_LEXICAL'){
  const o=pick(['+','-','*','/','%','<<','>>','&','|','^','~','<','>','<=','>=','==','!=']);const val=o==='~'?~a:op(a,o,b);return{id,family,name:'single_operator',operator:o,source:src(typeof val==='boolean'?'bool':'num',`return ${o==='~'?`~${a}`:`${a}${o}${b}`}`),shouldReject:!supported.has(o),...expected(val)};
 }
 if(family==='P2_PARSER'){
  const kind=pick(['sub_chain','div_chain','mod_chain','shift_chain','bitwise_precedence','mul_div_chain','mul_precedence','paren_precedence','mixed_add_sub','spaced_div','ternary']);
  if(kind==='sub_chain')return{id,family,name:kind,operator:'-,-',source:src('num',`return ${a}-${b}-${c}`),shouldReject:false,...expected(a-b-c)};
  if(kind==='div_chain')return{id,family,name:kind,operator:'/ ,/',source:src('num',`return ${a} / ${b} / ${c}`),shouldReject:false,...expected(a/b/c)};
  if(kind==='mod_chain')return{id,family,name:kind,operator:'%,%',source:src('num',`return ${a}%${b}%${c}`),shouldReject:false,...expected((a%b)%c)};
  if(kind==='shift_chain')return{id,family,name:kind,operator:'<<,>>',source:src('num',`return ${a}<<${c}>>${d}`),shouldReject:false,...expected((a<<c)>>d)};
  if(kind==='bitwise_precedence')return{id,family,name:kind,operator:'|,&',source:src('num',`return ${a}|${b}&${c}`),shouldReject:false,...expected(a|(b&c))};
  if(kind==='mul_div_chain')return{id,family,name:kind,operator:'*,/',source:src('num',`return ${a} * ${b} / ${c}`),shouldReject:false,...expected(a*b/c)};
  if(kind==='mul_precedence')return{id,family,name:kind,operator:'+,*',source:src('num',`return ${a}+${b}*${c}`),shouldReject:false,...expected(a+b*c)};
  if(kind==='paren_precedence')return{id,family,name:kind,operator:'(+)*',source:src('num',`return (${a}+${b})*${c}`),shouldReject:false,...expected((a+b)*c)};
  if(kind==='mixed_add_sub')return{id,family,name:kind,operator:'+,-',source:src('num',`return ${a}+${b}-${c}`),shouldReject:false,...expected(a+b-c)};
  if(kind==='spaced_div')return{id,family,name:kind,operator:'/',source:src('num',`return ${a} / ${b}`),shouldReject:false,...expected(a/b)};
  return{id,family,name:kind,operator:'?:',source:src('num',`return ${a}>${b}?${a}:${b}`),shouldReject:true,...expected(a>b?a:b)};
 }
 if(family==='P3_AST'){
  const kind=pick(['binding','undefined','missing_return','duplicate_fn','unknown_type','struct']);
  if(kind==='binding')return{id,family,name:kind,operator:'+',source:src('num',`let$x = ${a}+${b}\n  return x`),shouldReject:false,...expected(a+b)};
  if(kind==='undefined')return{id,family,name:kind,operator:'NA',source:src('num','return missing'),shouldReject:true};
  if(kind==='missing_return')return{id,family,name:kind,operator:'NA',source:src('num',`let$x = ${a}`),shouldReject:true,...expected(undefined)};
  if(kind==='duplicate_fn')return{id,family,name:kind,operator:'NA',source:`fn$test()->num {\n return ${a}\n}\nfn$test()->num {\n return ${b}\n}\n`,shouldReject:true};
  if(kind==='unknown_type')return{id,family,name:kind,operator:'NA',source:src('Mystery',`return ${a}`),shouldReject:true,...expected(a)};
  return{id,family,name:kind,operator:'NA',source:`struct Box {\n value:num\n}\nfn$test()->num {\n return ${a}\n}\n`,shouldReject:false,...expected(a)};
 }
 if(family==='P4_EMITTER'){
  const kind=pick(['modulo_raw','shift_raw','bitwise_raw','type_mismatch','method','division_no_spaces']);
  if(kind==='modulo_raw')return{id,family,name:kind,operator:'%',source:src('num',`return ${a}%${b}`),shouldReject:false,...expected(a%b)};
  if(kind==='shift_raw')return{id,family,name:kind,operator:'<<',source:src('num',`return ${a}<<${c}`),shouldReject:false,...expected(a<<c)};
  if(kind==='bitwise_raw')return{id,family,name:kind,operator:'&',source:src('num',`return ${a}&${b}`),shouldReject:false,...expected(a&b)};
  if(kind==='type_mismatch')return{id,family,name:kind,operator:'NA',source:src('num','return "wrong"'),shouldReject:true,...expected('wrong')};
  if(kind==='method')return{id,family,name:kind,operator:'NA',source:src('num',`return Math.max(${a},${b})`),shouldReject:false,...expected(Math.max(a,b))};
  return{id,family,name:kind,operator:'/',source:src('num',`return ${a}/${b}`),shouldReject:false,...expected(a/b)};
 }
 const o=pick(['+','-','*','/','==','!=','%','<<','&']);const val=op(a,o,b);return{id,family,name:'differential',operator:o,source:src(typeof val==='boolean'?'bool':'num',`return ${a}${o}${b}`),shouldReject:!supported.has(o),...expected(val)};
}
function norm(e=''){return String(e).replace(/\b\d+(?:\.\d+)?\b/g,'N').replace(/arena_update_probe/g,'probe').slice(0,500)}
function classify(p,r){const hasDiag=(r.diagnostics??[]).length>0;if(r.compile&&r.runtime_equal===false)return'runtime_divergence';if(r.compile&&p.shouldReject)return'unsupported_feature_emitted';if(r.compile&&hasDiag)return'accepted_with_diagnostics';if(!r.compile&&!p.shouldReject)return'supported_feature_rejected';if(!r.compile&&p.shouldReject)return'controlled_rejection';return'compile_pass'}
const worker=spawn('node',[workerPath],{env:{...process.env,DICEL_LATEST_ROOT:latestRoot},stdio:['pipe','pipe','pipe']});const rl=createInterface({input:worker.stdout,crlfDelay:Infinity});const pending=new Map();rl.on('line',l=>{try{const r=JSON.parse(l),p=pending.get(r.id);if(p){pending.delete(r.id);p(r)}}catch{}});let workerStderr='';worker.stderr.on('data',d=>workerStderr+=d);
const compile=p=>new Promise(res=>{pending.set(p.id,res);worker.stdin.write(JSON.stringify(p)+'\n')});
const start=Date.now(),startedAt=new Date().toISOString();let id=0,compilePass=0,compileFail=0,runtimeTests=0,runtimePass=0,runtimeFail=0;const families={},categories={},phases={},operators={},findings=new Map();
while(Date.now()-start<durationMs){id++;const p=generate(id),r=await compile(p),cat=classify(p,r);families[p.family]=(families[p.family]??0)+1;categories[cat]=(categories[cat]??0)+1;phases[r.phase]=(phases[r.phase]??0)+1;operators[p.operator]??={probes:0,pass:0,fail:0,runtime_fail:0};operators[p.operator].probes++;if(r.compile){compilePass++;operators[p.operator].pass++}else{compileFail++;operators[p.operator].fail++}if(r.runtime!==undefined){runtimeTests++;if(r.runtime_equal)runtimePass++;else{runtimeFail++;operators[p.operator].runtime_fail++}}
 if(!['compile_pass','controlled_rejection'].includes(cat)){const sig=`${cat}|${p.family}|${p.name}|${p.operator}|${norm(JSON.stringify(r.diagnostics??r.parse_errors??r.runtime_error??''))}`,h=createHash('sha256').update(sig).digest('hex').slice(0,16);if(!findings.has(h))findings.set(h,{id:`UPDATE-GAP-${String(findings.size+1).padStart(4,'0')}`,hash:h,category:cat,family:p.family,name:p.name,operator:p.operator,source:p.source,result:r,count:0});findings.get(h).count++}
 if(id%1000===0)appendFileSync(progressPath,`${new Date().toISOString()} probes=${id} findings=${findings.size} runtime_fail=${runtimeFail}\n`);if(delayMs)await new Promise(x=>setTimeout(x,delayMs));}
worker.stdin.end();await new Promise(x=>worker.on('exit',x));const doc={version:1,upstream_commit:'249091e7e8ac24169e9fe91f431f004f94e3590a',seed:seedInitial,duration_requested_ms:durationMs,duration_actual_ms:Date.now()-start,started_at:startedAt,finished_at:new Date().toISOString(),probes:id,compile_pass:compilePass,compile_fail:compileFail,runtime_tests:runtimeTests,runtime_pass:runtimePass,runtime_fail:runtimeFail,family_stats:families,phase_stats:phases,category_stats:categories,operator_stats:operators,unique_findings:[...findings.values()],worker_stderr:workerStderr};writeFileSync(jsonPath,JSON.stringify(doc,null,2)+'\n');
const e=x=>JSON.stringify(String(x)),L=[];L.push(`@DICE-L:arena-update-stress:1.0.0;upstream=249091e7;duration_ms=${doc.duration_actual_ms};status=completed`);L.push(`~StressSummary{probes:${id},compile_pass:${compilePass},compile_fail:${compileFail},runtime_tests:${runtimeTests},runtime_pass:${runtimePass},runtime_fail:${runtimeFail},unique_findings:${findings.size},fixes_applied:0}`);for(const[k,v]of Object.entries(families).sort())L.push(`~PhaseCount{phase:${e(k)},count:${v}}`);for(const[k,v]of Object.entries(categories).sort())L.push(`~CategoryCount{category:${e(k)},count:${v}}`);for(const f of findings.values())L.push(`~Finding{id:${e(f.id)},signature_hash:${e(f.hash)},category:${e(f.category)},family:${e(f.family)},case_name:${e(f.name)},operator:${e(f.operator)},count:${f.count},source_sha256:${e(createHash('sha256').update(f.source).digest('hex'))},diagnostic:${e(norm(JSON.stringify(f.result.diagnostics??f.result.parse_errors??f.result.runtime_error??'')))},status:"reported_unfixed"}`);L.push(`~Changelog{duration_ms:${doc.duration_actual_ms},probes:${id},findings:${findings.size},fixes_applied:0}`);writeFileSync(reportPath,L.join('\n')+'\n');console.log(JSON.stringify({report:reportPath,json:jsonPath,probes:id,findings:findings.size,compilePass,compileFail,runtimeTests,runtimePass,runtimeFail,durationMs:doc.duration_actual_ms},null,2));
