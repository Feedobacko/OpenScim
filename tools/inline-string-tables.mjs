// Removes the obfuscator's "string tables" from a chunk: local objects such as
//
//   const bs = { DpwcD: "worldState", Mowvr: function (bv, bw) { return bv ?? bw; } };
//
// whose entries are strings or one-line wrappers around an operator or a
// call. Each use (`bs.Mowvr(a, {})`, `bs.DpwcD`) is replaced by what it
// stands for (`a ?? {}`, `"worldState"`) and the table is deleted. Edits text
// in place (no reformatting).
//
//   node tools/inline-string-tables.mjs client/assets/simulationEngineFactory.js [--dry]
//   node tools/inline-string-tables.mjs --self-test
//
// A wrapper evaluates both arguments before applying its operator; `a || b`
// does not evaluate b when a decides. So a `||`, `&&` or `??` wrapper is only
// inlined where evaluating its second argument can neither fail nor be
// noticed (names, literals, `!name`, and operators over those). A wrapper
// around a call is only inlined where the function is a plain name, since
// `t.f(x.m, y)` calls m without `this` and `x.m(y)` would not. Anything else
// is reported and its table is left alone.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;

const keyOf = (property) => property.key.name ?? property.key.value;
const isTableKey = (property) => property.type === "ObjectProperty" && !property.computed && /^[A-Za-z]{5}$/.test(String(keyOf(property)));

/** { kind: "string" } | { kind: "binary" | "logical", operator } | { kind: "call", arity } | null */
function entryShape(value) {
  if (value.type === "StringLiteral") return { kind: "string" };
  if (value.type !== "FunctionExpression" || value.async || value.generator || value.body.body.length !== 1) return null;
  const statement = value.body.body[0];
  if (statement.type !== "ReturnStatement" || !statement.argument) return null;
  const params = value.params.map((param) => (param.type === "Identifier" ? param.name : null));
  if (params.includes(null) || new Set(params).size !== params.length) return null;
  const isParam = (node, index) => node.type === "Identifier" && node.name === params[index];
  const result = statement.argument;
  if ((result.type === "BinaryExpression" || result.type === "LogicalExpression") && params.length === 2 && isParam(result.left, 0) && isParam(result.right, 1))
    return { kind: result.type === "LogicalExpression" ? "logical" : "binary", operator: result.operator };
  if (result.type === "CallExpression" && params.length >= 1 && isParam(result.callee, 0) && result.arguments.length === params.length - 1 && result.arguments.every((argument, index) => isParam(argument, index + 1)))
    return { kind: "call", arity: params.length };
  return null;
}

// Operator precedence, as far as it decides where brackets are needed.
const binaryPrecedence = {
  "??": 4, "||": 5, "&&": 6, "|": 7, "^": 8, "&": 9, "==": 10, "!=": 10, "===": 10, "!==": 10,
  "<": 11, "<=": 11, ">": 11, ">=": 11, in: 11, instanceof: 11, "<<": 12, ">>": 12, ">>>": 12, "+": 13, "-": 13, "*": 14, "/": 14, "%": 14, "**": 15,
};
function precedence(node) {
  switch (node.type) {
    case "SequenceExpression": return 1;
    case "AssignmentExpression": case "ArrowFunctionExpression": case "YieldExpression": return 2;
    case "ConditionalExpression": return 3;
    case "BinaryExpression": case "LogicalExpression": return binaryPrecedence[node.operator];
    case "UnaryExpression": case "AwaitExpression": return 16;
    case "UpdateExpression": return 17;
    default: return 20;
  }
}
const mixesNullish = (operator, node) => node.type === "LogicalExpression" && (operator === "??") !== (node.operator === "??");

/** True if evaluating the expression has no effect and cannot throw. */
function isHarmless(node) {
  switch (node.type) {
    case "Identifier": case "StringLiteral": case "NumericLiteral": case "BooleanLiteral": case "NullLiteral": case "ThisExpression": return true;
    case "UnaryExpression": return ["!", "typeof", "void"].includes(node.operator) && isHarmless(node.argument);
    case "LogicalExpression": return isHarmless(node.left) && isHarmless(node.right);
    case "BinaryExpression": return ["===", "!==", "==", "!="].includes(node.operator) && isHarmless(node.left) && isHarmless(node.right);
    case "ObjectExpression": return node.properties.length === 0;
    case "ArrayExpression": return node.elements.length === 0;
    default: return false;
  }
}

