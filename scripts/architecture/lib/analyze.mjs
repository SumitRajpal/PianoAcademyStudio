/**
 * Reads one source file and extracts what the graph needs:
 * imports, rendered components, exports, native-module links, worklet use,
 * and the `@purpose` / `@thread` header tags.
 * Uses TypeScript's parser only (no type checker), so it is fast.
 */

import ts from 'typescript';
import { NATIVE_EXT, THREADS } from './constants.mjs';

export { CODE_EXT, NATIVE_EXT, THREADS } from './constants.mjs';

const UI_THREAD_HOOKS = new Set([
  'useAnimatedStyle',
  'useAnimatedProps',
  'useDerivedValue',
  'useAnimatedReaction',
  'useFrameCallback',
  'useAnimatedScrollHandler',
]);

export function analyzeFile(path, text) {
  if (NATIVE_EXT.test(path)) {
    return analyzeNative(path, text);
  }
  return analyzeCode(path, text);
}

function scriptKindFor(path) {
  if (path.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (/\.[cm]?ts$/.test(path)) {
    return ts.ScriptKind.TS;
  }
  if (path.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.JS;
}

/** Leading comments at the top of a file → { purpose, thread }. */
export function parseHeader(text) {
  const start = text.startsWith('#!') ? text.indexOf('\n') + 1 : 0;
  const ranges = ts.getLeadingCommentRanges(text, start) || [];
  const raw = ranges.map(r => text.slice(r.pos, r.end)).join('\n');
  const clean = raw
    .split('\n')
    .map(line =>
      line
        .replace(/^\s*\/\*\*?/, '')
        .replace(/\*\/\s*$/, '')
        .replace(/^\s*(?:\*|\/\/)\s?/, ''),
    )
    .join('\n');
  const purposeMatch = /@purpose\s+([\s\S]*?)(?=\n\s*@\w|$)/.exec(clean);
  const purpose = purposeMatch ? purposeMatch[1].replace(/\s+/g, ' ').trim() : '';
  const threadMatch = new RegExp(`@thread\\s+(${THREADS.join('|')})\\b`).exec(clean);
  return { purpose: purpose || null, thread: threadMatch ? threadMatch[1] : null };
}

function hasModifier(node, kind) {
  return Boolean(
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === kind),
  );
}

function jsxBase(tagName) {
  let node = tagName;
  while (ts.isPropertyAccessExpression(node)) {
    node = node.expression;
  }
  if (ts.isIdentifier(node) && /^[A-Z]/.test(node.text)) {
    return node.text;
  }
  return null;
}

function requireBindingNames(call) {
  const parent = call.parent;
  if (parent && ts.isVariableDeclaration(parent)) {
    if (ts.isIdentifier(parent.name)) {
      return [parent.name.text];
    }
    if (ts.isObjectBindingPattern(parent.name)) {
      return parent.name.elements
        .map(el => (ts.isIdentifier(el.name) ? el.name.text : null))
        .filter(Boolean);
    }
  }
  return [];
}

export function analyzeCode(path, text) {
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(path),
  );
  const imports = [];
  const jsxTags = new Set();
  const exportNames = new Set();
  const nativeSpecs = new Set();
  const nativeUses = new Set();
  let hasWorklets = false;

  const lineOf = node => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const collectDeclarationExport = node => {
    if (node.parent !== sf || !hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
      return;
    }
    if (hasModifier(node, ts.SyntaxKind.DefaultKeyword)) {
      exportNames.add('default');
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          exportNames.add(decl.name.text);
        }
      }
    } else if (node.name && ts.isIdentifier(node.name)) {
      exportNames.add(node.name.text);
    }
  };

  const visit = node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = [];
      let typeOnly = Boolean(clause?.isTypeOnly);
      if (clause?.name) {
        names.push(clause.name.text);
      }
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        names.push(bindings.name.text);
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          names.push(el.name.text);
        }
        if (
          !clause.name &&
          bindings.elements.length > 0 &&
          bindings.elements.every(el => el.isTypeOnly)
        ) {
          typeOnly = true;
        }
      }
      imports.push({
        spec: node.moduleSpecifier.text,
        kind: 'import',
        typeOnly,
        names,
        line: lineOf(node),
      });
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({
          spec: node.moduleSpecifier.text,
          kind: 'export',
          typeOnly: Boolean(node.isTypeOnly),
          names: [],
          line: lineOf(node),
        });
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) {
          exportNames.add(el.name.text);
        }
      } else if (!node.exportClause) {
        exportNames.add('*');
      }
    } else if (ts.isExportAssignment(node)) {
      exportNames.add('default');
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const arg0 = node.arguments[0];
      const literalArg = arg0 && ts.isStringLiteralLike(arg0) ? arg0.text : null;
      if (ts.isIdentifier(callee) && callee.text === 'require' && literalArg !== null) {
        imports.push({
          spec: literalArg,
          kind: 'require',
          typeOnly: false,
          names: requireBindingNames(node),
          line: lineOf(node),
        });
      } else if (callee.kind === ts.SyntaxKind.ImportKeyword && literalArg !== null) {
        imports.push({
          spec: literalArg,
          kind: 'dynamic',
          typeOnly: false,
          names: [],
          line: lineOf(node),
        });
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'TurboModuleRegistry' &&
        /^get(?:Enforcing)?$/.test(callee.name.text) &&
        literalArg !== null
      ) {
        nativeSpecs.add(literalArg);
      } else if (ts.isIdentifier(callee) && UI_THREAD_HOOKS.has(callee.text)) {
        hasWorklets = true;
      }
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'NativeModules'
    ) {
      nativeUses.add(node.name.text);
    } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const base = jsxBase(node.tagName);
      if (base) {
        jsxTags.add(base);
      }
    } else if (
      ts.isExpressionStatement(node) &&
      ts.isStringLiteral(node.expression) &&
      node.expression.text === 'worklet'
    ) {
      hasWorklets = true;
    }
    collectDeclarationExport(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const header = parseHeader(text);
  return {
    lang: 'code',
    purpose: header.purpose,
    thread: header.thread,
    imports,
    jsxTags: [...jsxTags].sort(),
    exports: [...exportNames].sort(),
    nativeSpecs: [...nativeSpecs].sort(),
    nativeUses: [...nativeUses].sort(),
    hasWorklets,
  };
}

