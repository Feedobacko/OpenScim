// Gives a name to functions that are called at once: what the bundler left
// where a named function belongs. Edits text in place; the only text it
// reformats is the indentation of the function that moves.
//
//   node tools/name-called-functions.mjs <file.js | directory> --census
//   node tools/name-called-functions.mjs <file.js | directory> names.json [--dry]
//   node tools/name-called-functions.mjs --self-test
//
//   x = (function (a, b) { ... })(p, q)      becomes      x = name(p, q)
//
// and `function name(a, b) { ... }` is declared at module level, in front of
// the top-level statement that holds the call. The call stays where it was
// with the same arguments, so nothing is evaluated earlier or later than
// before, and the body is the same statements. That is the same program as
// long as the function did not depend on where it stood, so a site is refused
// when the function
//   - is an arrow function, async, a generator, or has a name of its own;
//   - uses `this` or `arguments` of its own: in its own statements or in an
//     arrow function inside it. Those of a method or of an ordinary function
//     nested in it are that one's own and do not stand in the way;
//   - mentions `eval`, `super`, `new.target`, `await` or `yield` anywhere
//     inside it;
//   - reads or writes a variable of a function or block around it (module
//     level variables are fine: the declaration sees the same ones);
// or when the new name is already a variable anywhere in the file or is read
// there as a global.
//
// names.json: { "module.js": { "52": ["resolveFireballHazards", "evidence, or the word inferred"] } }
// for a directory (paths under it), { "52": [...] } for one file. The key is
// the line of the word `function` before the run. A site without an entry is
// left alone and listed.
//
// After the rewrite the tool proves what it did: it parses the result, puts
// every declared function back where its call is, and requires the syntax
// tree to be the one it started from; and the names the file reads as
// globals must be the same.
//
//   node tools/name-called-functions.mjs <file.js> --unwrap <line>[,<line>...] [--dry]
//
// A second, separate rewrite for one shape that needs no name: a function
// whose whole body is one function called at once with its own parameters,
//
//   function f(a, b = 1) { return (function (a, b = 1) { ... })(a, b); }
//
// becomes `function f(a, b = 1) { ... }`. Refused unless the call is the only
// statement of the function around it, the parameters are the same names in
// the same order with the same literal defaults, the arguments are exactly
// those names, and (when the call is not returned) the inner function
// returns no value. The proof: the syntax tree before, with the inner body
// put in place of the outer one, is the syntax tree after.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const short = (text, length = 60) => (text.length > length ? text.slice(0, length - 1) + "…" : text).replace(/\s+/g, " ");

