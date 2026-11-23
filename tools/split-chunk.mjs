// Splits one client chunk into ES modules along a plan, moving its top-level
// statements as they are. The chunk itself becomes a file of re-exports, so
// whatever imports it keeps working.
//
//   node tools/split-chunk.mjs client/assets/x.js plan.json [--dry]
//   node tools/split-chunk.mjs client/assets/x.js plan.json --verify <git ref>
//   node tools/split-chunk.mjs --self-test
//
// plan.json: { "client/engine/supplies.js": ["itemRefSchema"], "client/engine/spells.js": ["RUNE_ITEM_IDS", "canCastSpell"] }
// Each name starts a run: the statement declaring it and every statement after
// it, up to the next name of the plan, go to that module, in their order.
//
// Each module gets the import lines it needs (the chunk's own imports, with
// the same local names, and the names it uses from sibling modules) and one
// export line. Nothing else is written or changed. Refused: a cycle between
// the new modules, an assignment to a binding that would live in another
// module (imports are read-only), and top-level code that reads a binding
// declared further down in another module (it would see a value where it saw
// `undefined`).
//
// --verify compares the chunk at <git ref> with the files on disk: every
// statement of the old chunk must be in exactly one module, character for
// character, in the old order, and the modules must hold nothing else but
// import and export lines.
//
//   node tools/split-chunk.mjs client/assets/x.js plan.json --extract [--dry]
//   node tools/split-chunk.mjs client/assets/x.js plan.json --extract --verify <git ref>
//
// --extract moves only the statements that declare the names of the plan
// (every name is listed; no runs) and leaves the rest of the chunk as it is.
// The plan may hold one more key, "+setup": a list of names whose set-up
// statements move with them: the top-level statements `helper(Name, ...)` and
// `alias = Name` that fill in a class the bundler declared empty
// (`var Flags = class {}; alias = Flags; defineField(Flags, "A", 1);`), and
// the top-level loops that fill a table (`for (...) Name.set(...)`).
// The chunk imports what it still uses from the new modules, and exports
// what they use from it: an import cycle. A module is evaluated before the
// body of the chunk that imports it, so its module-level code must not read
// a variable of the chunk. Refused: such a read, an assignment across files,
// and a module-level read that used to see `undefined` and would see a value.
// Printed for review: what a module's module-level code reaches in the chunk
// through functions it calls, and what the chunk's own module-level code
// reads from the modules (fine as long as only the chunk imports them).
//
// --extract --verify also checks the import and export lines: every old
// export is still there, every import names an export of the same local
// name (so each identifier means what it meant), and no file has a free
// identifier the old chunk did not have.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const isImport = (statement) => statement.type === "ImportDeclaration";
const isExportList = (statement) => statement.type === "ExportNamedDeclaration" && !statement.declaration;

/** The statements that are neither import nor export lines, each with the comments above it. */
function statementTexts(code) {
  const { body } = parse(code, { sourceType: "module" }).program;
  const texts = [];
  body.forEach((statement, index) => {
    if (isImport(statement) || isExportList(statement)) return;
    if (/^Export/.test(statement.type)) throw new Error(`line ${statement.loc.start.line}: only a list export ("export { a, b }") is supported`);
    texts.push({ statement, text: code.slice(index ? body[index - 1].end : 0, statement.end).trim() });
  });
  return { body, texts };
}

const relative = (fromFile, toFile) => {
  const path = posix.relative(posix.dirname(fromFile), toFile);
  return path.startsWith(".") ? path : "./" + path;
};
const list = (specifiers) => (specifiers.join(", ").length <= 96 ? `{ ${specifiers.join(", ")} }` : `{\n  ${specifiers.join(",\n  ")},\n}`);

