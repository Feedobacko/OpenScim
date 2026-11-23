// Replaces calls of the bundler's define-field helper by the class fields
// they were compiled from. Edits text in place (no reformatting).
//
//   class A { constructor(x) { define(this, "tick", undefined); define(this, "actors", new Map()); this.tick = x; } }
//   class A { tick; actors = new Map(); constructor(x) { this.tick = x; } }
//
//   node tools/replace-define-field.mjs client/assets/simulationEngineFactory.js --helper aa [--dry]
//   node tools/replace-define-field.mjs client/assets/rendering.js --helper ce --lines 150-315 [--dry]
//   node tools/replace-define-field.mjs --self-test
//
// --helper is the local name of the helper in that file (the function that
// does `key in obj ? Object.defineProperty(obj, key, {value, enumerable,
// configurable, writable}) : obj[key] = value`).
//
// A class field is defined on the instance with exactly those attributes, in
// source order, before the constructor body runs (after `super(...)` returns
// in a derived class). So a helper call becomes a field only when it is in
// the unbroken run of such calls that opens the constructor (after a leading
// `super(...)`), and its value uses nothing that exists only inside the
// constructor (parameters, locals, `arguments`, `new.target`). A later call
// becomes `this.key = value` where that is the same thing: the class and its
// ancestors, all in this file, have no accessor of that name. Everything else
// is left as it is and reported.
//
// --lines a-b limits the rewrite to the classes that lie within those lines
// (one class of a chunk whose other classes stay as they are); only what is
// left inside the range is reported.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const isIdentifierName = (name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== "constructor";