/** Every function called at once in the code, in source order, with what stands in the way of naming it. */
function findSites(code) {
  const ast = parse(code, { sourceType: "module", createParenthesizedExpressions: true, tokens: true });
  const sites = [];
  const taken = new Set();
  traverse(ast, {
    Program(path) {
      for (const name of Object.keys(path.scope.globals)) taken.add(name);
    },
    Scopable(path) {
      for (const name of Object.keys(path.scope.bindings)) taken.add(name);
    },
    CallExpression(path) {
      let callee = path.get("callee");
      const outer = callee.node; // the function with the parentheses around it
      while (callee.isParenthesizedExpression()) callee = callee.get("expression");
      if (!callee.isFunctionExpression() && !callee.isArrowFunctionExpression()) return;
      const fn = callee.node;
      const blockers = [];
      if (fn.type !== "FunctionExpression") blockers.push("is an arrow function");
      if (fn.async || fn.generator) blockers.push("is async or a generator");
      if (fn.id) blockers.push(`has its own name ${fn.id.name}`);
      const uses = new Set();
      // `this` and `arguments` belong to the nearest function around them that is not an arrow function. When that is
      // a method or a function nested in the called one, they do not depend on where the called function stands. A
      // computed key and a decorator are evaluated outside their method, so they do not count as inside it.
      const belongsToNestedFunction = (inner) => {
        for (let child = inner, parent = inner.parentPath; parent && parent.node !== fn; child = parent, parent = parent.parentPath) {
          if (parent.isFunction() && !parent.isArrowFunctionExpression() && child.key !== "key" && child.listKey !== "decorators") return true;
        }
        return false;
      };
      callee.traverse({
        ThisExpression: (inner) => void (belongsToNestedFunction(inner) || uses.add("this")),
        Super: () => void uses.add("super"),
        MetaProperty: (inner) => void uses.add(`${inner.node.meta.name}.${inner.node.property.name}`),
        AwaitExpression: () => void uses.add("await"),
        YieldExpression: () => void uses.add("yield"),
        Identifier(inner) {
          if (!inner.isReferencedIdentifier()) return;
          if (inner.node.name === "eval" || (inner.node.name === "arguments" && !belongsToNestedFunction(inner))) uses.add(inner.node.name);
        },
      });
      if (uses.size) blockers.push("uses " + [...uses].join(", "));
      // Variables of the functions and blocks around the call that the function reads or writes.
      const closesOver = [];
      const programScope = path.scope.getProgramParent();
      for (let scope = path.scope; scope !== programScope; scope = scope.parent) {
        for (const [name, binding] of Object.entries(scope.bindings)) {
          if ([...binding.referencePaths, ...binding.constantViolations].some((use) => use === callee || use.findParent((parent) => parent === callee))) closesOver.push(name);
        }
      }
      if (closesOver.length) blockers.push("closes over " + closesOver.join(", "));
      const parenStart = code.indexOf("(", fn.start);
      if (fn.type === "FunctionExpression" && !/^function\s*$/.test(code.slice(fn.start, parenStart))) blockers.push("has something between `function` and its parameters");
      // The indentation to take off: that of the line its closing brace stands on.
      const closeLineStart = code.lastIndexOf("\n", fn.end - 1) + 1;
      const dedent = closeLineStart > fn.start && /^[ \t]*$/.test(code.slice(closeLineStart, fn.end - 1)) ? fn.end - 1 - closeLineStart : 0;
      const statement = path.findParent((parent) => parent.parentPath?.isProgram()).node;
      const parent = path.parentPath;
      const where = parent.isExpressionStatement() ? "a statement" : parent.isReturnStatement() ? "returned" : parent.isVariableDeclarator() ? "value of " + short(code.slice(parent.node.id.start, parent.node.id.end), 30) : parent.isAssignmentExpression() ? "assigned to " + short(code.slice(parent.node.left.start, parent.node.left.end), 30) : "inside " + parent.node.type;
      const params = fn.params.map((param) => code.slice(param.start, param.end));
      const args = path.node.arguments.map((arg) => code.slice(arg.start, arg.end));
      const notes = [];
      if (params.length && params.join() === args.join()) notes.push("its arguments are its parameter names");
      if (fn.body.type === "BlockStatement" && fn.body.body.length === 1 && fn.body.body[0].type === "ThrowStatement") notes.push("only throws");
      sites.push({ line: fn.loc.start.line, lines: fn.loc.end.line - fn.loc.start.line + 1, where, params, args, notes, blockers, fn, fnPath: callee, path, outerStart: outer.start, outerEnd: outer.end, parenStart, dedent, insertAt: statement.leadingComments?.[0]?.start ?? statement.start });
    },
  });
  // Line starts inside a token that spans lines (a template literal): their whitespace is text, not indentation.
  const keptLineStarts = new Set();
  for (const token of ast.tokens) {
    if (token.type === "CommentBlock" || token.type === "CommentLine") continue;
    for (let i = code.indexOf("\n", token.start); i !== -1 && i < token.end; i = code.indexOf("\n", i + 1)) keptLineStarts.add(i + 1);
  }
  sites.sort((a, b) => a.outerStart - b.outerStart);
  return { ast, sites, taken, keptLineStarts };
}

/** from..until of the code with up to `dedent` characters of indentation taken off every line that starts in it. */
function dedented(code, from, until, dedent, keptLineStarts) {
  if (!dedent) return code.slice(from, until);
  let out = "", at = from;
  for (let i = code.indexOf("\n", from); i !== -1 && i + 1 < until; i = code.indexOf("\n", i + 1)) {
    const lineStart = i + 1;
    let indentEnd = lineStart;
    if (!keptLineStarts.has(lineStart)) while (indentEnd < until && indentEnd - lineStart < dedent && (code[indentEnd] === " " || code[indentEnd] === "\t")) indentEnd++;
    out += code.slice(at, lineStart);
    at = indentEnd;
  }
  return out + code.slice(at, until);
}