/** Returns { files: { path: text }, summary: [lines] }. Throws on anything that would change behaviour. */
export function splitChunk(chunk, code, plan) {
  const { body, texts } = statementTexts(code);
  const startOf = new Map();
  for (const [module, names] of Object.entries(plan)) for (const name of names) startOf.set(name, module);
  const problems = [];
  // Statements to modules.
  let current;
  const seenStarts = new Set();
  for (const entry of texts) {
    const { statement } = entry;
    const declared = statement.type === "VariableDeclaration" ? statement.declarations.map((declarator) => declarator.id.name) : statement.id ? [statement.id.name] : [];
    for (const name of declared) if (startOf.has(name)) {
      current = startOf.get(name);
      seenStarts.add(name);
    }
    if (!current) problems.push(`line ${statement.loc.start.line}: before the first name of the plan`);
    entry.module = current;
  }
  for (const name of startOf.keys()) if (!seenStarts.has(name)) problems.push(`"${name}" of the plan is not a top-level declaration of ${chunk}`);
  if (problems.length) throw new Error("Cannot split:\n  " + problems.join("\n  "));
  const moduleAt = (position) => texts.find(({ statement }) => position >= statement.start && position < statement.end);

  // What each module needs from the chunk's imports and from its siblings.
  const modules = new Map([...new Set(texts.map((entry) => entry.module))].map((module) => [module, { external: new Map(), siblings: new Map(), exports: new Set() }]));
  const declaredIn = new Map(); // top-level name -> { module, order }
  const chunkExports = body.filter(isExportList).flatMap((statement) => statement.specifiers.map((specifier) => ({ local: specifier.local.name, exported: specifier.exported.name })));
  traverse(parse(code, { sourceType: "module" }), {
    Program(path) {
      for (const [name, binding] of Object.entries(path.scope.bindings)) {
        const uses = [...binding.referencePaths.map((reference) => ({ reference, write: false })), ...binding.constantViolations.map((reference) => ({ reference, write: true }))];
        if (binding.kind === "module") {
          const specifier = binding.path.node, source = binding.path.parent.source.value;
          const imported = specifier.type === "ImportSpecifier" ? (specifier.imported.name === name ? name : `${specifier.imported.name} as ${name}`) : specifier.type === "ImportDefaultSpecifier" ? `default as ${name}` : null;
          if (!imported) problems.push(`import * as ${name}: namespace imports are not supported`);
          for (const { reference } of uses) {
            const user = moduleAt(reference.node.start);
            if (!user) continue; // the export list
            const perSource = modules.get(user.module).external;
            (perSource.get(source) ?? perSource.set(source, new Set()).get(source)).add(imported);
          }
          continue;
        }
        const home = moduleAt(binding.identifier.start);
        declaredIn.set(name, home.module);
        for (const { reference, write } of uses) {
          const user = moduleAt(reference.node.start);
          if (!user || user.module === home.module) continue;
          const line = reference.node.loc.start.line;
          if (write && user.statement !== home.statement) problems.push(`line ${line}: assigns to "${name}", which would live in ${home.module}`);
          if (!reference.getFunctionParent() && binding.kind !== "hoisted" && user.statement.start < home.statement.start) problems.push(`line ${line}: top-level code reads "${name}" before its declaration on line ${home.statement.loc.start.line}, in another module`);
          const perModule = modules.get(user.module).siblings;
          (perModule.get(home.module) ?? perModule.set(home.module, new Set()).get(home.module)).add(name);
          modules.get(home.module).exports.add(name);
        }
      }
      path.stop();
    },
  });
  for (const { local } of chunkExports) {
    if (declaredIn.has(local)) modules.get(declaredIn.get(local)).exports.add(local);
    else problems.push(`export of "${local}", which the chunk does not declare, is not supported`);
  }
  // No cycles: a module may only use modules that never use it back.
  const state = new Map();
  const visit = (module, trail) => {
    if (state.get(module) === "done") return;
    if (state.get(module) === "open") return void problems.push("cycle: " + [...trail.slice(trail.indexOf(module)), module].map((step, index, steps) => (index ? `${step}` : step) + (steps[index + 1] ? ` (uses ${[...modules.get(step).siblings.get(steps[index + 1])].slice(0, 3).join(", ")})` : "")).join(" -> "));
    state.set(module, "open");
    for (const dependency of modules.get(module).siblings.keys()) visit(dependency, [...trail, module]);
    state.set(module, "done");
  };
  for (const module of modules.keys()) visit(module, []);
  if (problems.length) throw new Error("Cannot split:\n  " + [...new Set(problems)].join("\n  "));

  const order = [...declaredIn.keys()];
  const byOrder = (a, b) => order.indexOf(a) - order.indexOf(b);
  const chunkDir = posix.dirname(chunk);
  const files = {}, summary = [];
  for (const [module, { external, siblings, exports }] of modules) {
    const lines = [];
    for (const [source, specifiers] of external) lines.push(`import ${list([...specifiers])} from ${JSON.stringify(/^\.\.?\//.test(source) ? relative(module, posix.join(chunkDir, source)) : source)};`);
    for (const [sibling, names] of siblings) lines.push(`import ${list([...names].sort(byOrder))} from ${JSON.stringify(relative(module, sibling))};`);
    const own = texts.filter((entry) => entry.module === module);
    files[module] = (lines.length ? lines.join("\n") + "\n" : "") + own.map((entry) => entry.text).join("\n") + (exports.size ? `\nexport ${list([...exports].sort(byOrder))};` : "") + "\n";
    summary.push(`${module}: ${own.length} statements, ${files[module].split("\n").length - 1} lines, uses ${[...siblings].map(([sibling, names]) => `${posix.basename(sibling)} ${names.size}`).join(", ") || "no sibling"}, exports ${exports.size}`);
  }
  // The chunk: every module is loaded, and the old exports are passed on.
  const reexports = [...modules.keys()].map((module) => {
    const mine = chunkExports.filter(({ local }) => declaredIn.get(local) === module).map(({ local, exported }) => (local === exported ? local : `${local} as ${exported}`));
    return mine.length ? `export ${list(mine)} from ${JSON.stringify(relative(chunk, module))};` : `import ${JSON.stringify(relative(chunk, module))};`;
  });
  files[chunk] = `// This chunk was split into the modules below. It re-exports them for the\n// files that still import from here.\n${reexports.join("\n")}\n`;
  return { files, summary };
}

