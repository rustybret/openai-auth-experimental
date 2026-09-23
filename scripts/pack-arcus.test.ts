import { describe, expect, it } from 'bun:test'
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'

describe('openai-auth arcus packaging & sync', () => {
  const repoRoot = resolve(__dirname, '..')

  it('defines Arcus v2, fork-sync, and core lifecycle command scripts in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf-8'),
    )
    expect(pkg.scripts.build).toBeDefined()
    expect(pkg.scripts.setup).toBe('bash setup.sh')
    expect(pkg.scripts.test).toBeDefined()
    expect(pkg.scripts.typecheck).toBeDefined()
    expect(pkg.scripts['fork-sync']).toBe('bash scripts/fork-sync.sh')
    expect(pkg.scripts['sync:fork']).toBe('bash scripts/fork-sync.sh')
    expect(pkg.scripts['build:arcus']).toBe(
      'bun run build && bash scripts/pack-all-arcus.sh',
    )
    expect(pkg.scripts['package:arcus']).toBe('bash scripts/pack-all-arcus.sh')
    expect(pkg.scripts['pack:arcus']).toBe('bash scripts/pack-all-arcus.sh')
    expect(pkg.scripts['pack:opencode']).toBe(
      'bash scripts/pack-opencode-arcus.sh',
    )
    expect(pkg.scripts['pack:pi']).toBe('bash scripts/pack-pi-arcus.sh')
    expect(pkg.scripts['publish:arcus']).toBe(
      'bash scripts/publish-all-arcus.sh',
    )
    expect(pkg.scripts['publish:suite']).toBe(
      'bash scripts/publish-all-arcus.sh',
    )
    expect(pkg.scripts['validate:arcus']).toBe('bash scripts/validate-arcus.sh')
    expect(pkg.scripts['sign:arcus']).toBe('bash scripts/sign-arcus.sh')
    expect(pkg.scripts['migrate:arcus']).toBe('bash scripts/migrate-arcus.sh')
    expect(pkg.scripts['pipeline:arcus']).toBe('bash scripts/arcus-pipeline.sh')
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

  it('ships executable scripts for fork-sync and Arcus v3 suite packaging', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/fork-sync-exclusions'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'scripts/pack-all-arcus.sh'))).toBe(
      true,
    )
    expect(
      existsSync(resolve(repoRoot, 'scripts/pack-opencode-arcus.sh')),
    ).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/pack-pi-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/publish-all-arcus.sh'))).toBe(
      true,
    )
    expect(
      existsSync(resolve(repoRoot, 'scripts/lib/verify-release-set.mjs')),
    ).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/pack-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/publish-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/validate-arcus.sh'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'scripts/sign-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/migrate-arcus.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'scripts/arcus-pipeline.sh'))).toBe(
      true,
    )
    expect(
      existsSync(resolve(repoRoot, 'scripts/publish-arcus-artifact.sh')),
    ).toBe(false)
  })

  it('produces valid Arcus release envelopes under tidy dist/<version>/<sequence>/ hierarchy', () => {
    const opencodeEnv = resolve(
      repoRoot,
      'dist/0.9.0-2/7/opencode-openai-auth/releases/opencode-openai-auth-0.9.0-2-7.json',
    )
    if (existsSync(opencodeEnv)) {
      const envelope = JSON.parse(readFileSync(opencodeEnv, 'utf-8'))
      expect(envelope.signed?.kind).toBe('release')
      expect(envelope.signed?.package_id).toBe('opencode-openai-auth')
      expect(envelope.signed?.sequence).toBe(7)
      expect(envelope.signatures?.length).toBeGreaterThanOrEqual(1)
      expect(Object.keys(envelope.signed?.targets || {})).toEqual([
        'darwin-arm64',
        'darwin-x64',
        'linux-arm64',
        'linux-x64',
        'windows-x64',
      ])
    }

    const piEnv = resolve(
      repoRoot,
      'dist/0.9.0-2/7/pi-openai-auth/releases/pi-openai-auth-0.9.0-2-7.json',
    )
    if (existsSync(piEnv)) {
      const envelope = JSON.parse(readFileSync(piEnv, 'utf-8'))
      expect(envelope.signed?.kind).toBe('release')
      expect(envelope.signed?.package_id).toBe('pi-openai-auth')
      expect(envelope.signed?.sequence).toBe(7)
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

  it('enforces Arcus v3 alignment across scripts (sequence auto-allocation, submission bundle, fail-closed validation)', () => {
    const packScript = readFileSync(
      resolve(repoRoot, 'scripts/pack-arcus.sh'),
      'utf-8',
    )
    expect(packScript).toContain('allocate-sequence')
    expect(packScript).toContain('archive_sha256')
    expect(packScript).toContain('content_source_sha256')
    expect(packScript).toContain('tree_signature_sha256')
    expect(packScript).toContain('digest collision')

    const publishScript = readFileSync(
      resolve(repoRoot, 'scripts/publish-arcus.sh'),
      'utf-8',
    )
    expect(publishScript).toContain('submission bundle')

    const validateScript = readFileSync(
      resolve(repoRoot, 'scripts/validate-arcus.sh'),
      'utf-8',
    )
    expect(validateScript).toContain('refusing --allow-placeholders')

    const signScript = readFileSync(
      resolve(repoRoot, 'scripts/sign-arcus.sh'),
      'utf-8',
    )
    expect(signScript).toContain('auto-allocate')

    const pipelineScript = readFileSync(
      resolve(repoRoot, 'scripts/arcus-pipeline.sh'),
      'utf-8',
    )
    expect(pipelineScript).toContain('pack')
    expect(pipelineScript).toContain('sign')
    expect(pipelineScript).toContain('validate')
    expect(pipelineScript).toContain('publish')
    expect(pipelineScript).toContain('migrate')
  })

  it('wires Arcus scripts as symlinks to packages/arcus/toolchain without submodule dependencies', () => {
    expect(existsSync(resolve(repoRoot, 'setup.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, 'packages/arcus/bootstrap.sh'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, 'packages/arcus/arcus.json'))).toBe(
      true,
    )
    expect(existsSync(resolve(repoRoot, '.gitmodules'))).toBe(false)

    const arcusScripts = [
      'pack-arcus.sh',
      'sign-arcus.sh',
      'validate-arcus.sh',
      'publish-arcus.sh',
      'migrate-arcus.sh',
      'arcus-pipeline.sh',
    ]

    for (const script of arcusScripts) {
      const scriptPath = resolve(repoRoot, 'scripts', script)
      expect(existsSync(scriptPath)).toBe(true)
      const stat = lstatSync(scriptPath)
      expect(stat.isSymbolicLink()).toBe(true)
      const target = readlinkSync(scriptPath)
      expect(target).toBe(`../packages/arcus/toolchain/scripts/${script}`)
      expect(existsSync(resolve(repoRoot, 'scripts', target))).toBe(true)
    }
  })
})