const withoutPositions = (node) =>
  Array.isArray(node)
    ? node.map(withoutPositions)
    : node && typeof node === "object"
      ? Object.fromEntries(Object.keys(node).filter((key) => !["start", "end", "loc", "range", "extra", "leadingComments", "trailingComments", "innerComments", "comments", "tokens", "errors"].includes(key)).sort().map((key) => [key, withoutPositions(node[key])]))
      : typeof node === "bigint" ? String(node) : node;

/** The proof: `after` with each named declaration put back where it is called is the syntax tree of `before`. Returns a complaint or null. */
export function differsBeyondNaming(before, after, names) {
  const beforeAst = parse(before, { sourceType: "module" });
  const afterAst = parse(after, { sourceType: "module" });
  const declarations = new Map();
  afterAst.program.body = afterAst.program.body.filter((statement) => {
    if (statement.type !== "FunctionDeclaration" || !names.includes(statement.id.name)) return true;
    if (declarations.has(statement.id.name)) throw new Error(`${statement.id.name} is declared twice`);
    declarations.set(statement.id.name, statement);
    return false;
  });
  const calls = new Map(names.map((name) => [name, 0]));
  (function putBack(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(putBack);
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && declarations.has(node.callee.name)) {
      calls.set(node.callee.name, calls.get(node.callee.name) + 1);
      node.callee = { ...declarations.get(node.callee.name), type: "FunctionExpression", id: null };
    }
    for (const key of Object.keys(node)) if (key !== "loc") putBack(node[key]);
  })(afterAst.program);
  for (const name of names) {
    if (!declarations.has(name)) return `${name} is not declared at module level`;
    if (calls.get(name) !== 1) return `${name} is called ${calls.get(name)} times, not once`;
  }
  const globals = (ast) => {
    let found;
    traverse(ast, { Program(path) { found = Object.keys(path.scope.globals).sort().join(" "); path.stop(); } });
    return found;
  };
  if (globals(parse(before, { sourceType: "module" })) !== globals(parse(after, { sourceType: "module" }))) return "the names read as globals changed";
  return JSON.stringify(withoutPositions(beforeAst.program)) === JSON.stringify(withoutPositions(afterAst.program)) ? null : "the syntax tree is not the one before the run";
}

/**
 * names: { "<line>": "name" | ["name", "evidence"] }.
 * Returns { code, named: [{ line, name }], left: [sites without an entry] }. Throws on any refusal.
 */
export function nameCalledFunctions(code, names) {
  const { sites, taken, keptLineStarts } = findSites(code);
  const problems = [];
  const chosen = new Set();
  for (const line of Object.keys(names)) if (sites.filter((site) => String(site.line) === line).length !== 1) problems.push(`line ${line}: ${sites.some((site) => String(site.line) === line) ? "more than one function called at once starts there" : "no function called at once starts there"}`);
  for (const site of sites) {
    const value = names[site.line];
    if (value === undefined) continue;
    site.name = Array.isArray(value) ? value[0] : value;
    if (!/^[A-Za-z_$][\w$]*$/.test(site.name)) problems.push(`line ${site.line}: "${site.name}" is not an identifier`);
    else if (taken.has(site.name)) problems.push(`line ${site.line}: the file already has a variable or reads a global named ${site.name}`);
    else if (chosen.has(site.name)) problems.push(`line ${site.line}: ${site.name} is given twice`);
    for (const blocker of site.blockers) problems.push(`line ${site.line}: the function ${blocker}`);
    chosen.add(site.name);
  }
  if (problems.length) throw new Error("Cannot name:\n  " + problems.join("\n  "));
  const named = sites.filter((site) => site.name);
  // The named site a named site stands in, if any: it moves with that one's text.
  for (const site of named) site.parent = named.filter((other) => other !== site && other.fn.start < site.outerStart && site.outerEnd <= other.fn.end).pop() ?? null;
  // The text from..until as its owner keeps it: without the owner's indentation.
  const piece = (from, until, owner) => dedented(code, from, until, owner?.dedent ?? 0, keptLineStarts);
  // from..until with each named site directly inside the owner replaced by its name.
  const render = (from, until, owner) => {
    let out = "", at = from;
    for (const site of named) {
      if (site.parent !== owner || site.outerStart < from || site.outerEnd > until) continue;
      out += piece(at, site.outerStart, owner) + site.name;
      at = site.outerEnd;
    }
    return out + piece(at, until, owner);
  };
  let out = "", at = 0;
  for (const insertAt of [...new Set(named.map((site) => site.insertAt))].sort((a, b) => a - b)) {
    out += render(at, insertAt, null);
    // Inner functions first: a function is declared above the one that calls it.
    for (const site of named.filter((candidate) => candidate.insertAt === insertAt).sort((a, b) => a.fn.end - b.fn.end)) out += `function ${site.name}${render(site.parenStart, site.fn.end, site)}\n`;
    at = insertAt;
  }
  out += render(at, code.length, null);
  const complaint = differsBeyondNaming(code, out, named.map((site) => site.name));
  if (complaint) throw new Error("The rewrite is not a naming and was not written: " + complaint);
  return { code: out, named: named.map(({ line, name }) => ({ line, name })), left: sites.filter((site) => !site.name) };
}

