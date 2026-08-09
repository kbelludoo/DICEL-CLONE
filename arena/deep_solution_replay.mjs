import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdirSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const[k,...v]=x.split('=');return[k.replace(/^--/,''),v.join('=')]}));
const durationMs=Number(args['duration-ms']??600000),maxProbes=Number(args['max-probes']??0),delayMs=Number(args['delay-ms']??20),seedInitial=Number(args.seed??260830);
const root=resolve(args.latest??'/tmp/dicel-next'),out=resolve(args.output??'arena'),worker=resolve(args.worker??'arena/latest_compiler_worker.mjs');
const report=resolve(out,args.report??'ARENA_DEEP_25M_REPORT.dicel'),jsonFile=resolve(out,args.json??'ARENA_DEEP_25M_RESULTS.json'),progress=resolve(out,args.progress??'evidence/deep_25m_progress.log');mkdirSync(resolve(out,'evidence'),{recursive:true});rmSync(progress,{force:true});
let seed=seedInitial>>>0;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};const pick=x=>x[Math.floor(rnd()*x.length)];const n=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const fn=(ret,body,params='')=>`@deep_probe:1.0.0\nfn$test(${params})->${ret} {\n ${body}\n}\n`;const exp=x=>Object.is(x,-0)?{runtimeExpected:0,runtimeExpectedSpecial:'-0'}:{runtimeExpected:x};
function gen(id){const family=pick(['P6_PRECEDENCE','P7_CALLS','P8_TYPES','P9_SCOPE','P10_RUNTIME']);const a=n(1,50),b=n(1,50),c=n(1,20),d=n(1,8);
 if(family==='P6_PRECEDENCE'){const k=pick(['sub4','div4','arith','shift_bit','bit_chain','logic','paren']);
  if(k==='sub4')return{id,family,name:k,source:fn('num',`return ${a}-${b}-${c}-${d}`),shouldReject:false,...exp(a-b-c-d)};
  if(k==='div4')return{id,family,name:k,source:fn('num',`return ${a} / ${b} / ${c} / ${d}`),shouldReject:false,...exp(a/b/c/d)};
  if(k==='arith')return{id,family,name:k,source:fn('num',`return ${a}+${b}*${c}-${d}`),shouldReject:false,...exp(a+b*c-d)};
  if(k==='shift_bit')return{id,family,name:k,source:fn('num',`return ${a}<<${d}&${b}`),shouldReject:false,...exp((a<<d)&b)};
  if(k==='bit_chain')return{id,family,name:k,source:fn('num',`return ${a}|${b}^${c}&${d}`),shouldReject:false,...exp(a|(b^(c&d)))};
  if(k==='logic')return{id,family,name:k,source:fn('bool',`return ${a}==${b}||${c}==${d}`),shouldReject:false,...exp(a===b||c===d)};
  return{id,family,name:k,source:fn('num',`return (${a}+${b})*(${c}-${d})`),shouldReject:false,...exp((a+b)*(c-d))};}
 if(family==='P7_CALLS'){const k=pick(['valid_call','nested_call','wrong_arity_zero','wrong_arity_two','undefined_method','duplicate_params']);
  const prefix=`fn$inc(x:num)->num {\n return x+1\n}\n`;
  if(k==='valid_call')return{id,family,name:k,source:prefix+fn('num',`return inc(${a})`),shouldReject:false,...exp(a+1)};
  if(k==='nested_call')return{id,family,name:k,source:prefix+fn('num',`return inc(inc(${a}))`),shouldReject:false,...exp(a+2)};
  if(k==='wrong_arity_zero')return{id,family,name:k,source:prefix+fn('num','return inc()'),shouldReject:true};
  if(k==='wrong_arity_two')return{id,family,name:k,source:prefix+fn('num',`return inc(${a},${b})`),shouldReject:true};
  if(k==='undefined_method')return{id,family,name:k,source:fn('num','return ghost.run()'),shouldReject:true};
  return{id,family,name:k,source:fn('num','return x','x:num,x:num'),shouldReject:true};}
 if(family==='P8_TYPES'){const k=pick(['bool_arithmetic','num_logical','string_plus','relational','null_num','valid_string']);
  if(k==='bool_arithmetic')return{id,family,name:k,source:fn('bool','return true+1'),shouldReject:true};
  if(k==='num_logical')return{id,family,name:k,source:fn('bool','return 1&&2'),shouldReject:true};
  if(k==='string_plus')return{id,family,name:k,source:fn('str','return "x"+"y"'),shouldReject:true};
  if(k==='relational')return{id,family,name:k,source:fn('bool',`return ${a}<${b}`),shouldReject:false,...exp(a<b)};
  if(k==='null_num')return{id,family,name:k,source:fn('num','return null'),shouldReject:true};
  return{id,family,name:k,source:fn('str','return "ok"'),shouldReject:false,...exp('ok')};}
 if(family==='P9_SCOPE'){const k=pick(['duplicate_let','use_before_decl','assign_undeclared','duplicate_field','name_collision','param_shadow','valid_assign']);
  if(k==='duplicate_let')return{id,family,name:k,source:fn('num',`let$x = ${a}\n let$x = ${b}\n return x`),shouldReject:true};
  if(k==='use_before_decl')return{id,family,name:k,source:fn('num',`let$y = x+1\n let$x = ${a}\n return y`),shouldReject:true};
  if(k==='assign_undeclared')return{id,family,name:k,source:fn('num',`x = ${a}\n return x`),shouldReject:true};
  if(k==='duplicate_field')return{id,family,name:k,source:`struct Box {\n value:num\n value:str\n}\n`+fn('num',`return ${a}`),shouldReject:true};
  if(k==='name_collision')return{id,family,name:k,source:`struct test {\n value:num\n}\n`+fn('num',`return ${a}`),shouldReject:false,...exp(a)};
  if(k==='param_shadow')return{id,family,name:k,source:fn('num',`let$x = ${a}\n return x`,'x:num'),shouldReject:true};
  return{id,family,name:k,source:fn('num',`let$x = ${a}\n x = x+${b}\n return x`),shouldReject:false,...exp(a+b)};}
 const k=pick(['math_random','date_now','division_zero','huge_integer','unknown_method','nan_global','negative_zero','regex_exec']);
 if(k==='math_random')return{id,family,name:k,source:fn('num','return Math.random()'),shouldReject:true};
 if(k==='date_now')return{id,family,name:k,source:fn('num','return Date.now()'),shouldReject:true};
 if(k==='division_zero')return{id,family,name:k,source:fn('num',`return ${a} / 0`),shouldReject:true};
 if(k==='huge_integer')return{id,family,name:k,source:fn('num','return 9007199254740993'),shouldReject:true};
 if(k==='unknown_method')return{id,family,name:k,source:fn('num','return ghost.run()'),shouldReject:true};
 if(k==='nan_global')return{id,family,name:k,source:fn('num','return NaN'),shouldReject:true};
 if(k==='negative_zero')return{id,family,name:k,source:fn('num','return -0'),shouldReject:false,...exp(-0)};
 return{id,family,name:k,source:fn('any','return /a/.exec("a")'),shouldReject:false};}
