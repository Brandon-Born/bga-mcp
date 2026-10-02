import ts from 'typescript';

import { GateReport } from './gate.js';

/** Conservative structural guard, paired with actual installed-process fault tests. */
export function verifyCliErrorBoundary(source: string): GateReport {
  const report = new GateReport();
  const parsed = ts.createSourceFile('cli-runner.ts', source, ts.ScriptTarget.Latest, true);
  const runner = parsed.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'runCli',
  );
  const statements: readonly ts.Statement[] = runner?.body?.statements ?? [];
  const boundary = statements.find((statement): statement is ts.TryStatement =>
    ts.isTryStatement(statement),
  );
  report.require(boundary?.catchClause !== undefined, 'CLI execution lacks its error boundary');
  const inert = (node: ts.Expression | undefined): boolean =>
    node === undefined ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword;
  for (const statement of statements) {
    if (statement === boundary) continue;
    report.require(
      ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.every((declaration) =>
          inert(declaration.initializer),
        ),
      'CLI executable operation outside the error boundary',
    );
  }
  if (boundary !== undefined) {
    const body = boundary.tryBlock.getText(parsed);
    report.require(
      body.includes('parseCliArguments(') &&
        body.includes('createServerWithPolicy(') &&
        body.includes('checkStudioSetup(') &&
        body.includes('serveStdio(') &&
        body.includes('server.connect('),
      'CLI error boundary does not enclose every startup/preflight path',
    );
    const caught = boundary.catchClause?.getText(parsed) ?? '';
    report.require(caught.includes('report('), 'CLI failure bypasses the safe diagnostic writer');
    const visit = (node: ts.Node): void => {
      report.require(!ts.isThrowStatement(node), 'CLI failure rethrows outside the safe boundary');
      ts.forEachChild(node, visit);
    };
    if (boundary.catchClause !== undefined) visit(boundary.catchClause);
  }
  report.require(
    source.includes('formatErrorLog('),
    'CLI diagnostic writer bypasses error collapse',
  );
  return report;
}

/** Entrypoints must load even their dependencies inside the terminal fallback. */
export function verifyCliEntryBoundary(source: string): GateReport {
  const report = new GateReport();
  const parsed = ts.createSourceFile('cli.ts', source, ts.ScriptTarget.Latest, true);
  const boundary = parsed.statements[0];
  report.require(
    parsed.statements.length === 1 &&
      boundary !== undefined &&
      ts.isTryStatement(boundary) &&
      boundary.catchClause !== undefined,
    'CLI entrypoint executes outside its terminal boundary',
  );
  if (boundary !== undefined && ts.isTryStatement(boundary)) {
    const text = boundary.tryBlock.getText(parsed);
    report.require(
      text.includes("import('./cli-runner.js')"),
      'CLI implementation loads outside the terminal boundary',
    );
    report.require(
      text.includes('process.exitCode === undefined || process.exitCode === 0'),
      'CLI entrypoint overwrites asynchronous failure status',
    );
    const caught = boundary.catchClause?.getText(parsed) ?? '';
    report.require(
      caught.includes('[internal.unexpected]') &&
        caught.includes('process.exitCode = 1') &&
        !caught.includes('throw '),
      'CLI terminal fallback does not collapse and terminate failures',
    );
  }
  return report;
}