/** Returns { code, fields, assignments, left: [message], helperImportRemoved }. `lines` is [first, last] or undefined. */
export function replaceDefineField(code, helper, lines) {
  const ast = parse(code, { sourceType: "module" });
  const edits = [];
  const left = [];
  let fields = 0, assignments = 0, emptied = 0, freeBefore, helperBinding;
  const handled = new Set(); // helper call nodes that were replaced
  const lineStart = (offset) => code.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = (offset) => {
    const end = code.indexOf("\n", offset);
    return end < 0 ? code.length : end + 1;
  };
  const indentAt = (offset) => code.slice(lineStart(offset), offset).match(/^[ \t]*/)[0];

  /** The helper call `helper(this, "key", value);` as a statement, or null. */
  const helperCall = (statement) => {
    const call = statement.type === "ExpressionStatement" ? statement.expression : null;
    if (call?.type !== "CallExpression" || call.callee.type !== "Identifier" || call.callee.name !== helper) return null;
    const [target, key, value] = call.arguments;
    if (call.arguments.length !== 3 || target.type !== "ThisExpression" || key.type !== "StringLiteral" || value.type === "SpreadElement") return null;
    return { call, key: key.value, value };
  };

  traverse(ast, {
    Program(path) {
      freeBefore = Object.keys(path.scope.globals).sort().join();
      helperBinding = path.scope.getBinding(helper);
      if (!helperBinding) throw new Error(`no top-level binding named ${helper}`);
    },
    Class(path) {
      if (lines && (path.node.loc.start.line < lines[0] || path.node.loc.end.line > lines[1])) return;
      const constructor = path.node.body.body.find((member) => member.type === "ClassMethod" && member.kind === "constructor");
      if (!constructor) return;
      const className = path.node.id?.name ?? (path.parent.type === "VariableDeclarator" ? path.parent.id.name : "(anonymous class)");
      const statements = constructor.body.body;
      const constructorPath = path.get("body.body").find((member) => member.node === constructor);
      const scope = constructorPath.scope;

      // Does the value use something that only exists inside the constructor?
      const usesConstructorScope = (valuePath) => {
        let found = false;
        const check = (inner) => {
          if (inner.isIdentifier() && inner.isReferencedIdentifier()) {
            if (inner.node.name === "arguments" && !inner.scope.getBinding("arguments")) found = true;
            let holder = inner.scope.getBinding(inner.node.name)?.scope;
            // A binding declared in the constructor or in a block of it, but not inside the value itself.
            for (let at = holder; at && !found; at = at.parent) {
              if (at === scope && !inner.findParent((ancestor) => ancestor.scope === holder && ancestor.node.start >= valuePath.node.start && ancestor.node.end <= valuePath.node.end && ancestor !== valuePath && ancestor.isScope())) found = true;
              if (at === scope) break;
            }
          }
          if (inner.isMetaProperty() || inner.isAwaitExpression() || inner.isYieldExpression()) found = true;
        };
        check(valuePath);
        valuePath.traverse({ enter: check });
        return found;
      };

      // Accessors of this class and its ancestors; null if an ancestor is not a class of this file.
      const accessorNames = (classPath, seen = new Set()) => {
        const names = new Set();
        for (const member of classPath.node.body.body) {
          if (member.type === "ClassMethod" && (member.kind === "get" || member.kind === "set") && !member.static) names.add(member.computed ? null : (member.key.name ?? member.key.value));
        }
        if (/Object\s*\.\s*(freeze|seal|preventExtensions|defineProperty|defineProperties)\s*\(\s*this\b/.test(code.slice(classPath.node.start, classPath.node.end))) names.add(null);
        const superClass = classPath.node.superClass;
        if (!superClass) return names;
        if (superClass.type !== "Identifier" || seen.has(superClass.name)) return null;
        seen.add(superClass.name);
        const binding = classPath.scope.getBinding(superClass.name);
        const parentPath = binding?.path.isClassDeclaration() ? binding.path : binding?.path.isVariableDeclarator() && binding.constant && binding.path.get("init").isClassExpression() ? binding.path.get("init") : null;
        const inherited = parentPath && accessorNames(parentPath, seen);
        if (!inherited) return null;
        for (const name of inherited) names.add(name);
        return names;
      };

      const derived = Boolean(path.node.superClass);
      let index = 0;
      if (derived) {
        const first = statements[0];
        const opensWithSuper = first?.type === "ExpressionStatement" && first.expression.type === "CallExpression" && first.expression.callee.type === "Super";
        index = opensWithSuper ? 1 : -1;
      }
      const fieldLines = [], removals = [];
      const indent = indentAt(constructor.start);
      const statementPaths = constructorPath.get("body.body");
      for (; index >= 0 && index < statements.length; index++) {
        const found = helperCall(statements[index]);
        if (!found) break;
        const valuePath = statementPaths[index].get("expression.arguments.2");
        if (usesConstructorScope(valuePath)) break; // this one and the rest stay in the constructor
        const { call, key, value } = found;
        if (!isIdentifierName(key)) break;
        const isUndefined = value.type === "Identifier" && value.name === "undefined" && !scope.getBinding("undefined");
        let text = code.slice(value.start, value.end);
        // The value moves two levels out; shift its continuation lines unless a template literal spans them.
        const shift = indentAt(statements[index].start).length - indent.length;
        let hasMultilineTemplate = false;
        valuePath.traverse({ TemplateLiteral(inner) { if (inner.node.loc.start.line !== inner.node.loc.end.line) hasMultilineTemplate = true; } });
        if (valuePath.isTemplateLiteral() && value.loc.start.line !== value.loc.end.line) hasMultilineTemplate = true;
        if (shift > 0 && !hasMultilineTemplate && text.split("\n").slice(1).every((line) => line.trim() === "" || line.startsWith(" ".repeat(shift))))
          text = text.split("\n").map((line, at) => (at === 0 || line.trim() === "" ? line : line.slice(shift))).join("\n");
        fieldLines.push(indent + key + (isUndefined ? "" : " = " + text) + ";\n");
        removals.push([lineStart(statements[index].start), lineEnd(statements[index].end), ""]);
        handled.add(call);
        fields++;
      }
      // A constructor without parameters that is left empty goes too: a
      // base class without one behaves the same.
      if (fieldLines.length && !derived && index === statements.length && constructor.params.length === 0) {
        edits.push([lineStart(constructor.start), lineEnd(constructor.end), fieldLines.join("")]);
        emptied++;
        return;
      }
      edits.push(...removals);
      if (fieldLines.length) edits.push([lineStart(constructor.start), lineStart(constructor.start), fieldLines.join("")]);

      // Later helper calls anywhere in the constructor's own statements: assignments, if no accessor can intervene.
      const accessors = accessorNames(path);
      constructorPath.traverse({
        Function(inner) {
          if (!inner.isArrowFunctionExpression()) inner.skip(); // `this` is another object in there
        },
        ExpressionStatement(inner) {
          const found = helperCall(inner.node);
          if (!found || handled.has(found.call)) return;
          const where = `${className}, line ${inner.node.loc.start.line}: ${found.key}`;
          if (!accessors) return void left.push(`${where}: an ancestor class is not in this file`);
          if (accessors.has(null) || accessors.has(found.key)) return void left.push(`${where}: an accessor or a property definition could intervene`);
          const target = isIdentifierName(found.key) ? "this." + found.key : "this[" + JSON.stringify(found.key) + "]";
          edits.push([found.call.start, found.call.end, target + " = " + code.slice(found.value.start, found.value.end)]);
          handled.add(found.call);
          assignments++;
        },
      });
    },
  });

  // Whatever calls remain are reported; the import goes when none do.
  const remaining = helperBinding.referencePaths.filter((reference) => !handled.has(reference.parent));
  for (const reference of remaining) {
    if (lines && (reference.node.loc.start.line < lines[0] || reference.node.loc.start.line > lines[1])) continue;
    if (reference.parent.type === "CallExpression" && reference.parent.callee === reference.node && !left.some((message) => message.includes(`line ${reference.node.loc.start.line}:`)))
      left.push(`line ${reference.node.loc.start.line}: not a constructor's define(this, "key", value) statement`);
  }
  let helperImportRemoved = false;
  if (remaining.length === 0 && helperBinding.path.isImportSpecifier() && helperBinding.path.parent.specifiers.length > 1) {
    const specifier = helperBinding.path.node;
    const whole = code.slice(lineStart(specifier.start), lineEnd(specifier.end)).trim() === code.slice(specifier.start, specifier.end) + ",";
    // One specifier among others on a line: `{ define, other }` or `{ other, define }`.
    const comma = code.slice(specifier.end).match(/^\s*,\s*/), commaBefore = code.slice(0, specifier.start).match(/,\s*$/);
    if (whole) edits.push([lineStart(specifier.start), lineEnd(specifier.end), ""]);
    else if (comma) edits.push([specifier.start, specifier.end + comma[0].length, ""]);
    else if (commaBefore) edits.push([specifier.start - commaBefore[0].length, specifier.end, ""]);
    helperImportRemoved = Boolean(whole || comma || commaBefore);
  } else if (remaining.length === 0 && helperBinding.path.isImportSpecifier()) {
    // The helper was all the file imported from that module: the line goes.
    // (The module is still loaded by the files that use it.)
    const declaration = helperBinding.path.parent;
    edits.push([lineStart(declaration.start), lineEnd(declaration.end), ""]);
    helperImportRemoved = true;
  }

  let out = code;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0] || b[1] - a[1])) out = out.slice(0, start) + text + out.slice(end);
  let freeAfter;
  traverse(parse(out, { sourceType: "module" }), {
    Program(path) {
      freeAfter = Object.keys(path.scope.globals).sort().join();
      path.stop();
    },
  });
  // `tick;` no longer names `undefined`; nothing else may change.
  const without = (names) => names.split(",").filter((name) => name !== "undefined").join();
  if (without(freeAfter) !== without(freeBefore)) throw new Error(`the rewrite changed the file's free identifiers: ${freeBefore} -> ${freeAfter}`);
  return { code: out, fields, assignments, emptied, left, helperImportRemoved };
}

