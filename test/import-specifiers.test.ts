import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * The runner tests load main-process source straight into Node, whose ESM loader needs
 * a file extension on every relative import. Type-only imports are covered by
 * `verbatimModuleSyntax` in tsconfig.node.json; this covers the extensions.
 */
const RELATIVE_IMPORT = /from\s+'(\.{1,2}\/[^']+)'/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('main-process import specifiers', () => {
  it('end in .ts so Node can load the files without a bundler', () => {
    const files = [...sourceFiles(join('src', 'main')), ...sourceFiles(join('src', 'shared'))]
    assert.ok(files.length > 20, 'the source tree was found')

    for (const file of files) {
      // The Electron entry point is never loaded by tests and uses Vite's ?asset import.
      if (file.endsWith(join('src', 'main', 'index.ts'))) continue
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
        assert.ok(specifier.endsWith('.ts'), `${file}: import '${specifier}' needs a .ts extension`)
      }
    }
  })
})