/** Returns { code, tables, uses, skipped: [message] }. */
export function inlineStringTables(code) {
  const ast = parse(code, { sourceType: "module" });
  const edits = []; // [start, end, text], never overlapping: nested uses are rendered by their outermost use
  const skipped = [];
  let tables = 0, uses = 0;
  const freeBefore = [];
  const rendered = new Map(); // node -> replacement text, for uses nested inside other uses

  traverse(ast, {
    Program(path) {
      freeBefore.push(...Object.keys(path.scope.globals).sort());
    },
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id.type !== "Identifier" || init?.type !== "ObjectExpression" || init.properties.length === 0 || !init.properties.every(isTableKey)) return;
      const shapes = new Map(init.properties.map((property) => [String(keyOf(property)), { shape: entryShape(property.value), node: property.value }]));
      // A table has wrappers; an object of plain strings is only one when its keys look generated.
      const wrappers = [...shapes.values()].filter((entry) => entry.shape && entry.shape.kind !== "string").length;
      const generatedKeys = [...shapes.keys()].filter((key) => /[a-z][A-Z]|[A-Z]{2}/.test(key)).length;
      if (wrappers === 0 && generatedKeys < shapes.size) return;
      const where = `line ${path.node.loc.start.line} (${id.name})`;
      if ([...shapes.values()].some((entry) => !entry.shape)) return void skipped.push(`${where}: an entry is neither a string nor a known wrapper`);
      const binding = path.scope.getBinding(id.name);
      if (!binding.constant) return void skipped.push(`${where}: the table is reassigned`);

      const planned = [];
      for (const reference of binding.referencePaths) {
        const member = reference.parentPath;
        const node = member.node;
        const isMember = (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") && node.object === reference.node && !node.optional;
        const key = isMember ? (node.computed ? (node.property.type === "StringLiteral" ? node.property.value : null) : node.property.name) : null;
        const entry = key === null ? undefined : shapes.get(key);
        if (!entry) return void skipped.push(`${where}: used in a way that is not table.key at line ${reference.node.loc.start.line}`);
        if (entry.shape.kind === "string") {
          if (member.parentPath.isCallExpression({ callee: node }) || member.parentPath.isAssignmentExpression({ left: node }) || member.parentPath.isUpdateExpression())
            return void skipped.push(`${where}: string entry ${key} is called or assigned at line ${node.loc.start.line}`);
          planned.push({ target: node, parent: member.parent, shape: entry.shape, literal: entry.node });
          continue;
        }
        const call = member.parent;
        if (call.type !== "CallExpression" || call.callee !== node || call.arguments.some((argument) => argument.type === "SpreadElement"))
          return void skipped.push(`${where}: wrapper ${key} is not called directly at line ${node.loc.start.line}`);
        const wanted = entry.shape.kind === "call" ? entry.shape.arity : 2;
        if (call.arguments.length !== wanted) return void skipped.push(`${where}: wrapper ${key} takes ${wanted} arguments, given ${call.arguments.length} at line ${node.loc.start.line}`);
        if (entry.shape.kind === "logical" && !isHarmless(call.arguments[1]))
          return void skipped.push(`${where}: ${entry.shape.operator} wrapper ${key} at line ${node.loc.start.line}: evaluating the second argument may matter`);
        if (entry.shape.kind === "call" && call.arguments[0].type !== "Identifier")
          return void skipped.push(`${where}: call wrapper ${key} at line ${node.loc.start.line}: the function is not a plain name`);
        planned.push({ target: call, parent: member.parentPath.parent, shape: entry.shape });
      }
      tables++;
      uses += planned.length;
      for (const use of planned) rendered.set(use.target, use);

      // Delete the declaration: the whole statement if this is its only declarator.
      const declaration = path.parent;
      if (declaration.declarations.length === 1) {
        let start = declaration.start, end = declaration.end;
        while (start > 0 && (code[start - 1] === " " || code[start - 1] === "\t")) start--;
        if (code[end] === "\r") end++;
        if (code[end] === "\n") end++;
        edits.push([start, end, ""]);
      } else {
        const index = declaration.declarations.indexOf(path.node);
        const last = index === declaration.declarations.length - 1;
        edits.push(last ? [declaration.declarations[index - 1].end, path.node.end, ""] : [path.node.start, declaration.declarations[index + 1].start, ""]);
      }
    },
  });

  // Text of a node with the uses inside it replaced.
  const textOf = (node) => {
    if (rendered.has(node)) return render(rendered.get(node), null);
    const inner = [];
    const visit = (child) => {
      if (!child || typeof child.type !== "string") return;
      if (child !== node && rendered.has(child)) return void inner.push(child);
      for (const key of Object.keys(child)) {
        if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
        const value = child[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === "object") visit(value);
      }
    };
    visit(node);
    let text = code.slice(node.start, node.end);
    for (const child of inner.sort((a, b) => b.start - a.start)) text = text.slice(0, child.start - node.start) + render(rendered.get(child), null) + text.slice(child.end - node.start);
    return text;
  };
  const bracket = (text) => "(" + text + ")";
  /** Replacement text for a use; `parent` (when known) decides whether the whole needs brackets. */
  function render(use, parent) {
    const { target, shape } = use;
    if (shape.kind === "string") return code.slice(use.literal.start, use.literal.end);
    const [first, ...rest] = target.arguments;
    if (shape.kind === "call") return first.name + "(" + rest.map(textOf).join(", ") + ")";
    const own = binaryPrecedence[shape.operator];
    // What an operand becomes once inlined, for the precedence of its outermost operator.
    const effective = (node) => {
      const inner = rendered.get(node);
      if (inner && (inner.shape.kind === "binary" || inner.shape.kind === "logical")) return { type: inner.shape.kind === "logical" ? "LogicalExpression" : "BinaryExpression", operator: inner.shape.operator };
      return node;
    };
    const side = (node, isRight) => {
      const as = effective(node);
      const needs = precedence(as) < own || (isRight && precedence(as) === own) || mixesNullish(shape.operator, as);
      const text = rendered.has(node) ? render(rendered.get(node), null) : textOf(node);
      return needs ? bracket(text) : text;
    };
    const text = side(target.arguments[0], false) + " " + shape.operator + " " + side(target.arguments[1], true);
    if (!parent) return text; // nested: the caller brackets it by precedence
    const self = { type: shape.kind === "logical" ? "LogicalExpression" : "BinaryExpression", operator: shape.operator };
    switch (parent.type) {
      case "BinaryExpression": case "LogicalExpression": {
        const outer = binaryPrecedence[parent.operator];
        return own < outer || (parent.right === target && own === outer) || mixesNullish(parent.operator, self) ? bracket(text) : text;
      }
      case "UnaryExpression": case "AwaitExpression": case "UpdateExpression": case "SpreadElement": case "TaggedTemplateExpression":
        return parent.type === "SpreadElement" ? text : bracket(text);
      case "MemberExpression": case "OptionalMemberExpression":
        return parent.object === target ? bracket(text) : text;
      case "CallExpression": case "OptionalCallExpression": case "NewExpression":
        return parent.callee === target ? bracket(text) : text;
      case "ExpressionStatement": case "ArrowFunctionExpression": case "ExportDefaultDeclaration":
        return /^(\{|function\b|class\b|let\s*\[)/.test(text) ? bracket(text) : text;
      default:
        return text;
    }
  }

  // Outermost uses only: uses inside them are rendered as part of their text.
  const outermost = new Set(rendered.keys());
  for (const use of rendered.values()) {
    const strip = (node) => {
      if (!node || typeof node.type !== "string") return;
      for (const key of Object.keys(node)) {
        if (key === "loc") continue;
        const value = node[key];
        for (const child of Array.isArray(value) ? value : [value]) {
          if (child && typeof child === "object" && typeof child.type === "string") {
            outermost.delete(child);
            strip(child);
          }
        }
      }
    };
    strip(use.target);
  }
  for (const target of outermost) edits.push([target.start, target.end, render(rendered.get(target), rendered.get(target).parent)]);

  let out = code;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
  // The result must parse and refer to exactly the same free names.
  let freeAfter;
  traverse(parse(out, { sourceType: "module" }), {
    Program(path) {
      freeAfter = Object.keys(path.scope.globals).sort().join();
      path.stop();
    },
  });
  if (freeAfter !== freeBefore.join()) throw new Error(`inlining changed the file's free identifiers: ${freeBefore.join()} -> ${freeAfter}`);
  if (process.env.DEBUG_INLINE) console.error(out);
  return { code: out, tables, uses, skipped };
}

function selfTest() {
  const source = [
    "function f(a, b, g) {",
    "  const t = {",
    '    AbcDe: "name",',
    "    FghIj: function (x, y) { return x + y; },",
    "    KlmNo: function (x, y) { return x ?? y; },",
    "    PqrSt: function (x, y, z) { return x(y, z); },",
    "    UvwXy: function (x, y) { return x * y; },",
    "    ZabCd: function (x, y) { return x && y; },",
    "  };",
    "  const u = { QweRt: function (x, y) { return x || y; } };",
    "  const phase = { phase: \"active\" };",
    "  const s = t.FghIj(a, t.UvwXy(b, 2)) * 3;",
    "  const p = t.UvwXy(t.FghIj(a, b), t.FghIj(a, 1));",
    "  const q = t.KlmNo(a, {})[t.AbcDe];",
    "  const r = t.PqrSt(g, t.FghIj(a, b), t.AbcDe);",
    "  const v = !t.ZabCd(a, !b) || t.KlmNo(a, b);",
    "  const w = t.FghIj(a, b - 1) - t.FghIj(a, b);",
    "  return u.QweRt(a, b.c) ? s : phase;",
    "}",
  ].join("\n");
  const expected = [
    "function f(a, b, g) {",
    "  const u = { QweRt: function (x, y) { return x || y; } };",
    "  const phase = { phase: \"active\" };",
    "  const s = (a + b * 2) * 3;",
    "  const p = (a + b) * (a + 1);",
    '  const q = (a ?? {})["name"];',
    '  const r = g(a + b, "name");',
    "  const v = !(a && !b) || (a ?? b);",
    "  const w = a + (b - 1) - (a + b);",
    "  return u.QweRt(a, b.c) ? s : phase;",
    "}",
  ].join("\n");
  const result = inlineStringTables(source);
  if (result.code !== expected) throw new Error("self-test failed:\n" + result.code);
  if (result.tables !== 1 || result.uses !== 14 || result.skipped.length !== 1 || !result.skipped[0].includes("second argument")) throw new Error("self-test counts: " + JSON.stringify({ ...result, code: undefined }));
  // The inlined code computes what the wrappers computed.
  const run = (text) => new Function(text + "\nreturn JSON.stringify([f(2, 3, (x, y) => x + y), f(null, 0, () => 1), f(0, { c: 5 }, String)]);")();
  const instrumented = (text) => text.replace("return u.QweRt(a, b.c) ? s : phase;", "return [s, p, q, r, v, w];");
  if (run(instrumented(source)) !== run(instrumented(expected))) throw new Error("self-test: results differ");
  for (const refused of [
    "const t = { AbcDe: function (x, y) { return x(y); } }; t.AbcDe(o.m, 1);", // would gain a `this`
    "const t = { AbcDe: function (x, y) { return x + y; } }; g(t);", // the table escapes
    "const t = { AbcDe: function (x, y) { return y - x; } }; t.AbcDe(1, 2);", // not a known wrapper
  ]) {
    const outcome = inlineStringTables(refused);
    if (outcome.code !== refused || outcome.skipped.length !== 1) throw new Error("expected a refusal for: " + refused);
  }
  console.log("inline-string-tables self-test passed");
}

if (process.argv[1]?.endsWith("inline-string-tables.mjs")) {
  const [target] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else if (target) {
    const { code, tables, uses, skipped } = inlineStringTables(readFileSync(target, "utf8"));
    if (!process.argv.includes("--dry")) writeFileSync(target, code);
    console.log(`${basename(target)}: ${tables} tables removed, ${uses} uses inlined, ${skipped.length} left alone`);
    for (const message of skipped) console.log("  " + message);
  } else {
    console.error("usage: node tools/inline-string-tables.mjs <chunk.js> [--dry] | --self-test");
    process.exit(1);
  }
}