/**
 * Removes the functions called at once that start on the given lines and are
 * the whole body of the function around them, with its own parameters.
 * Returns the new code. Throws on any refusal.
 */
export function unwrapOwnBodies(code, lines) {
  const { ast, sites, keptLineStarts } = findSites(code);
  const problems = [], edits = [];
  for (const line of lines) {
    const found = sites.filter((site) => site.line === line);
    const refuse = (why) => void problems.push(`line ${line}: ${why}`);
    if (found.length !== 1) { refuse(found.length ? "more than one function called at once starts there" : "no function called at once starts there"); continue; }
    const [site] = found;
    const { fn, path } = site;
    for (const blocker of site.blockers) refuse(`the function ${blocker}`);
    const statement = path.parentPath;
    const block = statement.parentPath;
    const outer = block?.parentPath;
    if (!(statement.isReturnStatement() || statement.isExpressionStatement()) || !block?.isBlockStatement() || !outer?.isFunction() || outer.node.body !== block.node) { refuse("the call is not a statement of a function's own body"); continue; }
    if (block.node.body.length !== 1 || block.node.directives.length) refuse("the call is not the only statement of the function around it");
    // Same names in the same order; a default only when both have the same literal.
    const describe = (param) => (param.type === "Identifier" ? param.name : param.type === "AssignmentPattern" && param.left.type === "Identifier" && /Literal$/.test(param.right.type) && param.right.type !== "TemplateLiteral" ? `${param.left.name} = ${code.slice(param.right.start, param.right.end)}` : null);
    const inner = fn.params.map(describe), around = outer.node.params.map(describe);
    if (inner.includes(null) || around.includes(null) || inner.join() !== around.join()) refuse("its parameters are not the parameters of the function around it");
    const passed = path.node.arguments.map((arg) => (arg.type === "Identifier" ? arg.name : null));
    if (passed.join() !== fn.params.map((param) => (param.type === "Identifier" ? param.name : param.left?.name)).join()) refuse("its arguments are not exactly its parameter names");
    if (statement.isExpressionStatement()) {
      let returnsValue = false;
      site.fnPath.get("body").traverse({ Function: (nested) => nested.skip(), ReturnStatement(inside) { if (inside.node.argument) returnsValue = true; } });
      if (returnsValue) refuse("the call is not returned and the function returns a value");
    }
    const closeLineStart = code.lastIndexOf("\n", block.node.end - 1) + 1;
    const outerIndent = closeLineStart > block.node.start && /^[ \t]*$/.test(code.slice(closeLineStart, block.node.end - 1)) ? block.node.end - 1 - closeLineStart : 0;
    edits.push({ from: block.node.start, until: block.node.end, text: dedented(code, fn.body.start, fn.body.end, Math.max(0, site.dedent - outerIndent), keptLineStarts), apply: () => void (outer.node.body = fn.body) });
  }
  if (problems.length) throw new Error("Cannot unwrap:\n  " + problems.join("\n  "));
  let out = code;
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    out = out.slice(0, edit.from) + edit.text + out.slice(edit.until);
    edit.apply();
  }
  const globals = (tree) => {
    let found;
    traverse(tree, { Program(path) { found = Object.keys(path.scope.globals).sort().join(" "); path.stop(); } });
    return found;
  };
  const after = parse(out, { sourceType: "module", createParenthesizedExpressions: true });
  if (JSON.stringify(withoutPositions(ast.program)) !== JSON.stringify(withoutPositions(after.program))) throw new Error("The rewrite is not an unwrapping and was not written: the syntax tree is not the one before with the inner body in place of the outer");
  if (globals(parse(code, { sourceType: "module" })) !== globals(parse(out, { sourceType: "module" }))) throw new Error("The rewrite was not written: the names read as globals changed");
  return out;
}

