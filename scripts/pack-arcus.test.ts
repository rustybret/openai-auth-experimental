import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('openai-auth arcus packaging & sync', () => {
  const repoRoot = resolve(__dirname, '..')

  it('defines Arcus v2, fork-sync, and core lifecycle command scripts in package.json', () => {
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
    expect(pkg.scripts['pack:arcus']).toBe('bash scripts/pack-arcus.sh')
    expect(pkg.scripts['publish:arcus']).toBe('bash scripts/publish-arcus.sh')
    expect(pkg.scripts['validate:arcus']).toBe('bash scripts/validate-arcus.sh')
    expect(pkg.scripts['sign:arcus']).toBe('bash scripts/sign-arcus.sh')
    expect(pkg.scripts['migrate:arcus']).toBe('bash scripts/migrate-arcus.sh')
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

  it('ships executable scripts for fork-sync and Arcus v2 pipeline', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync-exclusions'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'scripts/pack-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/publish-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/validate-arcus.sh'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'scripts/sign-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/migrate-arcus.sh'))).toBe(true)
    expect(
      existsSync(resolve(repoRoot, 'scripts/publish-arcus-artifact.sh')),
    ).toBe(false)
  })

  it('produces a valid Arcus v2 release envelope and legacy v1 manifest', () => {
    const v1Path = resolve(repoRoot, 'dist-arcus/arcus-manifest.json')
    if (existsSync(v1Path)) {
      const manifest = JSON.parse(readFileSync(v1Path, 'utf-8'))
      expect(manifest.harness).toBe('opencode')
      expect(manifest.plugin?.type).toBe('opencode-plugin')
      expect(manifest.plugin?.name).toBe('@cortexkit/opencode-openai-auth')
      expect(manifest.plugin?.entrypoints?.server).toBe('dist/index.js')
    }

    const v2Path = resolve(repoRoot, 'dist-arcus/releases/0.6.4.json')
    if (existsSync(v2Path)) {
      const envelope = JSON.parse(readFileSync(v2Path, 'utf-8'))
      expect(envelope.signed?.schema_version).toBe(2)
      expect(envelope.signed?.kind).toBe('release')
      expect(envelope.signed?.package_id).toBe('opencode-openai-auth')
      expect(envelope.signed?.version).toBe('0.6.4')
      expect(envelope.signed?.sequence).toBeGreaterThanOrEqual(1)
      expect(envelope.signatures?.length).toBeGreaterThanOrEqual(1)
      expect(Object.keys(envelope.signed?.targets || {})).toEqual([
        'darwin-arm64',
        'darwin-x64',
        'linux-arm64',
        'linux-x64',
        'windows-x64',
      ])
    }
  })
})
