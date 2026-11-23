// After code has moved out of a chunk into modules, the chunk imports it back
// and passes it on (`import { a } from "../engine/x.js"; export { a }`), and
// every other file still imports it from the chunk. This points those imports
// at the module that declares the code. Edits import lines only.
//
//   node tools/repoint-imports.mjs client/assets/rendering.js client/engine client/encounters [--only client/engine/,client/encounters/shared/] [--dry]
//   node tools/repoint-imports.mjs --self-test
//
// The first argument is the chunk; the others are the files or directories
// whose imports are rewritten (the chunk itself never is). --only limits the
// modules that imports may be pointed at.
//
//   import { defineNpc, logger, isNpcAlive as alive } from "../../assets/rendering.js";
// becomes
//   import { logger } from "../../assets/rendering.js";
//   import { isNpcAlive as alive } from "../../engine/npcState.js";
//   import { defineNpc } from "../shared/npcDefinitions.js";
// (a file that already imports from the module gets the names added to that
// import). The chunk keeps its exports.
//
// Refused: pointing an import at a module whose module-level code reads
// something it imports from the chunk. Such a module only works when the
// chunk is evaluated first, which a direct import no longer guarantees.
// A module that uses the chunk only inside functions is reported: load the
// application with that module imported first before relying on it.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const list = (specifiers) => (specifiers.join(", ").length <= 96 ? `{ ${specifiers.join(", ")} }` : `{\n  ${specifiers.join(",\n  ")},\n}`);
const relative = (fromFile, toFile) => {
  const path = posix.relative(posix.dirname(fromFile), toFile);
  return path.startsWith(".") ? path : "./" + path;
};
const resolveFrom = (file, source) => (/^\.\.?\//.test(source) ? posix.join(posix.dirname(file), source) : source);
const specifierText = (imported, local) => (imported === local ? local : `${imported} as ${local}`);

/** What the chunk passes on: exported name -> { module, name } (the module's own export name). */
export function passThroughs(chunk, code) {
  const { body } = parse(code, { sourceType: "module" }).program;
  const imported = new Map(); // local -> { module, name }
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration" || !/^\.\.?\//.test(statement.source.value)) continue;
    for (const specifier of statement.specifiers) if (specifier.type === "ImportSpecifier") imported.set(specifier.local.name, { module: resolveFrom(chunk, statement.source.value), name: specifier.imported.name });
  }
  const passed = new Map();
  for (const statement of body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration || statement.source) continue;
    for (const specifier of statement.specifiers) if (imported.has(specifier.local.name)) passed.set(specifier.exported.name, imported.get(specifier.local.name));
  }
  return passed;
}

/** How a module uses what it imports from the chunk: "none", "in functions" or "at module level". */
export function chunkUse(module, code, chunk) {
  const ast = parse(code, { sourceType: "module" });
  let use = "none";
  traverse(ast, {
    Program(path) {
      for (const binding of Object.values(path.scope.bindings)) {
        if (binding.kind !== "module" || resolveFrom(module, binding.path.parent.source.value) !== chunk) continue;
        for (const reference of binding.referencePaths) {
          if (reference.findParent((parent) => parent.isExportNamedDeclaration())) continue;
          if (!reference.getFunctionParent()) use = "at module level";
          else if (use === "none") use = "in functions";
        }
      }
      path.stop();
    },
  });
  return use;
}

/** Returns the rewritten code of one importer and the number of names repointed. */
export function repointImports(file, code, chunk, passed, allowed = () => true) {
  const { body } = parse(code, { sourceType: "module" }).program;
  const imports = body.filter((statement) => statement.type === "ImportDeclaration");
  const moves = new Map(); // module -> [specifier text]
  const edits = [];
  let count = 0;
  for (const statement of imports) {
    if (resolveFrom(file, statement.source.value) !== chunk) continue;
    const kept = [];
    for (const specifier of statement.specifiers) {
      const target = specifier.type === "ImportSpecifier" ? passed.get(specifier.imported.name) : undefined;
      if (!target || target.module === file || !allowed(target.module)) { kept.push(code.slice(specifier.start, specifier.end)); continue; }
      (moves.get(target.module) ?? moves.set(target.module, []).get(target.module)).push(specifierText(target.name, specifier.local.name));
      count++;
    }
    if (kept.length === statement.specifiers.length) continue;
    const end = code[statement.end] === "\n" && !kept.length ? statement.end + 1 : statement.end;
    edits.push({ start: statement.start, end, text: kept.length ? `import ${list(kept)} from ${JSON.stringify(statement.source.value)};` : "", anchor: true });
  }
  if (!count) return { code, count };
  // Names for a module the file already imports from join that import; the rest become new lines after the chunk's import.
  const fresh = [];
  for (const [module, specifiers] of moves) {
    const existing = imports.find((statement) => resolveFrom(file, statement.source.value) === module && statement.specifiers.every((specifier) => specifier.type === "ImportSpecifier"));
    if (existing) edits.push({ start: existing.start, end: existing.end, text: `import ${list([...existing.specifiers.map((specifier) => code.slice(specifier.start, specifier.end)), ...specifiers])} from ${JSON.stringify(existing.source.value)};` });
    else fresh.push(`import ${list(specifiers)} from ${JSON.stringify(relative(file, module))};`);
  }
  if (fresh.length) {
    const anchor = edits.find((edit) => edit.anchor);
    anchor.text = anchor.text ? anchor.text + "\n" + fresh.join("\n") : fresh.join("\n") + "\n";
  }
  let result = code;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, start) + text + result.slice(end);
  return { code: result, count };
}

