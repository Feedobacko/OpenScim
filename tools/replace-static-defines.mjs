// Turns the bundler's lowered static class fields back into static fields.
// Edits text in place (no reformatting).
//
//   var alias;
//   var Flags = class {};
//   alias = Flags;
//   define(Flags, "WALL", 1);
//   define(Flags, "BLOCKED", alias.WALL | 2);
// becomes
//   var Flags = class {
//     static WALL = 1;
//     static BLOCKED = this.WALL | 2;
//   };
//
//   node tools/replace-static-defines.mjs client/engine/collision.js --helper ce [--dry]
//   node tools/replace-static-defines.mjs --self-test
//
// --helper is the local name of the define-field helper in that file (see
// replace-define-field.mjs, which handles the instance fields).
//
// A static field is defined on the class with the attributes the helper
// gives (enumerable, configurable, writable), in source order, when the class
// is evaluated. So a class is converted only when moving the definitions up
// to the class cannot be seen: the class has no superclass and no static
// member of its own; nothing but function declarations (which run nothing),
// the alias assignment and the definitions themselves stands between the
// class and its last definition; and every value is made of literals and of
// earlier fields read through the class or its alias, which become `this`.
// The alias goes when nothing else uses it. Anything else is left as it is
// and reported.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const isFieldName = (name) => /^[A-Za-z_$][\w$]*$/.test(name) && !["prototype", "name", "length", "constructor"].includes(name);