/** Text for --census. */
export function census(file, code) {
  return findSites(code).sites.map((site) => `${file}:${site.line}  ${site.lines} lines, ${site.where}; (${site.params.map((param) => short(param, 30)).join(", ")}) <- (${site.args.map((arg) => short(arg, 40)).join(", ")})${site.notes.length ? "; " + site.notes.join("; ") : ""}${site.blockers.length ? "  !! " + site.blockers.join("; ") : ""}`);
}

function selfTest() {
  const expectThrow = (code, names, part) => {
    let message = null;
    try { nameCalledFunctions(code, names); } catch (error) { message = error.message; }
    if (!message?.includes(part)) throw new Error(`expected a refusal with ${JSON.stringify(part)} for ${JSON.stringify(names)}, got ${JSON.stringify(message)}`);
  };
  const source = [
    'import { helper } from "./helper.js";',
    "var limit = 3;",
    "var Thing = class {",
    "  constructor(options) {",
    "    this.config = (function (overrides, scale) {",
    "      const text = `a",
    "      b ${overrides.name}`;",
    "      return {",
    "        size: (function (value) {",
    "          return helper(value) * limit;",
    "        })(overrides.size) * scale,",
    "        text: text,",
    "      };",
    "    })(options.overrides, next());",
    "    if (options.debug && (function (flag) { return flag === 1; })(options.debug)) {",
    "      (function () {",
    "        throw new TypeError(String(limit));",
    "      })();",
    "    }",
    "  }",
    "};",
    "export { Thing };",
    "",
  ].join("\n");
  const { code, named, left } = nameCalledFunctions(source, { 5: ["resolveConfig", "stored as config"], 9: "scaleSize", 15: ["isDebugFlag", "inferred"] });
  const expected = [
    'import { helper } from "./helper.js";',
    "var limit = 3;",
    "function scaleSize(value) {",
    "  return helper(value) * limit;",
    "}",
    "function resolveConfig(overrides, scale) {",
    "  const text = `a",
    "      b ${overrides.name}`;",
    "  return {",
    "    size: scaleSize(overrides.size) * scale,",
    "    text: text,",
    "  };",
    "}",
    "function isDebugFlag(flag) { return flag === 1; }",
    "var Thing = class {",
    "  constructor(options) {",
    "    this.config = resolveConfig(options.overrides, next());",
    "    if (options.debug && isDebugFlag(options.debug)) {",
    "      (function () {",
    "        throw new TypeError(String(limit));",
    "      })();",
    "    }",
    "  }",
    "};",
    "export { Thing };",
    "",
  ].join("\n");
  if (code !== expected) throw new Error("self-test: unexpected rewrite:\n" + code);
  if (named.length !== 3 || left.length !== 1 || left[0].line !== 16 || !left[0].notes.includes("only throws")) throw new Error("self-test: unexpected report " + JSON.stringify({ named, left: left.map((site) => site.line) }));
  // An inner function alone, and a top-level statement with a comment above it.
  const inner = nameCalledFunctions("// about x\nvar x = (function (a) {\n  return (function (b) {\n    return b + 1;\n  })(a);\n})(2);\n", { 3: "addOne" }).code;
  if (inner !== "function addOne(b) {\n  return b + 1;\n}\n// about x\nvar x = (function (a) {\n  return addOne(a);\n})(2);\n") throw new Error("self-test: inner function:\n" + inner);
  // Refusals.
  const inMethod = (body) => `var seen = 0;\nfunction outer(first) {\n  let local = first;\n  for (const item of first) {\n${body}\n  }\n  return local;\n}\n`;
  expectThrow(inMethod("    (function (a) { return a + local; })(1);"), { 5: "f" }, "closes over local");
  expectThrow(inMethod("    (function (a) { local = a; })(1);"), { 5: "f" }, "closes over local");
  expectThrow(inMethod("    (function (a) { local++; })(1);"), { 5: "f" }, "closes over local");
  expectThrow(inMethod("    (function (a) { return a + item + first; })(1);"), { 5: "f" }, "closes over item, first");
  expectThrow(inMethod("    (function (a) { return this; })(1);"), { 5: "f" }, "uses this");
  expectThrow(inMethod("    (function (a) { return () => arguments.length; })(1);"), { 5: "f" }, "uses arguments");
  // `this` and `arguments` of the function itself, which an arrow function inside it shares, are refused ...
  expectThrow(inMethod("    (function (a) { return () => this; })(1);"), { 5: "f" }, "uses this");
  expectThrow(inMethod("    (function (a) { return { get: () => this.a }; })(1);"), { 5: "f" }, "uses this");
  expectThrow(inMethod("    (function (a) { return arguments[0]; })(1);"), { 5: "f" }, "uses arguments");
  // ... and so are those in a computed key, which is evaluated outside its method.
  expectThrow(inMethod("    (function (a) { return { [this.key]() { return a; } }; })(1);"), { 5: "f" }, "uses this");
  expectThrow(inMethod("    (function (a) { return { [arguments.length]() { return a; } }; })(1);"), { 5: "f" }, "uses arguments");
  // Those of a method or of an ordinary function nested in it are that one's own.
  for (const body of [
    "    (function (a) { return { get() { return this.a; }, a: a }; })(1);",
    "    (function (a) { return { get() { return () => this.a; }, a: a }; })(1);",
    "    (function (a) { return function () { return this.a + arguments.length; }; })(1);",
    "    (function (a) { return class { get(b = this.a) { return b + arguments.length; } }; })(1);",
  ]) {
    const nested = nameCalledFunctions(inMethod(body), { 5: "f" }).code;
    if (!nested.startsWith("var seen = 0;\nfunction f(a) { return ") || !nested.includes("\n    f(1);\n")) throw new Error("self-test: a nested function's own this or arguments must be allowed:\n" + nested);
  }
  expectThrow(inMethod("    ((a) => a)(1);"), { 5: "f" }, "is an arrow function");
  expectThrow(inMethod("    (async function (a) { return a; })(1);"), { 5: "f" }, "async");
  expectThrow(inMethod("    (function again(a) { return a ? again(0) : 1; })(1);"), { 5: "f" }, "has its own name again");
  const fine = inMethod("    (function (a) { seen += a; return parseInt(a); })(1);");
  for (const [name, part] of [["seen", "already has a variable"], ["outer", "already has a variable"], ["local", "already has a variable"], ["item", "already has a variable"], ["parseInt", "already has a variable or reads a global"], ["not valid", "is not an identifier"]]) expectThrow(fine, { 5: name }, part);
  expectThrow(fine, { 4: "f" }, "no function called at once starts there");
  expectThrow(inMethod("    (function (a) { return a; })(1); (function (b) { return b; })(2);"), { 5: "f" }, "more than one");
  expectThrow("var a = (function (x) { return x; })(1);\nvar b = (function (y) { return y; })(2);\n", { 1: "same", 2: "same" }, "given twice");
  if (!nameCalledFunctions(fine, { 5: "count" }).code.includes("function count(a) { seen += a; return parseInt(a); }\nfunction outer(first) {")) throw new Error("self-test: a module-level variable and a global must be allowed inside");
  // The proof itself must see a change that is not a naming.
  for (const [before, after] of [
    ["var x = (function (a) { return a + 1; })(2);", "function f(a) { return a + 2; }\nvar x = f(2);"],
    ["var x = (function (a) { return a + 1; })(2);", "function f(a) { return a + 1; }\nvar x = f(3);"],
    ["var x = (function (a) { return a + 1; })(2);", "function f(a) { return a + 1; }\nvar x = f(2); f(2);"],
    ["var x = (function (a) { return a + 1; })(2);", "function f(a) { return a + 1; }\nvar x = (0, f)(2);"],
    ["var x = (function (a) { return `p\n q`; })(2);", "function f(a) { return `p\nq`; }\nvar x = f(2);"],
    ["var x = (function (a) { return g(a); })(2);", "function f(a) { return h(a); }\nvar x = f(2);"],
  ]) if (!differsBeyondNaming(before, after, ["f"])) throw new Error("self-test: the proof accepted " + after);
  if (differsBeyondNaming("var x = (function (a) { return a + 1; })(2);", "function f(a) {\n  return a + 1;\n}\nvar x = f(2);", ["f"])) throw new Error("self-test: the proof refused a naming");
  // Unwrapping a function that is the whole body of the function around it.
  const wrapped = [
    "var Clock = class {",
    "  phases(tick, shape = \"random\") {",
    "    return (function (tick, shape = \"random\") {",
    "      if (tick < 0) {",
    "        return [];",
    "      }",
    "      return [shape];",
    "    })(tick, shape);",
    "  }",
    "};",
    "function mark(actor) {",
    "  (function (actor) {",
    "    if (!actor) return;",
    "    actor.marked = true;",
    "  })(actor);",
    "}",
    "",
  ].join("\n");
  const unwrapped = unwrapOwnBodies(wrapped, [3, 12]);
  if (unwrapped !== ["var Clock = class {", "  phases(tick, shape = \"random\") {", "    if (tick < 0) {", "      return [];", "    }", "    return [shape];", "  }", "};", "function mark(actor) {", "  if (!actor) return;", "  actor.marked = true;", "}", ""].join("\n")) throw new Error("self-test: unwrap:\n" + unwrapped);
  const expectNoUnwrap = (code, line, part) => {
    let message = null;
    try { unwrapOwnBodies(code, [line]); } catch (error) { message = error.message; }
    if (!message?.includes(part)) throw new Error(`self-test: expected an unwrap refusal with ${JSON.stringify(part)}, got ${JSON.stringify(message)}`);
  };
  expectNoUnwrap("function f(a, b) {\n  return (function (b, a) { return a - b; })(b, a);\n}\n", 2, "not the parameters of the function around it");
  expectNoUnwrap("function f(a, b) {\n  return (function (a, b) { return a - b; })(b, a);\n}\n", 2, "not exactly its parameter names");
  expectNoUnwrap("function f(a, b) {\n  return (function (a, b = 2) { return a - b; })(a, b);\n}\n", 2, "not the parameters of the function around it");
  expectNoUnwrap("function f(a, b = 1) {\n  return (function (a, b = 2) { return a - b; })(a, b);\n}\n", 2, "not the parameters of the function around it");
  expectNoUnwrap("function f(a, b = g()) {\n  return (function (a, b = g()) { return a - b; })(a, b);\n}\n", 2, "not the parameters of the function around it");
  expectNoUnwrap("function f(a) {\n  return (function (a) { return a; })(a + 1);\n}\n", 2, "not exactly its parameter names");
  expectNoUnwrap("function f(a) {\n  (function (a) { return a; })(a);\n}\n", 2, "returns a value");
  expectNoUnwrap("function f(a) {\n  const b = a;\n  return (function (a) { return a; })(a);\n}\n", 3, "not the only statement");
  expectNoUnwrap("function f(a) {\n  return 1 + (function (a) { return a; })(a);\n}\n", 2, "not a statement of a function's own body");
  expectNoUnwrap("function f(a) {\n  if (a) {\n    return (function (a) { return a; })(a);\n  }\n}\n", 3, "not a statement of a function's own body");
  expectNoUnwrap("function f(a) {\n  return (function (a) { return this; })(a);\n}\n", 2, "uses this");
  expectNoUnwrap("function f(a) {\n  return (function (a) { return () => this; })(a);\n}\n", 2, "uses this");
  expectNoUnwrap("function f(a) {\n  return (function (a) { return arguments.length; })(a);\n}\n", 2, "uses arguments");
  // A method of an object inside the wrapper has a `this` of its own: the wrapper goes, the method stays as it is.
  const withMethod = unwrapOwnBodies("var Arena = class {\n  config(size) {\n    return (function (size) {\n      return {\n        size: size,\n        has(x) {\n          return this.size > x && arguments.length === 1;\n        },\n      };\n    })(size);\n  }\n};\n", [3]);
  if (withMethod !== "var Arena = class {\n  config(size) {\n    return {\n      size: size,\n      has(x) {\n        return this.size > x && arguments.length === 1;\n      },\n    };\n  }\n};\n") throw new Error("self-test: unwrap around a method that uses this:\n" + withMethod);
  expectNoUnwrap("function f(a) {\n  return (function (a) { return a; })(a);\n}\n", 1, "no function called at once starts there");
  const listed = census("a.js", source).join("\n");
  for (const part of ["a.js:5  10 lines, assigned to this.config; (overrides, scale) <- (options.overrides, next())", "a.js:16  3 lines, a statement; () <- (); only throws", "a.js:15  1 lines, inside LogicalExpression"]) if (!listed.includes(part)) throw new Error("self-test: census lacks " + JSON.stringify(part) + ":\n" + listed);
  console.log("name-called-functions self-test passed");
}