function selfTest() {
  const chunk = "client/assets/x.js";
  const chunkCode = 'import { a, b as c } from "../engine/m.js";\nimport { z } from "./vendor.js";\nimport { p } from "../encounters/shared/n.js";\nvar own = 1;\nexport { a, c as d, own, z, p };\n';
  const passed = passThroughs(chunk, chunkCode);
  if (JSON.stringify([...passed]) !== JSON.stringify([["a", { module: "client/engine/m.js", name: "a" }], ["d", { module: "client/engine/m.js", name: "b" }], ["z", { module: "client/assets/vendor.js", name: "z" }], ["p", { module: "client/encounters/shared/n.js", name: "p" }]])) throw new Error("self-test: pass-throughs " + JSON.stringify([...passed]));
  const cases = [
    // names split over the chunk, a new module line and an existing import
    ["client/encounters/yama/boss.js", 'import { a, own, d as dd, p } from "../../assets/x.js";\nimport { q } from "../shared/n.js";\nvar v = a + own + dd + p + q;\n',
      'import { own } from "../../assets/x.js";\nimport { a, b as dd } from "../../engine/m.js";\nimport { q, p } from "../shared/n.js";\nvar v = a + own + dd + p + q;\n', 3],
    // nothing left to import from the chunk: its line goes
    ["client/engine/k.js", 'import { d } from "../assets/x.js";\nd();\n', 'import { b as d } from "./m.js";\nd();\n', 1],
    // a module is never pointed at itself; what the chunk declares itself stays
    ["client/engine/m.js", 'import { a, own } from "../assets/x.js";\n', 'import { a, own } from "../assets/x.js";\n', 0],
    // anything the chunk only passes on counts, a library chunk too (use --only to leave those)
    ["client/engine/k.js", 'import { z } from "../assets/x.js";\nimport { zz } from "../assets/vendor.js";\n', 'import { zz, z } from "../assets/vendor.js";\n', 1],
  ];
  for (const [file, before, after, count] of cases) {
    const result = repointImports(file, before, chunk, passed);
    if (result.code !== after || result.count !== count) throw new Error(`self-test: ${file}\n${result.code}`);
    parse(result.code, { sourceType: "module" });
  }
  const limited = repointImports("client/engine/k.js", 'import { a, p } from "../assets/x.js";\n', chunk, passed, (module) => module.startsWith("client/engine/"));
  if (limited.code !== 'import { p } from "../assets/x.js";\nimport { a } from "./m.js";\n') throw new Error("self-test: --only\n" + limited.code);
  const uses = [
    ['import { t } from "../assets/x.js";\nvar copy = t;\n', "at module level"],
    ['import { t } from "../assets/x.js";\nfunction f() { return t; }\n', "in functions"],
    ['import { t } from "./other.js";\nvar copy = t;\n', "none"],
    ['import { t } from "../assets/x.js";\nexport { t };\n', "none"],
  ];
  for (const [code, expected] of uses) if (chunkUse("client/engine/m.js", code, chunk) !== expected) throw new Error("self-test: chunkUse " + code);
  console.log("repoint-imports self-test passed");
}

const args = process.argv.slice(2);
const paths = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--only").map((arg) => arg.replace(/\\/g, "/"));
if (args.includes("--self-test")) selfTest();
else if (paths.length >= 2) {
  const [chunk, ...targets] = paths;
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  const passed = passThroughs(chunk, readFileSync(chunk, "utf8"));
  const problems = [], notes = [];
  for (const module of new Set([...passed.values()].map((target) => target.module))) {
    if (only && !only.some((prefix) => module.startsWith(prefix))) continue;
    if (!existsSync(module)) { problems.push(`${module}: the chunk imports from it, but it does not exist`); continue; }
    const use = chunkUse(module, readFileSync(module, "utf8"), chunk);
    if (use === "at module level") problems.push(`${module}: its module-level code reads an import from ${chunk}; it must be evaluated after the chunk`);
    else if (use === "in functions") notes.push(`${module} uses ${chunk} inside functions: load the application with this module imported first`);
  }
  if (problems.length) { console.error("Cannot repoint:\n  " + problems.join("\n  ")); process.exit(1); }
  const walk = (path) => (statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(posix.join(path, name))) : path.endsWith(".js") ? [path] : []);
  let total = 0, files = 0;
  for (const file of targets.flatMap(walk)) {
    if (file === chunk) continue;
    const before = readFileSync(file, "utf8");
    const { code, count } = repointImports(file, before, chunk, passed, (module) => !only || only.some((prefix) => module.startsWith(prefix)));
    if (!count) continue;
    if (!args.includes("--dry")) writeFileSync(file, code);
    total += count;
    files++;
    console.log(`${file}: ${count} names now imported from their modules`);
  }
  console.log(`${total} imported names in ${files} files repointed`);
  if (notes.length) console.log("To check:\n  " + notes.join("\n  "));
} else {
  console.error("usage: node tools/repoint-imports.mjs <chunk.js> <file or directory>... [--only prefix,prefix] [--dry] | --self-test");
  process.exit(1);
}