/** Checks that `files` hold exactly the statements of `original`, unchanged. Returns a sentence. */
export function verifyMove(original, files, chunk) {
  const old = statementTexts(original).texts.map((entry) => entry.text);
  const claimed = new Array(old.length).fill(false);
  let moved = 0;
  for (const [file, code] of Object.entries(files)) {
    if (file === chunk) {
      const rest = statementTexts(code).texts;
      if (rest.length) throw new Error(`${chunk} still has code: ${rest[0].text.slice(0, 60)}`);
      continue;
    }
    let from = 0;
    for (const { text } of statementTexts(code).texts) {
      const index = old.findIndex((candidate, position) => position >= from && !claimed[position] && candidate === text);
      if (index < 0) throw new Error(`${file}: not a statement of the old chunk, or out of order:\n${text.slice(0, 200)}`);
      claimed[index] = true;
      from = index + 1;
      moved++;
    }
  }
  if (claimed.includes(false)) throw new Error(`statement missing from the modules:\n${old[claimed.indexOf(false)].slice(0, 200)}`);
  return `${moved} statements of the old chunk are in ${Object.keys(files).length - 1} modules, character for character and in the old order; the modules hold nothing else but import and export lines`;
}

const declaredNames = (statement) =>
  statement.type === "VariableDeclaration" ? statement.declarations.map((declarator) => declarator.id.name) : statement.id ? [statement.id.name] : [];
const importSpecifierText = (specifier, local) =>
  specifier.type === "ImportSpecifier" ? (specifier.imported.name === local ? local : `${specifier.imported.name} as ${local}`) : specifier.type === "ImportDefaultSpecifier" ? `default as ${local}` : null;

/**
 * Moves the statements that declare the plan's names into modules and leaves
 * the rest in the chunk. Returns { files, summary, review }.
 */