function normal(x=''){return String(x).replace(/\b\d+(?:\.\d+)?\b/g,'N').slice(0,500)}
function classify(p,r){const diags=(r.diagnostics??[]);if(r.compile&&r.runtime_equal===false)return'runtime_divergence';if(r.compile&&p.shouldReject)return'invalid_program_accepted';if(!r.compile&&!p.shouldReject)return'valid_program_rejected';if(r.compile&&diags.length)return'accepted_with_diagnostics';if(!r.compile&&p.shouldReject)return'controlled_rejection';return'compile_pass'}
const wp=spawn('node',[worker],{env:{...process.env,DICEL_LATEST_ROOT:root},stdio:['pipe','pipe','pipe']});const rl=createInterface({input:wp.stdout,crlfDelay:Infinity});const pend=new Map();rl.on('line',l=>{try{const r=JSON.parse(l),f=pend.get(r.id);if(f){pend.delete(r.id);f(r)}}catch{}});let werr='';wp.stderr.on('data',d=>werr+=d);const compile=p=>new Promise(res=>{pend.set(p.id,res);wp.stdin.write(JSON.stringify(p)+'\n')});
const start=Date.now();let id=0,cp=0,cf=0,rt=0,rp=0,rf=0;const fam={},cat={},phase={},findings=new Map();while(Date.now()-start<durationMs&&(maxProbes<=0||id<maxProbes)){id++;const p=gen(id),r=await compile(p),c=classify(p,r);fam[p.family]=(fam[p.family]??0)+1;cat[c]=(cat[c]??0)+1;phase[r.phase]=(phase[r.phase]??0)+1;if(r.compile)cp++;else cf++;if(r.runtime!==undefined){rt++;if(r.runtime_equal)rp++;else rf++}if(!['compile_pass','controlled_rejection'].includes(c)){const sig=`${c}|${p.family}|${p.name}|${normal(JSON.stringify(r.diagnostics??r.parse_errors??r.runtime_error??''))}`,h=createHash('sha256').update(sig).digest('hex').slice(0,16);if(!findings.has(h))findings.set(h,{id:`DEEP-GAP-${String(findings.size+1).padStart(4,'0')}`,hash:h,category:c,family:p.family,name:p.name,source:p.source,result:r,count:0});findings.get(h).count++}if(id%1000===0)appendFileSync(progress,`${new Date().toISOString()} probes=${id} findings=${findings.size} runtime_fail=${rf}\n`);if(delayMs)await new Promise(x=>setTimeout(x,delayMs));}
wp.stdin.end();await new Promise(x=>wp.on('exit',x));const doc={version:1,upstream_commit:'70611fb7d720d6c8f2837b6f119564d0a5535c83',seed:seedInitial,duration_requested_ms:durationMs,duration_actual_ms:Date.now()-start,probes:id,compile_pass:cp,compile_fail:cf,runtime_tests:rt,runtime_pass:rp,runtime_fail:rf,family_stats:fam,phase_stats:phase,category_stats:cat,unique_findings:[...findings.values()],worker_stderr:werr};writeFileSync(jsonFile,JSON.stringify(doc,null,2)+'\n');const e=x=>JSON.stringify(String(x)),L=[];L.push(`@DICE-L:arena-deep-stress:1.0.0;upstream=70611fb7;duration_ms=${doc.duration_actual_ms};status=completed`);L.push(`~StressSummary{probes:${id},compile_pass:${cp},compile_fail:${cf},runtime_tests:${rt},runtime_pass:${rp},runtime_fail:${rf},unique_findings:${findings.size},fixes_applied:0}`);for(const[k,v]of Object.entries(fam).sort())L.push(`~PhaseCount{phase:${e(k)},count:${v}}`);for(const[k,v]of Object.entries(cat).sort())L.push(`~CategoryCount{category:${e(k)},count:${v}}`);for(const f of findings.values())L.push(`~Finding{id:${e(f.id)},signature_hash:${e(f.hash)},category:${e(f.category)},family:${e(f.family)},case_name:${e(f.name)},count:${f.count},source_sha256:${e(createHash('sha256').update(f.source).digest('hex'))},diagnostic:${e(normal(JSON.stringify(f.result.diagnostics??f.result.parse_errors??f.result.runtime_error??'')))},status:"reported_unfixed"}`);L.push(`~Changelog{duration_ms:${doc.duration_actual_ms},probes:${id},findings:${findings.size},fixes_applied:0}`);writeFileSync(report,L.join('\n')+'\n');console.log(JSON.stringify({report,json:jsonFile,probes:id,findings:findings.size,compilePass:cp,compileFail:cf,runtimeTests:rt,runtimePass:rp,runtimeFail:rf,durationMs:doc.duration_actual_ms},null,2));
