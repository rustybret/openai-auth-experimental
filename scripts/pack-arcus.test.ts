import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('openai-auth arcus packaging & sync', () => {
  const repoRoot = resolve(__dirname, '..')

  it('defines Arcus, fork-sync, and core lifecycle command scripts in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf-8'),
    )
    expect(pkg.scripts.build).toBeDefined()
    expect(pkg.scripts.test).toBeDefined()
    expect(pkg.scripts.typecheck).toBeDefined()
    expect(pkg.scripts['fork-sync']).toBe('bash scripts/fork-sync.sh')
    expect(pkg.scripts['sync:fork']).toBe('bash scripts/fork-sync.sh')
    expect(pkg.scripts['build:arcus']).toBe(
      'bun run build && bash scripts/pack-arcus.sh',
    )
    expect(pkg.scripts['package:arcus']).toBe('bash scripts/pack-arcus.sh')
    expect(pkg.scripts['publish:arcus']).toBe(
      'bash scripts/publish-arcus-artifact.sh',
    )
  })

  it('removes upstream CortexKit-specific publish and package dry-run scripts', () => {
    const rootPkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf-8'),
    )
    const opencodePkg = JSON.parse(
      readFileSync(
        resolve(repoRoot, 'packages/opencode/package.json'),
        'utf-8',
      ),
    )
    const piPkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'packages/pi/package.json'), 'utf-8'),
    )

    expect(rootPkg.scripts['pack:opencode:dry']).toBeUndefined()
    expect(rootPkg.scripts['pack:pi:dry']).toBeUndefined()
    expect(rootPkg.scripts.prepublishOnly).toBeUndefined()
    expect(opencodePkg.scripts.prepublishOnly).toBeUndefined()
    expect(piPkg.scripts.prepublishOnly).toBeUndefined()
  })

  it('ships executable scripts for fork-sync, pack-arcus, and publish-arcus', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync-exclusions'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'scripts/pack-arcus.sh'))).toBe(true)
    expect(
      existsSync(resolve(repoRoot, 'scripts/publish-arcus-artifact.sh')),
    ).toBe(true)
  })

  it('produces a valid Arcus manifest structure', () => {
    const manifestPath = resolve(repoRoot, 'dist-arcus/arcus-manifest.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      expect(manifest.harness).toBe('opencode')
      expect(manifest.plugin?.type).toBe('opencode-plugin')
      expect(manifest.plugin?.name).toBe('@cortexkit/opencode-openai-auth')
      expect(manifest.plugin?.entrypoints?.server).toBe('dist/index.js')
    }
  })
})
