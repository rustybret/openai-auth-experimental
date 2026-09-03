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
      'bun run build && bash scripts/pack-arcus.sh',
    )
    expect(pkg.scripts['package:arcus']).toBe('bash scripts/pack-arcus.sh')
    expect(pkg.scripts['pack:arcus']).toBe('bash scripts/pack-arcus.sh')
    expect(pkg.scripts['publish:arcus']).toBe('bash scripts/publish-arcus.sh')
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
    expect(existsSync(resolve(repoRoot, 'scripts/arcus-pipeline.sh'))).toBe(
      true,
    )
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

  it('enforces Arcus v2 alignment across scripts (sequence auto-allocation, sync-index, fail-closed validation)', () => {
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
    expect(publishScript).toContain('sync-index --write')

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

  it('wires Arcus scripts as symlinks to submodules/arcus without vendoring drift', () => {
    expect(existsSync(resolve(repoRoot, 'setup.sh'))).toBe(true)
    expect(existsSync(resolve(repoRoot, '.gitmodules'))).toBe(true)

    const gitmodules = readFileSync(resolve(repoRoot, '.gitmodules'), 'utf-8')
    expect(gitmodules).toContain('submodules/arcus')

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
      expect(target).toBe(`../submodules/arcus/skills/scripts/${script}`)
      expect(existsSync(resolve(repoRoot, 'scripts', target))).toBe(true)
    }
  })
})