export function extractModules(chunk, code, plan) {
  const { body, texts } = statementTexts(code);
  const { "+setup": setupNames = [], ...modulePlan } = plan;
  plan = modulePlan;
  const wanted = new Map();
  for (const [module, names] of Object.entries(plan)) for (const name of names) wanted.set(name, module);
  const problems = [], review = new Set(), found = new Set();
  for (const name of setupNames) if (!wanted.has(name)) problems.push(`"+setup" names "${name}", which the plan does not move`);
  // A top-level loop that fills a set-up name: `for (...) Name.method(...)` or `for (...) Name[key] = ...`.
  const setupLoops = new Map(); // start of the loop -> the name
  if (setupNames.length)
    traverse(parse(code, { sourceType: "module" }), {
      Program(path) {
        for (const name of setupNames) for (const reference of path.scope.bindings[name]?.referencePaths ?? []) {
          const member = reference.parentPath, user = member.parentPath;
          if (!member.isMemberExpression({ object: reference.node }) || !(user.isCallExpression({ callee: member.node }) || user.isAssignmentExpression({ left: member.node }))) continue;
          const statement = reference.findParent((parent) => parent.parentPath?.isProgram());
          if (!statement?.isLoop()) continue;
          const other = setupLoops.get(statement.node.start);
          if (other && other !== name) problems.push(`line ${statement.node.loc.start.line}: a loop fills both "${other}" and "${name}" of "+setup"`);
          setupLoops.set(statement.node.start, name);
        }
        path.stop();
      },
    });
  // The name a set-up statement fills in: `helper(Name, ...)`, `alias = Name`, or such a loop.
  const setupTarget = (statement) => {
    if (setupLoops.has(statement.start)) return setupLoops.get(statement.start);
    if (statement.type !== "ExpressionStatement") return undefined;
    const { expression } = statement;
    const target = expression.type === "CallExpression" ? expression.arguments[0] : expression.type === "AssignmentExpression" && expression.operator === "=" ? expression.right : undefined;
    return target?.type === "Identifier" && setupNames.includes(target.name) ? target.name : undefined;
  };
  const entryOf = new Map();
  for (const entry of texts) {
    const declared = declaredNames(entry.statement);
    const setup = setupTarget(entry.statement);
    const homes = new Set(setup ? [wanted.get(setup)] : declared.map((name) => wanted.get(name)));
    if (homes.size > 1) problems.push(`line ${entry.statement.loc.start.line}: declares ${declared.join(", ")}, which the plan does not keep together`);
    entry.module = [...homes][0]; // undefined: stays in the chunk
    for (const name of declared) if (wanted.has(name)) found.add(name);
    entryOf.set(entry.statement, entry);
  }
  for (const name of wanted.keys()) if (!found.has(name)) problems.push(`"${name}" of the plan is not a top-level declaration of ${chunk}`);
  if (problems.length) throw new Error("Cannot extract:\n  " + problems.join("\n  "));
  const entryAt = (position) => {
    let low = 0, high = texts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (texts[middle].statement.start <= position) low = middle;
      else high = middle - 1;
    }
    const { statement } = texts[low];
    return position >= statement.start && position < statement.end ? texts[low] : undefined; // undefined: an import or export line
  };

  const modules = new Map(Object.keys(plan).map((module) => [module, { external: new Map(), fromChunk: new Set(), siblings: new Map(), exports: new Set() }]));
  const add = (map, key, name) => (map.get(key) ?? map.set(key, new Set()).get(key)).add(name);
  const chunkUses = new Map(); // module -> names the chunk still uses
  const chunkExports = body.filter(isExportList).flatMap((statement) => statement.specifiers.map((specifier) => ({ local: specifier.local.name, exported: specifier.exported.name })));
  const order = [];
  traverse(parse(code, { sourceType: "module" }), {
    Program(path) {
      const top = path.scope.bindings;
      const topBinding = (reference) => {
        const binding = reference.scope.getBinding(reference.node.name);
        return binding && binding === top[reference.node.name] ? binding : undefined;
      };
      for (const [name, binding] of Object.entries(top)) {
        const uses = [...binding.referencePaths.map((reference) => ({ reference, write: false })), ...binding.constantViolations.map((reference) => ({ reference, write: true }))];
        if (binding.kind === "module") {
          const imported = importSpecifierText(binding.path.node, name), source = binding.path.parent.source.value;
          for (const { reference } of uses) {
            const user = entryAt(reference.node.start);
            if (!user?.module) continue;
            if (!imported) problems.push(`import * as ${name}: namespace imports are not supported`);
            add(modules.get(user.module).external, source, imported);
          }
          continue;
        }
        order.push(name);
        const home = entryAt(binding.identifier.start);
        for (const { reference, write } of uses) {
          const user = entryAt(reference.node.start);
          if (user?.module === home.module) continue;
          const line = reference.node.loc.start.line;
          if (write && user !== home) problems.push(`line ${line}: assigns to "${name}", which would live in ${home.module ?? chunk}`);
          if (user && !reference.getFunctionParent() && binding.kind !== "hoisted") {
            const sawUndefined = user.statement.start < home.statement.start;
            if (user.module && !home.module) problems.push(`line ${line}: module-level code of ${user.module} reads "${name}", which ${chunk} has not set yet when the module is evaluated`);
            else if (sawUndefined) problems.push(`line ${line}: module-level code reads "${name}" before its declaration on line ${home.statement.loc.start.line}, in another file`);
            else if (!user.module) review.add(`${chunk} reads "${name}" of ${home.module} while it is evaluated (line ${line}): fine while only ${chunk} imports the module`);
          }
          if (user?.module && home.module) {
            add(modules.get(user.module).siblings, home.module, name);
            modules.get(home.module).exports.add(name);
          } else if (user?.module) modules.get(user.module).fromChunk.add(name);
          else {
            add(chunkUses, home.module, name);
            modules.get(home.module).exports.add(name);
          }
        }
      }
      // What a module's module-level code reaches in the chunk through the
      // functions it calls or hands to a call: those run before the chunk's body.
      const functionOf = (binding) => {
        const node = binding.path.node;
        if (node.type === "FunctionDeclaration") return binding.path;
        const init = node.type === "VariableDeclarator" ? binding.path.get("init") : undefined;
        if (init?.isFunction()) return init;
        if (init?.isClassExpression()) return init.get("body.body").find((member) => member.node.kind === "constructor");
        return undefined;
      };
      const isCalled = (reference) => {
        const parent = reference.parent;
        return (parent.type === "CallExpression" || parent.type === "NewExpression" || parent.type === "OptionalCallExpression") && (parent.callee === reference.node || parent.arguments.includes(reference.node));
      };
      const reach = (start, from, seen) => {
        const visit = (reference) => {
          const binding = topBinding(reference);
          if (!binding || binding.kind === "module") return;
          const home = entryAt(binding.identifier.start);
          if (!home.module && binding.kind !== "hoisted" && reference.getFunctionParent())
            review.add(`${from.module}: evaluating line ${from.statement.loc.start.line} may read "${reference.node.name}" of ${chunk} (line ${reference.node.loc.start.line}), which is not set yet`);
          const fn = isCalled(reference) && functionOf(binding);
          if (fn && !seen.has(fn.node)) {
            seen.add(fn.node);
            reach(fn, from, seen);
          }
        };
        start.traverse({
          Function(inner) {
            if (!isCalled(inner)) inner.skip();
          },
          Identifier(inner) {
            if (inner.isReferencedIdentifier()) visit(inner);
          },
        });
      };
      for (const statement of path.get("body")) {
        const entry = entryAt(statement.node.start); // by position: this is a second parse
        if (entry?.module && !statement.isFunctionDeclaration()) reach(statement, entry, new Set()); // declaring a function runs nothing
      }
      path.stop();
    },
  });
  const exportedAs = new Map(chunkExports.map(({ local, exported }) => [local, exported]));
  const taken = new Set(chunkExports.map(({ exported }) => exported));
  const newExports = [];
  for (const { fromChunk } of modules.values()) for (const name of fromChunk) {
    if (exportedAs.has(name)) continue;
    if (taken.has(name)) problems.push(`"${name}" must be exported, but ${chunk} already exports another binding under that name`);
    exportedAs.set(name, name);
    taken.add(name);
    newExports.push(name);
  }
  const cycleState = new Map();
  const visitModule = (module, trail) => {
    if (cycleState.get(module) === "done") return;
    if (cycleState.get(module) === "open") return void problems.push("cycle: " + [...trail.slice(trail.indexOf(module)), module].join(" -> "));
    cycleState.set(module, "open");
    for (const dependency of modules.get(module).siblings.keys()) visitModule(dependency, [...trail, module]);
    cycleState.set(module, "done");
  };
  for (const module of modules.keys()) visitModule(module, []);
  if (problems.length) throw new Error("Cannot extract:\n  " + [...new Set(problems)].join("\n  "));

  const byOrder = (a, b) => order.indexOf(a) - order.indexOf(b);
  const chunkDir = posix.dirname(chunk);
  const files = {}, summary = [];
  for (const [module, { external, fromChunk, siblings, exports }] of modules) {
    const lines = [];
    for (const [source, specifiers] of external) lines.push(`import ${list([...specifiers])} from ${JSON.stringify(/^\.\.?\//.test(source) ? relative(module, posix.join(chunkDir, source)) : source)};`);
    if (fromChunk.size) lines.push(`import ${list([...fromChunk].sort(byOrder).map((name) => (exportedAs.get(name) === name ? name : `${exportedAs.get(name)} as ${name}`)))} from ${JSON.stringify(relative(module, chunk))};`);
    for (const [sibling, names] of siblings) lines.push(`import ${list([...names].sort(byOrder))} from ${JSON.stringify(relative(module, sibling))};`);
    const own = texts.filter((entry) => entry.module === module);
    files[module] = (lines.length ? lines.join("\n") + "\n" : "") + own.map((entry) => entry.text).join("\n") + (exports.size ? `\nexport ${list([...exports].sort(byOrder))};` : "") + "\n";
    summary.push(`${module}: ${own.length} statements, ${files[module].split("\n").length - 1} lines, uses ${fromChunk.size} of ${posix.basename(chunk)}${[...siblings].map(([sibling, names]) => `, ${posix.basename(sibling)} ${names.size}`).join("")}, exports ${exports.size}`);
  }
  // The chunk: cut the moved statements, import what it still uses, export what the modules use.
  const edits = []; // { start, end, text }
  body.forEach((statement, index) => {
    if (entryOf.get(statement)?.module) edits.push({ start: index ? body[index - 1].end : 0, end: statement.end, text: "" });
  });
  const lastImport = body.filter(isImport).at(-1);
  const imports = [...chunkUses].map(([module, names]) => `import ${list([...names].sort(byOrder))} from ${JSON.stringify(relative(chunk, module))};`);
  if (imports.length) edits.push({ start: lastImport ? lastImport.end : 0, end: lastImport ? lastImport.end : 0, text: (lastImport ? "\n" : "") + imports.join("\n") + (lastImport ? "" : "\n") });
  if (newExports.length) {
    const lastExport = body.filter(isExportList).at(-1);
    if (!lastExport) edits.push({ start: code.length, end: code.length, text: `export ${list(newExports)};\n` });
    else {
      const text = code.slice(lastExport.start, lastExport.end);
      const head = text.replace(/,?\s*\}\s*;?$/, "");
      edits.push({ start: lastExport.start, end: lastExport.end, text: text.includes("\n") ? head + newExports.map((name) => `,\n  ${name}`).join("") + ",\n};" : head + newExports.map((name) => `, ${name}`).join("") + " };" });
    }
  }
  let rest = code;
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start || b.end - a.end)) rest = rest.slice(0, start) + text + rest.slice(end);
  files[chunk] = rest;
  summary.push(`${chunk}: ${texts.filter((entry) => !entry.module).length} statements stay, imports ${[...chunkUses.values()].reduce((sum, names) => sum + names.size, 0)} names from the modules, ${newExports.length} new exports (${newExports.join(", ") || "none"})`);
  return { files, summary, review: [...review] };
}