function nativeLang(path) {
  if (path.endsWith('.swift')) {
    return 'swift';
  }
  if (/\.kts?$/.test(path)) {
    return 'kotlin';
  }
  if (path.endsWith('.java')) {
    return 'java';
  }
  return 'c-family';
}

/** Native files are matched with patterns; the edges they produce are marked approximate. */
export function analyzeNative(path, text) {
  const lang = nativeLang(path);
  const includes = [];
  const imports = [];
  const moduleNames = new Set();
  let pkg = null;

  if (lang === 'c-family') {
    for (const m of text.matchAll(/^\s*#\s*(?:import|include)\s+"([^"]+)"/gm)) {
      includes.push(m[1]);
    }
    for (const m of text.matchAll(/RCT_EXPORT_MODULE\(\s*(\w+)\s*\)/g)) {
      moduleNames.add(m[1]);
    }
    for (const m of text.matchAll(/\+\s*\(NSString\s*\*\)\s*moduleName\s*\{\s*return\s*@"(\w+)"/g)) {
      moduleNames.add(m[1]);
    }
  } else if (lang === 'kotlin' || lang === 'java') {
    pkg = /^\s*package\s+([\w.]+)/m.exec(text)?.[1] ?? null;
    for (const m of text.matchAll(/^\s*import\s+([\w.]+)/gm)) {
      imports.push(m[1]);
    }
    for (const m of text.matchAll(/@ReactModule\s*\(\s*name\s*=\s*"(\w+)"/g)) {
      moduleNames.add(m[1]);
    }
    for (const m of text.matchAll(/\bNAME\s*=\s*"(\w+)"/g)) {
      moduleNames.add(m[1]);
    }
  } else {
    for (const m of text.matchAll(/@objc\((\w+)\)/g)) {
      moduleNames.add(m[1]);
    }
  }

  const header = parseHeader(text);
  return {
    lang,
    purpose: header.purpose,
    thread: header.thread,
    pkg,
    includes,
    imports,
    moduleNames: [...moduleNames].sort(),
  };
}