/** Returns { code, fields, classes, aliasesRemoved, left: [message] }. */
export function replaceStaticDefines(code, helper) {
  const ast = parse(code, { sourceType: "module" });
  let program;
  traverse(ast, { Program(path) { program = path; path.stop(); } });
  const top = program.scope.bindings;
  const body = program.get("body");
  const edits = [], left = [];
  let fields = 0, classes = 0, aliasesRemoved = 0;
  const lineStart = (offset) => code.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = (offset) => { const end = code.indexOf("\n", offset); return end < 0 ? code.length : end + 1; };
  const removeLines = (node) => edits.push({ start: lineStart(node.start), end: lineEnd(node.end), text: "" });

  const defineOf = (statement) => {
    const call = statement.node.type === "ExpressionStatement" ? statement.node.expression : null;
    if (call?.type !== "CallExpression" || call.callee.type !== "Identifier" || call.callee.name !== helper || statement.scope.getBinding(helper) !== top[helper]) return null;
    const [target, key, value] = call.arguments;
    if (call.arguments.length !== 3 || target.type !== "Identifier" || key.type !== "StringLiteral" || value.type === "SpreadElement") return null;
    return { target: target.name, key: key.value, value: statement.get("expression.arguments.2") };
  };
  const classOf = (statement) => {
    const { node } = statement;
    if (node.type === "ClassDeclaration") return { name: node.id.name, node };
    if (node.type === "VariableDeclaration" && node.declarations.length === 1 && node.declarations[0].id.type === "Identifier" && node.declarations[0].init?.type === "ClassExpression") return { name: node.declarations[0].id.name, node: node.declarations[0].init };
    return null;
  };

  body.forEach((statement, index) => {
    const found = classOf(statement);
    if (!found) return;
    const { name, node: classNode } = found;
    const defines = [], aliases = new Set(), aliasAssignments = [];
    let lastDefine = -1;
    for (let i = index + 1; i < body.length; i++) {
      const define = defineOf(body[i]);
      if (define?.target === name) { defines.push({ ...define, statement: body[i] }); lastDefine = i; }
    }
    if (!defines.length) return;
    const refuse = (reason) => left.push(`${name} (line ${classNode.loc.start.line}): ${reason}; ${defines.length} calls left`);
    if (classNode.superClass) return refuse("has a superclass");
    if (classNode.body.body.some((member) => member.static || member.type === "StaticBlock")) return refuse("already has static members");
    if (top[name].constantViolations.length) return refuse("is assigned again");
    for (let i = index + 1; i < lastDefine; i++) {
      const { node } = body[i];
      if (node.type === "FunctionDeclaration" || defines.some((define) => define.statement === body[i])) continue;
      const assignment = node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression" && node.expression.operator === "=" ? node.expression : null;
      if (assignment?.left.type === "Identifier" && assignment.right.type === "Identifier" && assignment.right.name === name && top[assignment.left.name]) {
        aliases.add(assignment.left.name);
        aliasAssignments.push(body[i]);
        continue;
      }
      return refuse(`line ${node.loc.start.line} stands between the class and its definitions`);
    }
    const seen = new Set(), rewrites = [];
    for (const { key, value, statement: defineStatement } of defines) {
      if (!isFieldName(key) || seen.has(key)) return refuse(`"${key}" cannot be a static field`);
      let problem;
      const check = (path) => {
        if (path.isFunction() || path.isClass() || path.isThisExpression() || path.isSuper() || path.isAwaitExpression() || path.isYieldExpression()) problem = `the value of "${key}" is not a plain expression`;
        if (!path.isIdentifier() || !path.isReferencedIdentifier()) return;
        const viaClass = path.node.name === name || aliases.has(path.node.name);
        const member = path.parentPath;
        if (viaClass && path.scope.getBinding(path.node.name) === top[path.node.name] && member.isMemberExpression() && member.node.object === path.node && !member.node.computed && seen.has(member.node.property.name)) rewrites.push(path.node);
        else problem = `the value of "${key}" uses "${path.node.name}"`;
      };
      check(value);
      value.traverse({ enter: check });
      if (problem) return refuse(`${problem} (line ${defineStatement.node.loc.start.line})`);
      seen.add(key);
    }
    // The class body gets the fields; the calls go.
    const valueText = (value) => {
      let text = code.slice(value.node.start, value.node.end);
      for (const node of rewrites.filter((node) => node.start >= value.node.start && node.end <= value.node.end).sort((a, b) => b.start - a.start))
        text = text.slice(0, node.start - value.node.start) + "this" + text.slice(node.end - value.node.start);
      return text;
    };
    const indent = code.slice(lineStart(classNode.start), classNode.start).match(/^[ \t]*/)[0] + "  ";
    const lines = defines.map(({ key, value }) => `${indent}static ${key} = ${valueText(value)};\n`).join("");
    const close = classNode.body.end - 1; // the closing brace
    const empty = classNode.body.body.length === 0 && /^\{\s*\}$/.test(code.slice(classNode.body.start, classNode.body.end));
    if (empty) edits.push({ start: classNode.body.start + 1, end: close, text: "\n" + lines + indent.slice(2) });
    else if (code.slice(lineStart(close), close).trim() === "") edits.push({ start: lineStart(close), end: lineStart(close), text: lines });
    else return refuse("the class body does not end on a line of its own");
    for (const { statement: defineStatement } of defines) removeLines(defineStatement.node);
    fields += defines.length;
    classes++;
    // An alias that nothing else reads goes, with its declaration.
    const gone = new Set([...defines.map((define) => define.statement.node), ...aliasAssignments.map((assignment) => assignment.node)]);
    const inside = (path) => path.findParent((parent) => gone.has(parent.node));
    for (const alias of aliases) {
      const binding = top[alias];
      const declaration = binding.path.parentPath;
      const removable = binding.path.isVariableDeclarator() && !binding.path.node.init && declaration.node.declarations.length === 1 && declaration.parentPath.isProgram() &&
        binding.referencePaths.every(inside) && binding.constantViolations.every(inside);
      if (!removable) { left.push(`${alias}: still used, the alias of ${name} stays`); continue; }
      removeLines(declaration.node);
      for (const assignment of aliasAssignments) if (assignment.node.expression.left.name === alias) removeLines(assignment.node);
      aliasesRemoved++;
    }
  });
  let result = code;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start || b.end - a.end)) result = result.slice(0, start) + text + result.slice(end);
  if (edits.length) parse(result, { sourceType: "module" });
  return { code: result, fields, classes, aliasesRemoved, left };
}