function selfTest() {
  const helperSource = "function define(e, a, t) { if (a in e) Object.defineProperty(e, a, { value: t, enumerable: true, configurable: true, writable: true }); else e[a] = t; return e; }\n";
  const source = helperSource + [
    "var log = [];",
    "var Base = class {",
    "  constructor(x) {",
    '    define(this, "tick", undefined);',
    '    define(this, "actors", new Map());',
    '    define(this, "roll", () => this.tick);',
    '    define(this, "options", {',
    "      a: 1,",
    "    });",
    '    define(this, "size", x);',
    '    define(this, "late", 1);',
    "    this.tick = x;",
    '    define(this, "after", 2);',
    "  }",
    "  get late() { return 0; }",
    "  set late(v) { log.push(v); }",
    "};",
    "class Child extends Base {",
    "  constructor(x) {",
    "    super(x);",
    '    define(this, "own", [x].length);',
    '    define(this, "second", this.own + 1);',
    "    const local = 1;",
    '    define(this, "late", local);',
    "  }",
    "}",
    "class Odd extends Unknown {",
    "  constructor() {",
    "    const before = 1;",
    "    super();",
    '    define(this, "x", before);',
    "  }",
    "}",
    'function loose(o) { define(o, "y", 1); }',
  ].join("\n");
  const expected = helperSource + [
    "var log = [];",
    "var Base = class {",
    "  tick;",
    "  actors = new Map();",
    "  roll = () => this.tick;",
    "  options = {",
    "    a: 1,",
    "  };",
    "  constructor(x) {",
    "    this.size = x;", // uses a parameter: stays in the constructor, as an assignment
    '    define(this, "late", 1);', // an accessor of that name exists: left alone
    "    this.tick = x;",
    "    this.after = 2;",
    "  }",
    "  get late() { return 0; }",
    "  set late(v) { log.push(v); }",
    "};",
    "class Child extends Base {",
    "  constructor(x) {",
    "    super(x);",
    "    this.own = [x].length;",
    "    this.second = this.own + 1;",
    "    const local = 1;",
    '    define(this, "late", local);', // the accessor is inherited
    "  }",
    "}",
    "class Odd extends Unknown {",
    "  constructor() {",
    "    const before = 1;",
    "    super();",
    '    define(this, "x", before);', // the ancestor is not in this file
    "  }",
    "}",
    'function loose(o) { define(o, "y", 1); }', // not a constructor's field
  ].join("\n");
  const result = replaceDefineField(source, "define");
  if (result.code !== expected) throw new Error("self-test failed:\n" + result.code);
  if (result.fields !== 4 || result.assignments !== 4 || result.left.length !== 4) throw new Error("self-test counts: " + JSON.stringify({ ...result, code: undefined }));

  // Without the accessor, later calls become assignments; and the two forms build the same objects.
  const plain = source.replace("  get late() { return 0; }\n  set late(v) { log.push(v); }\n", "");
  const rewritten = replaceDefineField(plain, "define");
  if (rewritten.assignments !== 6 || !rewritten.code.includes("    this.size = x;\n    this.late = 1;") || !rewritten.code.includes("    this.second = this.own + 1;")) throw new Error("self-test assignments:\n" + rewritten.code);
  if (!rewritten.left.some((message) => message.startsWith("Odd")) || rewritten.code.includes("this.x = before")) throw new Error("self-test: Odd must be left alone");
  const describe = (text) => new Function("Unknown", text.replace("class Odd extends Unknown", "class Odd extends Object") +
    "\nconst show = (o) => Object.entries(Object.getOwnPropertyDescriptors(o)).map(([k, d]) => [k, d.enumerable, d.writable, d.configurable, typeof d.value === 'function' ? d.value.call(null) : d.value instanceof Map ? 'map' : d.value]);" +
    "\nreturn JSON.stringify([show(new Base(7)), show(new Child(3)), log]);")(Object);
  for (const [before, after] of [[source, result.code], [plain, rewritten.code]]) {
    if (describe(before) !== describe(after)) throw new Error("self-test: objects differ\n" + describe(before) + "\n" + describe(after));
  }
  // An import of the helper on one line, and a constructor that held nothing else.
  const moduleSource = 'import { other, define } from "./chunk.js";\nvar Lobby = class {\n  constructor() {\n    define(this, "kind", "lobby");\n  }\n  get() {\n    return other;\n  }\n};\nvar Kept = class {\n  constructor(seed) {\n    define(this, "kind", "kept");\n  }\n};';
  const moduleResult = replaceDefineField(moduleSource, "define");
  const moduleExpected = 'import { other } from "./chunk.js";\nvar Lobby = class {\n  kind = "lobby";\n  get() {\n    return other;\n  }\n};\nvar Kept = class {\n  kind = "kept";\n  constructor(seed) {\n  }\n};';
  if (moduleResult.code !== moduleExpected || moduleResult.emptied !== 1 || !moduleResult.helperImportRemoved) throw new Error("self-test module:\n" + moduleResult.code);
  if (replaceDefineField(moduleSource.replace("{ other, define }", "{ define, other }"), "define").code !== moduleExpected) throw new Error("self-test: leading specifier");
  const alone = replaceDefineField('import { define } from "./chunk.js";\nimport { other } from "./other.js";\nvar Sand = class {\n  constructor() {\n    define(this, "pools", other);\n  }\n};', "define");
  if (alone.code !== 'import { other } from "./other.js";\nvar Sand = class {\n  pools = other;\n};' || !alone.helperImportRemoved) throw new Error("self-test: lone specifier:\n" + alone.code);
  const two = helperSource + 'var First = class {\n  constructor() {\n    define(this, "a", 1);\n  }\n};\nvar Second = class {\n  constructor() {\n    define(this, "b", 2);\n    this.read();\n  }\n  read() {}\n};';
  const ranged = replaceDefineField(two, "define", [7, 13]);
  if (ranged.code !== helperSource + 'var First = class {\n  constructor() {\n    define(this, "a", 1);\n  }\n};\nvar Second = class {\n  b = 2;\n  constructor() {\n    this.read();\n  }\n  read() {}\n};' || ranged.fields !== 1 || ranged.left.length !== 0) throw new Error("self-test --lines:\n" + ranged.code + "\n" + ranged.left.join("\n"));
  console.log("replace-define-field self-test passed");
}

if (process.argv[1]?.endsWith("replace-define-field.mjs")) {
  const args = process.argv.slice(2);
  const helper = args.includes("--helper") ? args[args.indexOf("--helper") + 1] : undefined;
  const lines = args.includes("--lines") ? args[args.indexOf("--lines") + 1].split("-").map(Number) : undefined;
  const [target] = args.filter((argument, index) => !argument.startsWith("--") && args[index - 1] !== "--helper" && args[index - 1] !== "--lines");
  if (args.includes("--self-test")) {
    selfTest();
  } else if (target && helper) {
    const { code, fields, assignments, emptied, left, helperImportRemoved } = replaceDefineField(readFileSync(target, "utf8"), helper, lines);
    if (!args.includes("--dry")) writeFileSync(target, code);
    console.log(`${basename(target)}: ${fields} class fields, ${assignments} assignments, ${left.length} calls left` + (emptied ? `; ${emptied} emptied constructors removed` : "") + (helperImportRemoved ? "; helper import removed" : ""));
    for (const message of left) console.log("  " + message);
  } else {
    console.error("usage: node tools/replace-define-field.mjs <chunk.js> --helper <name> [--lines a-b] [--dry] | --self-test");
    process.exit(1);
  }
}