// Only as a command: another script may import census() and the two rewrites.
const args = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) ? process.argv.slice(2) : ["--imported"];
const [target, namesFile] = args.filter((arg) => !arg.startsWith("--"));
if (args.includes("--imported")) {
} else if (args.includes("--self-test")) selfTest();
else if (target && args.includes("--unwrap")) {
  // `namesFile` is the list of lines here: the first argument after the file that is not a flag.
  const lines = (namesFile ?? "").split(",").map(Number);
  const out = unwrapOwnBodies(readFileSync(target, "utf8"), lines);
  if (!args.includes("--dry")) writeFileSync(target, out);
  console.log(`${target}: ${lines.length} unwrapped (line ${lines.join(", ")})${args.includes("--dry") ? " (dry run: nothing written)" : ""}`);
} else if (target && (namesFile || args.includes("--census"))) {
  const given = target.replace(/\\/g, "/").replace(/\/$/, "");
  const isDirectory = existsSync(given) && statSync(given).isDirectory();
  const modules = isDirectory ? readdirSync(given).filter((name) => name.endsWith(".js")).sort() : [given];
  const pathOf = (module) => (isDirectory ? `${given}/${module}` : module);
  if (args.includes("--census")) {
    for (const module of modules) for (const line of census(pathOf(module), readFileSync(pathOf(module), "utf8"))) console.log(line);
  } else {
    const read = JSON.parse(readFileSync(namesFile, "utf8"));
    const perModule = isDirectory ? read : { [given]: read };
    for (const module of Object.keys(perModule)) if (!modules.includes(module)) throw new Error(`${pathOf(module)}: no such module`);
    // Every module first, so that nothing is written when one is refused.
    const results = Object.entries(perModule).map(([module, names]) => [module, names, nameCalledFunctions(readFileSync(pathOf(module), "utf8"), names)]);
    let total = 0, inferred = 0;
    for (const [module, names, { code, named, left }] of results) {
      if (!args.includes("--dry")) writeFileSync(pathOf(module), code);
      total += named.length;
      inferred += Object.values(names).filter((value) => !Array.isArray(value) || (value[1] ?? "inferred").startsWith("inferred")).length;
      console.log(`${pathOf(module)}: ${named.length} named (${named.map(({ line, name }) => `${line} ${name}`).join(", ")})${left.length ? `; left: ${left.map((site) => `line ${site.line}${site.blockers.length ? " (" + site.blockers.join("; ") + ")" : ""}`).join(", ")}` : ""}`);
    }
    console.log(`${total} functions named (${total - inferred} with evidence, ${inferred} inferred) in ${results.length} modules${args.includes("--dry") ? " (dry run: nothing written)" : ""}`);
  }
} else {
  console.error("usage: node tools/name-called-functions.mjs <file.js | directory> (--census | <names.json> [--dry]) | <file.js> --unwrap <line,line> [--dry] | --self-test");
  process.exit(1);
}
