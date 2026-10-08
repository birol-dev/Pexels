import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * electron-builder copies every package in `dependencies` into app.asar, and electron-vite
 * leaves exactly those packages external when it bundles main and preload. Renderer
 * packages are bundled by Vite, so they belong in `devDependencies`: listed as runtime
 * dependencies they ship twice.
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies?: Record<string, string>
}

/**
 * `import … from 'x'` and `export … from 'x'`, including clauses that span lines. Group 1
 * is set for `import type` / `export type` statements, which TypeScript erases. A clause
 * that only marks its names (`import { type A } from 'x'`) is kept as a bare import under
 * `verbatimModuleSyntax`, so it counts as a runtime import.
 */
const FROM_IMPORT =
  /^[ \t]*(?:import|export)\s+(type\s+(?!from\s*['"]))?(?:(?!\b(?:import|export)\b)[\w\s{},*$])*?\bfrom\s*['"]([^'"]+)['"]/gm
const SIDE_EFFECT_IMPORT = /^[ \t]*import\s*['"]([^'"]+)['"]/gm
const DYNAMIC_IMPORT = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function runtimeSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  for (const [, typeOnly, specifier] of source.matchAll(FROM_IMPORT)) {
    if (!typeOnly) specifiers.push(specifier)
  }
  for (const [, specifier] of source.matchAll(SIDE_EFFECT_IMPORT)) specifiers.push(specifier)
  for (const [, specifier] of source.matchAll(DYNAMIC_IMPORT)) specifiers.push(specifier)
  return specifiers
}

function packageName(specifier: string): string {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0]
}

const builtins = new Set(builtinModules)

/** Third-party packages a source file needs at runtime. Electron itself is the runtime. */
function externalPackages(source: string): string[] {
  return runtimeSpecifiers(source)
    .filter((specifier) => !/^(?:\.|\/|node:)/.test(specifier))
    .map(packageName)
    .filter((name) => name !== 'electron' && !builtins.has(name))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.[cm]?tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('runtime dependencies', () => {
  it('are exactly the packages main, preload and shared code import', () => {
    // src/shared is bundled into main, so its imports are main-process imports.
    const files = ['main', 'preload', 'shared'].flatMap((dir) => sourceFiles(join('src', dir)))
    assert.ok(files.length > 20, 'the source tree was found')

    const imported = new Set<string>()
    for (const file of files) {
      for (const name of externalPackages(readFileSync(file, 'utf8'))) imported.add(name)
    }

    assert.deepEqual(
      Object.keys(pkg.dependencies ?? {}).sort(),
      [...imported].sort(),
      'package.json "dependencies" must list what src/main, src/preload and src/shared import, ' +
        'and nothing else. Renderer and build packages go in "devDependencies".'
    )
  })

  it('reads imports the way the bundler does', () => {
    const source = `
import { app } from 'electron'
import { join } from 'path'
import { readFile } from 'node:fs/promises'
import { pipeline } from 'stream/promises'
import local from './local.ts'
import icon from '../../resources/icon.png?asset'
import type { Erased } from 'type-only-statement'
export type { AlsoErased } from 'type-only-reexport'
import { type Kept } from 'inline-type-clause'
import {
  first,
  second as renamed
} from 'multi-line'
import Default, * as everything from "double-quoted"
import '@scope/side-effect/register'
export * from 'star-reexport'
export { named } from '@scope/named-reexport/deep/path'
export type Shape = { from: string }
import after from 'after-a-type-alias'
const lazy = await import('dynamic-import')
const legacy = require('required')
// import commented from 'in-a-comment'
const text = "a sentence, not an import, from 'a-string'"
`
    assert.deepEqual(externalPackages(source).sort(), [
      '@scope/named-reexport',
      '@scope/side-effect',
      'after-a-type-alias',
      'double-quoted',
      'dynamic-import',
      'inline-type-clause',
      'multi-line',
      'required',
      'star-reexport'
    ])
  })
})
