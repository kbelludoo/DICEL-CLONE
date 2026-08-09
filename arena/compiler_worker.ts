import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

function normalizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

async function main() {
  const compilerRoot = process.env.DICEL_COMPILER_ROOT
  const typescriptModule = process.env.TYPESCRIPT_MODULE
  if (!compilerRoot || !typescriptModule) throw new Error('DICEL_COMPILER_ROOT_and_TYPESCRIPT_MODULE_required')
  const { parseDice } = await import(pathToFileURL(`${compilerRoot}/src/core/exec-parser.ts`).href)
  const { DicelTypechecker } = await import(pathToFileURL(`${compilerRoot}/src/typechecker.ts`).href)
  const { TypeScriptEmitter } = await import(pathToFileURL(`${compilerRoot}/src/emitter.ts`).href)
  const ts = await import(pathToFileURL(typescriptModule).href)

  async function handle(probe: any) {
    const start = performance.now()
    let ast: any
    try {
      ast = parseDice(probe.source)
    } catch (error) {
      return { id: probe.id, phase: 'parser', compile: false, error: normalizeError(error), elapsed_ms: performance.now() - start }
    }
    let checked: any
    try {
      checked = new DicelTypechecker(ast, `<arena:${probe.id}>`).check()
    } catch (error) {
      return { id: probe.id, phase: 'typechecker_exception', compile: false, error: normalizeError(error), elapsed_ms: performance.now() - start }
    }
    if (!checked.success) {
      return { id: probe.id, phase: 'typechecker', compile: false, errors: checked.errors, error: JSON.stringify(checked.errors), elapsed_ms: performance.now() - start }
    }
    let output: string
    try {
      output = new TypeScriptEmitter(ast).visitProgram(ast)
    } catch (error) {
      return { id: probe.id, phase: 'emitter', compile: false, error: normalizeError(error), elapsed_ms: performance.now() - start }
    }
    const result: any = {
      id: probe.id, phase: 'compiled', compile: true,
      output_sha256: createHash('sha256').update(output).digest('hex'),
      output_bytes: Buffer.byteLength(output), elapsed_ms: performance.now() - start,
    }
    if (probe.runtimeExpected !== undefined || probe.runtimeExpectedSpecial !== undefined) {
      try {
        const expected = probe.runtimeExpectedSpecial === '-0' ? -0 : probe.runtimeExpected
        const js = ts.transpileModule(output, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
        const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}#${probe.id}`
        const mod: any = await import(url)
        const actual = await mod.test(...(probe.args ?? []))
        result.runtime = true
        result.runtime_actual = actual
        result.runtime_expected = expected
        result.runtime_expected_special = probe.runtimeExpectedSpecial
        result.runtime_equal = Object.is(actual, expected)
      } catch (error) {
        result.runtime = false
        result.runtime_equal = false
        result.runtime_error = normalizeError(error)
      }
    }
    return result
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const probe = JSON.parse(line)
      const result = await handle(probe)
      process.stdout.write(JSON.stringify(result) + '\n')
    } catch (error) {
      process.stdout.write(JSON.stringify({ id: null, phase: 'worker', compile: false, error: normalizeError(error) }) + '\n')
    }
  }
}

main().catch(error => { console.error(normalizeError(error)); process.exitCode = 1 })