function selfTest() {
  const helperSource = "function define(e, a, t) { if (a in e) Object.defineProperty(e, a, { value: t, enumerable: true, configurable: true, writable: true }); else e[a] = t; return e; }\n";
  const source = helperSource + [
    "var alias;",
    "var other = 5;",
    "var Flags = class {};",
    "function between() { return Flags.WALL; }",
    "alias = Flags;",
    'define(Flags, "WALL", 1);',
    'define(Flags, "OBJECT", 256);',
    "define(",
    "  Flags,",
    '  "BLOCKED",',
    "  alias.WALL |",
    "    Flags.OBJECT,",
    ");",
    "var Kept = class {",
    "  size() { return 1; }",
    "};",
    'define(Kept, "LIMIT", 3);',
    "var Outside = class {};",
    'define(Outside, "A", other);',
    "var Late = class {};",
    "var gap = 1;",
    'define(Late, "A", 1);',
    "class Child extends Kept {}",
    'define(Child, "A", 1);',
    "var Forward = class {};",
    'define(Forward, "A", Forward.B);',
    'define(Forward, "B", 1);',
  ].join("\n");
  const expected = helperSource + [
    "var other = 5;",
    "var Flags = class {",
    "  static WALL = 1;",
    "  static OBJECT = 256;",
    "  static BLOCKED = this.WALL |",
    "    this.OBJECT;",
    "};",
    "function between() { return Flags.WALL; }",
    "var Kept = class {",
    "  size() { return 1; }",
    "  static LIMIT = 3;",
    "};",
    "var Outside = class {};",
    'define(Outside, "A", other);', // the value uses another binding
    "var Late = class {};",
    "var gap = 1;",
    'define(Late, "A", 1);', // a statement stands in between
    "class Child extends Kept {}",
    'define(Child, "A", 1);', // a superclass
    "var Forward = class {};",
    'define(Forward, "A", Forward.B);', // reads a field that is defined later
    'define(Forward, "B", 1);',
  ].join("\n");
  const result = replaceStaticDefines(source, "define");
  if (result.code !== expected) throw new Error("self-test failed:\n" + result.code);
  if (result.fields !== 4 || result.classes !== 2 || result.aliasesRemoved !== 1 || result.left.length !== 4) throw new Error("self-test counts: " + JSON.stringify({ ...result, code: undefined }));
  // Both forms build the same classes: own keys in the same order, with the same attributes and values.
  const describe = (text) => new Function(text + "\nreturn JSON.stringify([Flags, Kept, Outside, Late, Child, Forward].map((c) => Reflect.ownKeys(c).map((key) => { const d = Object.getOwnPropertyDescriptor(c, key); return [key, d.enumerable, d.writable, d.configurable, typeof d.value === 'function' || typeof d.value === 'object' ? typeof d.value : d.value]; })).concat([between()]));")();
  if (describe(source) !== describe(result.code)) throw new Error("self-test: classes differ\n" + describe(source) + "\n" + describe(result.code));
  // An alias that is read elsewhere stays, and so does its assignment.
  const shared = replaceStaticDefines(helperSource + 'var alias;\nvar Flags = class {};\nalias = Flags;\ndefine(Flags, "A", 1);\nvar copy = alias.A;', "define");
  if (shared.code !== helperSource + "var alias;\nvar Flags = class {\n  static A = 1;\n};\nalias = Flags;\nvar copy = alias.A;" || shared.aliasesRemoved !== 0) throw new Error("self-test alias:\n" + shared.code);
  console.log("replace-static-defines self-test passed");
}

if (process.argv[1]?.endsWith("replace-static-defines.mjs")) {
  const args = process.argv.slice(2);
  const helper = args.includes("--helper") ? args[args.indexOf("--helper") + 1] : undefined;
  const [target] = args.filter((argument, index) => !argument.startsWith("--") && args[index - 1] !== "--helper");
  if (args.includes("--self-test")) selfTest();
  else if (target && helper) {
    const { code, fields, classes, aliasesRemoved, left } = replaceStaticDefines(readFileSync(target, "utf8"), helper);
    if (!args.includes("--dry")) writeFileSync(target, code);
    console.log(`${basename(target)}: ${fields} static fields in ${classes} classes, ${aliasesRemoved} aliases removed`);
    for (const message of left) console.log("  " + message);
  } else {
    console.error("usage: node tools/replace-static-defines.mjs <module.js> --helper <name> [--dry] | --self-test");
    process.exit(1);
  }
}
