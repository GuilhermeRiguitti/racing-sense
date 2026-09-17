#!/usr/bin/env node
/**
 * Verificador de fronteiras.
 *
 * Roda no `pnpm check`. Existe para a arquitetura não depender de alguém
 * lembrar dela na revisão: violação quebra o build.
 *
 * Checa quatro coisas:
 *  1. as dependências declaradas no package.json respeitam o mapa de camadas;
 *  2. pacote puro não importa `node:*`;
 *  3. ninguém importa adapter fora do composition root;
 *  4. ninguém fura o encapsulamento com import profundo (`@telemetry/x/src/...`)
 *     nem com caminho relativo saindo do próprio pacote.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADAPTER_IMPORT_ALLOWLIST, LAYERS } from './architecture.config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKSPACE_DIRS = ['packages', 'apps'];
const IMPORT_PATTERN = /(?:from|import)\s+['"]([^'"]+)['"]/g;

const violations = [];

function report(file, message) {
  violations.push({ file, message });
}

function listSourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx|mts)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

function listWorkspaces() {
  const workspaces = [];
  for (const group of WORKSPACE_DIRS) {
    const groupDir = join(ROOT, group);
    for (const entry of readdirSync(groupDir)) {
      const dir = join(groupDir, entry);
      const manifestPath = join(dir, 'package.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        workspaces.push({ dir, manifest });
      } catch {
        // pasta sem package.json não é workspace
      }
    }
  }
  return workspaces;
}

/** "@ai-sdk/google/edge" -> "@ai-sdk/google"; "node:fs/promises" -> "node:fs/promises" */
function packageOf(specifier) {
  if (specifier.startsWith('node:')) return specifier;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function checkManifest(name, layer, manifest) {
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const toolingAllowlist = new Set(['typescript', 'vitest', 'tsx']);

  for (const dependency of declared) {
    // Pacote de tipos não é dependência de runtime: não move fronteira nenhuma.
    if (toolingAllowlist.has(dependency) || dependency.startsWith('@types/')) continue;

    if (dependency.startsWith('@telemetry/')) {
      if (!layer.packages.includes(dependency)) {
        report(
          `${name}/package.json`,
          `declara "${dependency}", que o mapa de camadas não permite para ${layer.role}`,
        );
      }
      continue;
    }

    if (layer.libs.length > 0 && !layer.libs.includes(dependency)) {
      report(
        `${name}/package.json`,
        `declara a lib "${dependency}"; ${layer.role} só pode usar: ${layer.libs.join(', ')}`,
      );
    } else if (layer.libs.length === 0) {
      report(
        `${name}/package.json`,
        `declara a lib "${dependency}", mas ${layer.role} tem que ser livre de dependências`,
      );
    }
  }
}

function checkImports(name, layer, dir) {
  const packageSrc = join(dir, 'src');

  for (const file of listSourceFiles(packageSrc)) {
    const relativeFile = relative(ROOT, file);
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];

      if (specifier.startsWith('.')) {
        // Subir de pasta dentro do próprio pacote é normal — o desktop tem
        // main/, preload/ e renderer/, e o tipo da ponte é compartilhado entre
        // eles. O que não pode é o caminho relativo escapar do pacote: isso é
        // dependência escondida, que não aparece no package.json.
        const target = resolve(dirname(file), specifier);
        if (!target.startsWith(packageSrc)) {
          report(
            relativeFile,
            `import relativo "${specifier}" sai do pacote; use o nome do pacote`,
          );
        }
        continue;
      }

      const pkg = packageOf(specifier);

      if (pkg.startsWith('node:') && !layer.builtins) {
        report(
          relativeFile,
          `usa "${specifier}"; ${layer.role} não pode tocar em API de plataforma`,
        );
        continue;
      }
      if (pkg.startsWith('node:')) continue;

      if (specifier.startsWith('@telemetry/') && specifier.includes('/src/')) {
        report(relativeFile, `import profundo "${specifier}"; use o ponto de entrada do pacote`);
      }

      if (pkg.startsWith('@telemetry/adapter-') && pkg !== name) {
        const allowed = ADAPTER_IMPORT_ALLOWLIST.some((entry) => relativeFile === entry);
        if (!allowed) {
          report(
            relativeFile,
            `importa o adapter "${pkg}"; só o composition root escolhe implementação`,
          );
        }
      }
    }
  }
}

for (const { dir, manifest } of listWorkspaces()) {
  const name = manifest.name;
  const layer = LAYERS[name];
  if (layer === undefined) {
    report(
      relative(ROOT, dir),
      `pacote "${name}" não está no mapa de camadas (scripts/architecture.config.mjs)`,
    );
    continue;
  }
  checkManifest(name, layer, manifest);
  checkImports(name, layer, dir);
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} violação(ões) de arquitetura:\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}`);
    console.error(`    ${violation.message}\n`);
  }
  console.error('Regras em docs/arquitetura.md e docs/adr/0009-arquitetura-hexagonal.md.');
  console.error(
    'Se a mudança é intencional, o mapa em scripts/architecture.config.mjs muda junto — com ADR.\n',
  );
  process.exit(1);
}

console.log('✓ fronteiras de arquitetura respeitadas');
