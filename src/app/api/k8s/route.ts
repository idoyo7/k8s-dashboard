import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const K8S_SPC_PATH = join(homedir(), '.steampipe', 'config', 'kubernetes.spc');

// GET: list registered K8s contexts
export async function GET() {
  try {
    // Get available kubectl contexts
    const contextsRaw = execFileSync('kubectl', ['config', 'get-contexts', '-o', 'name'], {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();
    const contexts = contextsRaw ? contextsRaw.split('\n').map(c => c.trim()).filter(Boolean) : [];

    // Get current context
    let currentContext = '';
    try {
      currentContext = execFileSync('kubectl', ['config', 'current-context'], {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {}

    // Check which are registered in Steampipe
    let spcContent = '';
    try { spcContent = readFileSync(K8S_SPC_PATH, 'utf-8'); } catch {}

    const registered = contexts.map(name => ({
      name,
      isCurrent: name === currentContext,
      isRegistered: spcContent.includes(`"${name}"`),
    }));

    return NextResponse.json({ contexts: registered, currentContext });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list contexts';
    return NextResponse.json({ contexts: [], error: message });
  }
}

// POST: register a kubeconfig context with Steampipe
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contextName } = body as { contextName: string };

    if (!contextName || typeof contextName !== 'string') {
      return NextResponse.json({ error: 'contextName is required' }, { status: 400 });
    }

    // Sanitize context name for use as connection name
    const safeName = contextName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

    // Verify context exists
    try {
      execFileSync('kubectl', ['config', 'get-contexts', contextName, '-o', 'name'], {
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch {
      return NextResponse.json({ error: `Context "${contextName}" not found in kubeconfig` }, { status: 404 });
    }

    // Ensure ~/.steampipe/config/ directory exists
    const spcDir = dirname(K8S_SPC_PATH);
    if (!existsSync(spcDir)) {
      mkdirSync(spcDir, { recursive: true });
    }

    // Read existing kubernetes.spc or start empty
    let spcContent = '';
    try { spcContent = readFileSync(K8S_SPC_PATH, 'utf-8'); } catch {}

    const connectionName = `kubernetes_${safeName}`;
    const connectionBlock = `\nconnection "${connectionName}" {\n  plugin         = "kubernetes"\n  config_context = "${contextName}"\n  custom_resource_tables = ["*"]\n}\n`;

    let needsRestart = false;
    if (!spcContent.includes(`connection "${connectionName}"`)) {
      spcContent += connectionBlock;

      // Add aggregator if not present
      if (!spcContent.includes('type        = "aggregator"') && !spcContent.includes('type = "aggregator"')) {
        spcContent += `\nconnection "kubernetes" {\n  plugin      = "kubernetes"\n  type        = "aggregator"\n  connections = ["kubernetes_*"]\n}\n`;
      }

      writeFileSync(K8S_SPC_PATH, spcContent, 'utf-8');
      needsRestart = true;
    }

    return NextResponse.json({
      message: `Context "${contextName}" registered as ${connectionName}`,
      connectionName,
      needsRestart,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