/** Checks an extraction: the statements are the old ones, and every identifier still means what it meant. Returns a sentence. */
export function verifyExtract(original, files, chunk) {
  const old = statementTexts(original);
  const claimed = new Array(old.texts.length).fill(false);
  for (const [file, code] of Object.entries(files)) {
    let from = 0;
    for (const { text } of statementTexts(code).texts) {
      const index = old.texts.findIndex((candidate, position) => position >= from && !claimed[position] && candidate.text === text);
      if (index < 0) throw new Error(`${file}: not a statement of the old chunk, or out of order:\n${text.slice(0, 200)}`);
      claimed[index] = true;
      from = index + 1;
    }
  }
  if (claimed.includes(false)) throw new Error(`statement missing from the files:\n${old.texts[claimed.indexOf(false)].text.slice(0, 200)}`);
  // Imports, exports and free identifiers of a file.
  const facts = (code) => {
    const { body } = parse(code, { sourceType: "module" }).program;
    const exports = new Map(body.filter(isExportList).flatMap((statement) => statement.specifiers.map((specifier) => [specifier.exported.name, specifier.local.name])));
    const imports = body.filter(isImport).flatMap((statement) => statement.specifiers.map((specifier) => ({ source: statement.source.value, imported: importSpecifierText(specifier, specifier.local.name), local: specifier.local.name })));
    let free;
    traverse(parse(code, { sourceType: "module" }), { Program(path) { free = Object.keys(path.scope.globals); path.stop(); } });
    return { exports, imports, free, declared: new Set(body.flatMap(declaredNames)) };
  };
  const resolved = (file, source) => (/^\.\.?\//.test(source) ? posix.join(posix.dirname(file), source) : source);
  const before = facts(original);
  const oldImports = new Set(before.imports.map(({ source, imported }) => resolved(chunk, source) + " " + imported));
  const after = new Map(Object.entries(files).map(([file, code]) => [file, facts(code)]));
  for (const [exported, local] of before.exports) if (after.get(chunk).exports.get(exported) !== local) throw new Error(`${chunk} no longer exports ${local} as ${exported}`);
  let checked = 0;
  for (const [file, { imports, free }] of after) {
    for (const name of free) if (!before.free.includes(name)) throw new Error(`${file}: "${name}" is not declared or imported`);
    for (const { source, imported, local } of imports) {
      const target = after.get(resolved(file, source));
      if (!target) {
        if (!oldImports.has(resolved(file, source) + " " + imported)) throw new Error(`${file}: import of ${imported} from ${source} is not an import of the old chunk`);
      } else {
        const name = imported.split(" as ")[0];
        if (target.exports.get(name) !== local) throw new Error(`${file}: imports ${imported} from ${source}, which exports ${target.exports.get(name) ?? "nothing"} under that name`);
        if (!target.declared.has(local) && !target.imports.some((other) => other.local === local)) throw new Error(`${source} exports ${local} without declaring it`);
      }
      checked++;
    }
  }
  const moved = [...after].filter(([file]) => file !== chunk).reduce((sum, [file]) => sum + statementTexts(files[file]).texts.length, 0);
  return `${old.texts.length} statements of the old chunk: ${moved} are in ${after.size - 1} new modules and ${old.texts.length - moved} are still in ${chunk}, character for character and in the old order; the files hold nothing else but import and export lines; all old exports are kept; ${checked} imported names resolve to the declarations they named before; no new free identifier`;
}

function selfTestExtract() {
  const code = [
    'import { z } from "./vendor.js";',
    "function helper() { return limit + z; }",
    "var limit = 3;",
    "// the lobby",
    "var Lobby = class { arena() { return (cache ??= helper() + size + flags.OBJECT); } };",
    "var size = 64;",
    "var cache = null;",
    "var flags = { OBJECT: 1 };",
    'import { extend } from "/lobby/gateways.js";',
    "var registry = [{ factory: () => new Lobby(extend) }, size];",
    "export { registry, flags as f };",
  ].join("\n");
  const plan = { "client/encounters/lobby/Lobby.js": ["Lobby", "size", "cache"] };
  const { files, review } = extractModules("client/assets/x.js", code, plan);
  const expected = {
    "client/encounters/lobby/Lobby.js": 'import { helper, f as flags } from "../../assets/x.js";\n// the lobby\nvar Lobby = class { arena() { return (cache ??= helper() + size + flags.OBJECT); } };\nvar size = 64;\nvar cache = null;\nexport { Lobby, size };\n',
    "client/assets/x.js": 'import { z } from "./vendor.js";\nfunction helper() { return limit + z; }\nvar limit = 3;\nvar flags = { OBJECT: 1 };\nimport { extend } from "/lobby/gateways.js";\nimport { Lobby, size } from "../encounters/lobby/Lobby.js";\nvar registry = [{ factory: () => new Lobby(extend) }, size];\nexport { registry, flags as f, helper };',
  };
  for (const [file, text] of Object.entries(expected)) if (files[file] !== text) throw new Error(`self-test: ${file}\n${files[file]}`);
  if (review.length !== 1 || !review[0].includes('reads "size"')) throw new Error("self-test: review " + review.join("; "));
  verifyExtract(code, files, "client/assets/x.js");
  const module = "client/encounters/lobby/Lobby.js";
  for (const tamper of [
    (f) => ({ ...f, [module]: f[module].replace("size + flags", "size - flags") }),
    (f) => ({ ...f, [module]: f[module].replace("f as flags", "flags") }),
    (f) => ({ ...f, [module]: f[module].replace("helper, ", "") }),
    (f) => ({ ...f, "client/assets/x.js": f["client/assets/x.js"].replace("flags as f, ", "") }),
    (f) => ({ ...f, "client/assets/x.js": f["client/assets/x.js"].replace("var limit = 3;\n", "") }),
    (f) => ({ ...f, [module]: f[module] + "var extra = 1;\n" }),
  ]) {
    let threw = false;
    try { verifyExtract(code, tamper(files), "client/assets/x.js"); } catch { threw = true; }
    if (!threw) throw new Error("self-test: a changed extraction passed verification");
  }
  // Refused: module-level code that needs the chunk, an assignment across files, a read that saw undefined, a split declaration.
  for (const [bad, source] of [
    [{ "m.js": ["Boss"] }, "var Base = class {};\nvar Boss = class extends Base {};\nexport { Boss };"],
    [{ "m.js": ["counter"] }, "let counter = 0;\nfunction bump() { counter++; }\nexport { bump };"],
    [{ "m.js": ["later"] }, "var first = later;\nvar later = 1;\nexport { first };"],
    [{ "m.js": ["a"] }, "var a = 1, b = 2;\nexport { a, b };"],
    [{ "m.js": ["nope"] }, code],
  ]) {
    let threw = false;
    try { extractModules("client/assets/x.js", source, bad); } catch { threw = true; }
    if (!threw) throw new Error("self-test: expected a refusal for " + JSON.stringify(bad));
  }
  // Reported: module-level code that calls a function of the chunk which reads a variable of the chunk.
  const reached = extractModules("client/assets/x.js", "var table = [1];\nfunction build() { return table.length; }\nvar built = build();\nexport { built };", { "m.js": ["built"] }).review;
  if (!reached.some((line) => line.includes('may read "table"'))) throw new Error("self-test: reach " + reached.join("; "));
  const declared = extractModules("client/assets/x.js", "var table = [1];\nfunction build() { return table.length; }\nexport { build };", { "m.js": ["build"] }).review;
  if (declared.length) throw new Error("self-test: a function declaration evaluates nothing: " + declared.join("; "));
  // "+setup": the statements that fill in a class move with it, in their order; without it they stay and the alias cannot be assigned.
  const flagsCode = [
    "function define(target, key, value) { target[key] = value; }",
    "var alias;",
    "var Flags = class {};",
    "var other = 1;",
    "alias = Flags;",
    'define(Flags, "A", 1);',
    'define(Flags, "B", alias.A | 2);',
    'define(other, "A", 1);',
    "export { Flags };",
  ].join("\n");
  const flags = extractModules("client/assets/x.js", flagsCode, { "client/engine/flags.js": ["alias", "Flags"], "+setup": ["Flags"] }).files;
  const flagsExpected = {
    "client/engine/flags.js": 'import { define } from "../assets/x.js";\nvar alias;\nvar Flags = class {};\nalias = Flags;\ndefine(Flags, "A", 1);\ndefine(Flags, "B", alias.A | 2);\nexport { Flags };\n',
    "client/assets/x.js": 'import { Flags } from "../engine/flags.js";\nfunction define(target, key, value) { target[key] = value; }\nvar other = 1;\ndefine(other, "A", 1);\nexport { Flags, define };',
  };
  for (const [file, text] of Object.entries(flagsExpected)) if (flags[file] !== text) throw new Error("self-test: " + file + "\n" + flags[file]);
  verifyExtract(flagsCode, flags, "client/assets/x.js");
  for (const bad of [{ "m.js": ["alias", "Flags"] }, { "m.js": ["Flags"], "+setup": ["Flags"] }, { "m.js": ["Flags"], "+setup": ["alias"] }]) {
    let threw = false;
    try { extractModules("client/assets/x.js", flagsCode, bad); } catch { threw = true; }
    if (!threw) throw new Error("self-test: expected a refusal for " + JSON.stringify(bad));
  }
  // "+setup": a top-level loop that fills a table moves with it; a loop that only reads it stays.
  const loopCode = [
    "var pairs = [[1, 2]];",
    "var lookup = new Map();",
    "for (const [key, value] of pairs) {\n  lookup.set(key, value);\n}",
    "var sizes = [];",
    "for (const pair of pairs) sizes.push(lookup.size + pair.length);",
    "export { lookup, sizes };",
  ].join("\n");
  const loops = extractModules("client/assets/x.js", loopCode, { "client/engine/lookup.js": ["pairs", "lookup"], "+setup": ["lookup"] }).files;
  const loopsExpected = {
    "client/engine/lookup.js": "var pairs = [[1, 2]];\nvar lookup = new Map();\nfor (const [key, value] of pairs) {\n  lookup.set(key, value);\n}\nexport { pairs, lookup };\n",
    "client/assets/x.js": 'import { pairs, lookup } from "../engine/lookup.js";\n\nvar sizes = [];\nfor (const pair of pairs) sizes.push(lookup.size + pair.length);\nexport { lookup, sizes };',
  };
  for (const [file, text] of Object.entries(loopsExpected)) if (loops[file] !== text) throw new Error("self-test: " + file + "\n" + loops[file]);
  verifyExtract(loopCode, loops, "client/assets/x.js");
  // Refused: a loop that fills the table from a variable that stays in the chunk.
  let loopThrew = false;
  try { extractModules("client/assets/x.js", loopCode, { "m.js": ["lookup"], "+setup": ["lookup"] }); } catch { loopThrew = true; }
  if (!loopThrew) throw new Error("self-test: a loop that reads the chunk moved");
  console.log("split-chunk --extract self-test passed");
}

function selfTest() {
  const code = [
    'import { z, q as r } from "./vendor.js";',
    'import { a as b } from "/abs/other.js";',
    "// supplies",
    "var schema = z.object({});",
    "function parse(input) { return schema.parse(input) + limit; }",
    "var limit = 3;",
    "/* kinds */",
    "var kinds = [r, b];",
    "kinds.push(parse);",
    "class Engine { run() { return parse(kinds) + helper(); } }",
    "function helper() { return limit; }",
    "export { Engine, parse as p };",
  ].join("\n");
  const plan = { "client/engine/supplies.js": ["schema"], "client/engine/sub/kinds.js": ["kinds"], "client/engine/Engine.js": ["Engine"] };
  const { files } = splitChunk("client/assets/x.js", code, plan);
  const expected = {
    "client/engine/supplies.js": 'import { z } from "../assets/vendor.js";\n// supplies\nvar schema = z.object({});\nfunction parse(input) { return schema.parse(input) + limit; }\nvar limit = 3;\nexport { parse, limit };\n',
    "client/engine/sub/kinds.js": 'import { q as r } from "../../assets/vendor.js";\nimport { a as b } from "/abs/other.js";\nimport { parse } from "../supplies.js";\n/* kinds */\nvar kinds = [r, b];\nkinds.push(parse);\nexport { kinds };\n',
    "client/engine/Engine.js": 'import { parse, limit } from "./supplies.js";\nimport { kinds } from "./sub/kinds.js";\nclass Engine { run() { return parse(kinds) + helper(); } }\nfunction helper() { return limit; }\nexport { Engine };\n',
    "client/assets/x.js": '// This chunk was split into the modules below. It re-exports them for the\n// files that still import from here.\nexport { parse as p } from "../engine/supplies.js";\nimport "../engine/sub/kinds.js";\nexport { Engine } from "../engine/Engine.js";\n',
  };
  for (const [file, text] of Object.entries(expected)) if (files[file] !== text) throw new Error(`self-test: ${file}\n${files[file]}`);
  if (Object.keys(files).length !== 4) throw new Error("self-test: files " + Object.keys(files));
  verifyMove(code, files, "client/assets/x.js");
  for (const tamper of [(f) => ({ ...f, "client/engine/Engine.js": f["client/engine/Engine.js"].replace("+ helper()", "+ helper(1)") }), (f) => ({ ...f, "client/engine/supplies.js": f["client/engine/supplies.js"].replace("var limit = 3;\n", "") }), (f) => ({ ...f, "client/engine/supplies.js": f["client/engine/supplies.js"] + "var extra = 1;\n" })]) {
    let threw = false;
    try { verifyMove(code, tamper(files), "client/assets/x.js"); } catch { threw = true; }
    if (!threw) throw new Error("self-test: a changed module passed verification");
  }
  // Refused: a cycle, an assignment across modules, a top-level read of a later module's variable, a name the chunk lacks.
  for (const [bad, source] of [
    [{ "a.js": ["schema"], "b.js": ["limit"] }, code],
    [{ "a.js": ["counter"], "b.js": ["bump"] }, "let counter = 0;\nfunction bump() { counter++; }\nexport { bump };"],
    [{ "a.js": ["first"], "b.js": ["later"] }, "var first = later;\nvar later = 1;\nexport { first };"],
    [{ "a.js": ["nope"] }, code],
  ]) {
    let threw = false;
    try { splitChunk("client/assets/x.js", source, bad); } catch { threw = true; }
    if (!threw) throw new Error("self-test: expected a refusal for " + JSON.stringify(bad));
  }
  console.log("split-chunk self-test passed");
}

const args = process.argv.slice(2);
const [chunkArg, planFile] = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--verify");
if (args.includes("--self-test")) {
  selfTest();
  selfTestExtract();
} else if (chunkArg && planFile) {
  const chunk = chunkArg.replace(/\\/g, "/");
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  const extract = args.includes("--extract");
  if (args.includes("--verify")) {
    const original = execFileSync("git", ["show", `${args[args.indexOf("--verify") + 1]}:${chunk}`], { encoding: "utf8", maxBuffer: 1 << 28 });
    console.log((extract ? verifyExtract : verifyMove)(original, Object.fromEntries([chunk, ...Object.keys(plan).filter((key) => key !== "+setup")].map((file) => [file, readFileSync(file, "utf8")])), chunk));
  } else {
    const { files, summary, review = [] } = (extract ? extractModules : splitChunk)(chunk, readFileSync(chunk, "utf8"), plan);
    console.log(summary.join("\n"));
    if (review.length) console.log("To review:\n  " + review.join("\n  "));
    if (!args.includes("--dry")) for (const [file, text] of Object.entries(files)) {
      if (file !== chunk && existsSync(file)) throw new Error(file + " already exists");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  }
} else {
  console.error("usage: node tools/split-chunk.mjs <chunk.js> <plan.json> [--extract] [--dry | --verify <git ref>] | --self-test");
  process.exit(1);
}
