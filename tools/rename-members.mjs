// Renames methods and fields of the classes of one client chunk, everywhere
// they are used: the other chunks, client/toa, the tests and the tools.
// Edits text in place (no reformatting).
//
//   node tools/rename-members.mjs client/assets/x.js --census [--all]
//   node tools/rename-members.mjs client/assets/x.js names.json [--dry]
//   node tools/rename-members.mjs --self-test
//
// names.json: { "ClassName": { "nd": ["advanceTick", "evidence, or the word inferred"] } }.
//
// A member access `a.nd` does not say which class `a` is, and the bundles
// reuse the same two letters for unrelated members of unrelated classes. So a
// member is only renamed when the name can mean nothing else: in every
// tracked source file, `nd` must be defined by that one class and by nothing
// else (no other class, no object literal or pattern key, no string "nd"),
// and then every `.nd` is that member. The new name must not exist in the
// class or be read from `this` inside it. A name that another class does define can still
// be renamed in two cases: every access anywhere is `this.name` inside a
// class that defines it; or the entry carries a decision made by reading the
// accesses, `["newName", "evidence", { "onlyIn": [files whose accesses are
// all this class's], "lines": { "file with both": [line, ...] } }]`. Other
// uses of the new name elsewhere are
// reported for review, because code that probes for it (`x.spawnNpc?.()`)
// would now find it. Code inside strings (test probes) is rewritten only in
// test and tool files, and listed.
//
// A member that a class hands down is one member in several classes: a base
// class defines it, subclasses override it and call `super.name()`, sibling
// classes each define the same setter. The entry then names the family,
// `["newName", "evidence", { "alsoIn": ["Subclass", "Other@client/x/file.js"] }]`:
// those classes' definitions are renamed with it and no longer stand in the
// way. A class is named by the variable it is assigned to
// (`var Scene = class e { ... }` is Scene, whatever the bundler called it
// inside), a class of another file as Name@file.
//
// --census prints, for each class of the chunk, its members of up to three
// characters (or all): accesses per file, and what stands in the way.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = traverseModule.default ?? traverseModule;
const keyName = (node) => (node.computed ? undefined : node.key.type === "Identifier" ? node.key.name : node.key.type === "StringLiteral" ? node.key.value : undefined);
const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);

/** Everything in one file that defines, reads or mentions a member name. */
function scan(file, code) {
  const found = { file, code, classMembers: new Map(), objectKeys: new Map(), accesses: new Map(), thisAccesses: new Map(), strings: [] };
  const className = (path) => {
    const owner = path.findParent((parent) => parent.isClass());
    return owner.parent.type === "VariableDeclarator" ? owner.parent.id.name : owner.node.id?.name ?? "(anonymous class)";
  };
  traverse(parse(code, { sourceType: "module" }), {
    "ClassMethod|ClassProperty|ClassAccessorProperty"(path) {
      const name = keyName(path.node);
      if (name !== undefined) push(found.classMembers, name, { owner: className(path), start: path.node.key.start, end: path.node.key.end, quoted: path.node.key.type !== "Identifier" });
    },
    "ObjectProperty|ObjectMethod"(path) {
      const name = keyName(path.node);
      if (name !== undefined) push(found.objectKeys, name, path.node.key.loc.start.line);
    },
    "MemberExpression|OptionalMemberExpression"(path) {
      const { node } = path;
      if (node.computed || node.property.type !== "Identifier") return;
      const access = { start: node.property.start, end: node.property.end, line: node.property.loc.start.line };
      push(found.accesses, node.property.name, access);
      if (node.object.type !== "ThisExpression") return;
      // `this` is the instance in a method or field of a class, and in arrow functions inside those.
      const method = path.findParent((parent) => parent.isClassMethod() || parent.isClassProperty() || (parent.isFunction() && !parent.isArrowFunctionExpression()));
      if (!method || !(method.isClassMethod() || method.isClassProperty()) || method.node.static) return;
      access.thisOwner = className(method);
      push(found.thisAccesses, node.property.name, access.thisOwner);
    },
    "StringLiteral|TemplateElement"(path) {
      const { node } = path;
      if (path.parent.type === "ImportDeclaration" || (node.type === "StringLiteral" && /^(Object|Class)(Property|Method)$/.test(path.parent.type) && path.parent.key === node && !path.parent.computed)) return;
      found.strings.push({ text: node.type === "StringLiteral" ? node.value : node.value.raw, start: node.start, end: node.end, line: node.loc.start.line });
    },
  });
  return found;
}

const escape = (name) => name.replace(/[$]/g, "\\$&");
const exactly = (scans, name) => scans.flatMap((s) => s.strings.filter((string) => string.text === name).map((string) => `${s.file}:${string.line}`));
const inCode = (name) => new RegExp(`(?<=\\.)${escape(name)}(?![\\w$])`, "g");

/**
 * sources: { path: code }. names: { ClassName: { old: newName | [newName, evidence] } }.
 * Returns { sources (changed files only), renamed, accesses, notes }. Throws on any conflict.
 */
export function renameMembers(sources, chunk, names) {
  const scans = Object.entries(sources).map(([file, code]) => scan(file, code));
  const problems = [], notes = [], edits = new Map(scans.map((s) => [s.file, []]));
  const rewrittenStrings = new Map(); // string record -> its new source text
  const definedIn = (name) => scans.flatMap((s) => (s.classMembers.get(name) ?? []).map((member) => ({ ...member, file: s.file })));
  let renamed = 0, accesses = 0;
  const taken = new Map(); // class -> new names given out
  for (const [owner, entries] of Object.entries(names)) {
    for (const [oldName, value] of Object.entries(entries)) {
      const [newName, , scope] = Array.isArray(value) ? value : [value];
      const where = `${owner}.${oldName}`;
      const definitions = definedIn(oldName);
      // The classes that hold this member: the owner, and those the entry says define the same one.
      const family = new Set([`${owner}@${chunk}`, ...(scope?.alsoIn ?? []).map((name) => (name.includes("@") ? name : `${name}@${chunk}`))]);
      const inFamily = (className, file) => family.has(`${className}@${file}`);
      const own = definitions.filter((member) => inFamily(member.owner, member.file));
      const foreign = definitions.filter((member) => !own.includes(member));
      for (const name of family) if (name !== `${owner}@${chunk}` && !own.some((member) => `${member.owner}@${member.file}` === name)) problems.push(`${where}: ${name} (alsoIn) defines no such member`);
      const objectKeys = scans.flatMap((s) => (s.objectKeys.get(oldName) ?? []).map((line) => `${s.file}:${line}`));
      // Which accesses are this member's. Shared with another class, the name
      // is only decidable where every access is `this.name` inside a class
      // that defines it, or where the names file says which files' accesses
      // are this class's ({ onlyIn: [...] }, a decision made by reading them).
      let mine = () => true;
      let undecided = foreign.length > 0;
      if (foreign.length && scope?.onlyIn) {
        // `lines` narrows a file that holds both classes' accesses to the listed lines.
        const lines = scope.lines ?? {};
        undecided = foreign.some((member) => scope.onlyIn.includes(member.file));
        mine = (s, access) => (lines[s.file] ? !access || lines[s.file].includes(access.line) : scope.onlyIn.includes(s.file));
        for (const [file, list] of Object.entries(lines)) {
          const present = (scans.find((s) => s.file === file)?.accesses.get(oldName) ?? []).map((access) => access.line);
          for (const line of list) if (!present.includes(line)) problems.push(`${where}: no .${oldName} on line ${line} of ${file}`);
        }
        notes.push(`${where}: by decision, the accesses in ${[...scope.onlyIn, ...Object.entries(lines).map(([file, list]) => `${file} lines ${list.join(" ")}`)].join(", ")} are ${owner}'s; ${foreign.map((member) => `${member.owner} in ${member.file}`).join(", ")} keeps its own`);
      } else if (foreign.length) {
        undecided = !scans.every((s) => (s.accesses.get(oldName) ?? []).every((access) => definitions.some((member) => member.file === s.file && member.owner === access.thisOwner)));
        mine = (s, access) => inFamily(access.thisOwner, s.file);
      }
      if (!/^[A-Za-z_$][\w$]*$/.test(newName)) problems.push(`${where}: "${newName}" is not an identifier`);
      else if (!own.some((member) => member.file === chunk && member.owner === owner)) problems.push(`${where}: ${owner} in ${chunk} defines no such member`);
      else if (undecided) problems.push(`${where}: also a member of ${[...new Set(foreign.map((member) => `${member.owner} (${member.file})`))].join(", ")}, and not every access is this.${oldName} inside one of them`);
      else if (objectKeys.length) problems.push(`${where}: also an object key at ${objectKeys.slice(0, 4).join(", ")}`);
      else if (exactly(scans, oldName).length) problems.push(`${where}: the string "${oldName}" occurs at ${exactly(scans, oldName).slice(0, 4).join(", ")}`);
      else if (definedIn(newName).some((member) => inFamily(member.owner, member.file)) || [...family].some((name) => taken.get(name)?.has(newName))) problems.push(`${where}: ${owner}${family.size > 1 ? " or a class of its family" : ""} already has a member "${newName}"`);
      else if (scans.some((s) => (s.thisAccesses.get(newName) ?? []).some((className) => inFamily(className, s.file)))) problems.push(`${where}: ${owner}${family.size > 1 ? " or a class of its family" : ""} already uses this.${newName}`);
      else {
        for (const name of family) (taken.get(name) ?? taken.set(name, new Set()).get(name)).add(newName);
        renamed++;
        const elsewhere = scans.map((s) => [s.file, (s.accesses.get(newName)?.length ?? 0) + (s.classMembers.get(newName)?.length ?? 0) + (s.objectKeys.get(newName)?.length ?? 0)]).filter(([, count]) => count);
        if (elsewhere.length) notes.push(`${where} -> ${newName}: the new name is already used ${elsewhere.map(([file, count]) => `${count}x in ${file.split("/").pop()}`).join(", ")}`);
        for (const member of own) edits.get(member.file).push([member.start, member.end, member.quoted ? JSON.stringify(newName) : newName]);
        for (const s of scans) {
          for (const access of s.accesses.get(oldName) ?? []) {
            if (!mine(s, access)) continue;
            edits.get(s.file).push([access.start, access.end, newName]);
            accesses++;
          }
          for (const string of s.strings) {
            if (!inCode(oldName).test(string.text) || (scope?.onlyIn && !mine(s))) continue;
            if (!/^(test|tools)\//.test(s.file) || (foreign.length && !scope?.onlyIn)) problems.push(`${where}: ".${oldName}" inside a string at ${s.file}:${string.line}`);
            else {
              notes.push(`${where} -> ${newName}: rewritten inside a string at ${s.file}:${string.line}`);
              rewrittenStrings.set(string, (rewrittenStrings.get(string) ?? s.code.slice(string.start, string.end)).replace(inCode(oldName), newName));
            }
          }
        }
      }
    }
  }
  if (problems.length) throw new Error("Cannot rename:\n  " + problems.join("\n  "));
  const out = {};
  for (const s of scans) {
    for (const string of s.strings) if (rewrittenStrings.has(string)) edits.get(s.file).push([string.start, string.end, rewrittenStrings.get(string)]);
    const list = edits.get(s.file).sort((a, b) => b[0] - a[0]);
    if (!list.length) continue;
    let code = s.code;
    for (const [start, end, text] of list) code = code.slice(0, start) + text + code.slice(end);
    parse(code, { sourceType: "module" }); // must still parse
    out[s.file] = code;
  }
  return { sources: out, renamed, accesses, notes };
}

/** Text for --census. */
export function census(sources, chunk, { all = false } = {}) {
  const scans = Object.entries(sources).map(([file, code]) => scan(file, code));
  const own = scans.find((s) => s.file === chunk);
  const lines = [], owners = new Map();
  for (const [name, members] of own.classMembers) for (const member of members) if (all || name.length <= 3) (owners.get(member.owner) ?? owners.set(member.owner, new Set()).get(member.owner)).add(name);
  for (const [owner, memberNames] of owners) {
    lines.push(`## ${owner} (${memberNames.size} members)`);
    for (const name of memberNames) {
      const others = scans.flatMap((s) => (s.classMembers.get(name) ?? []).filter((member) => !(s === own && member.owner === owner)).map((member) => `${member.owner}@${s.file.split("/").pop()}`));
      const keys = scans.reduce((sum, s) => sum + (s.objectKeys.get(name)?.length ?? 0), 0);
      const uses = scans.map((s) => [s.file.split("/").pop(), s.accesses.get(name)?.length ?? 0]).filter(([, count]) => count).map(([file, count]) => `${file} ${count}`);
      const inStrings = scans.flatMap((s) => s.strings.filter((string) => string.text === name || inCode(name).test(string.text)).map((string) => `${s.file.split("/").pop()}:${string.line}`));
      const blocked = [others.length ? `also in ${[...new Set(others)].join(", ")}` : "", keys ? `object key ${keys}x` : "", inStrings.length ? `in strings: ${inStrings.slice(0, 5).join(" ")}` : ""].filter(Boolean).join("; ");
      lines.push(`  ${name}  ${uses.join(", ") || "never accessed"}${blocked ? "  !! " + blocked : ""}`);
    }
  }
  return lines.join("\n");
}

function selfTest() {
  const sources = {
    "client/a.js": 'class Engine { nd(x) { return this.zz(x) + this.count; } zz(x) { return x; } get qq() { return 1; } tick = 0; }\nclass World { nd2() { return [1].map(() => this.OP()); } OP() {} oM() {} }\nclass Other { OP() {} run() { return this.OP(); } }\nexport { Engine };',
    "client/b.js": 'import { Engine } from "./a.js";\nconst e = new Engine();\ne.nd(1); e?.nd(2); e["zz"]; const o = { run: 1 }; o.run; e.qq;',
    "test/t.mjs": 'const probe = "window.engine.nd(); engine.ndx; x.nd; engine.qq";\nawait page.evaluate(() => engine.nd());',
  };
  const { sources: out, renamed, accesses, notes } = renameMembers(sources, "client/a.js", { Engine: { nd: ["advanceTick", "inferred"], qq: "queueLength" } });
  const expected = {
    "client/a.js": sources["client/a.js"].replace("nd(x)", "advanceTick(x)").replace("get qq()", "get queueLength()"),
    "client/b.js": sources["client/b.js"].replace("e.nd(1); e?.nd(2)", "e.advanceTick(1); e?.advanceTick(2)").replace("e.qq", "e.queueLength"),
    "test/t.mjs": 'const probe = "window.engine.advanceTick(); engine.ndx; x.advanceTick; engine.queueLength";\nawait page.evaluate(() => engine.advanceTick());',
  };
  if (JSON.stringify(out) !== JSON.stringify(expected) || renamed !== 2 || accesses !== 4 || notes.length !== 2) throw new Error("self-test failed:\n" + JSON.stringify({ out, renamed, accesses, notes }, null, 1));
  // A name two classes define: decidable while every access is `this.OP` in
  // one of them, or with a recorded decision about the files.
  const shared = renameMembers(sources, "client/a.js", { World: { OP: "applyDamage" } }).sources["client/a.js"];
  if (shared !== sources["client/a.js"].replace("this.OP()); } OP() {} oM", "this.applyDamage()); } applyDamage() {} oM")) throw new Error("shared member:\n" + shared);
  const elsewhere = { ...sources, "client/d.js": "class Visuals { oM() {} }\nvisuals.oM(1);", "client/e.js": "world.oM(2); world.OP();" };
  const scoped = renameMembers(elsewhere, "client/a.js", { World: { oM: ["removeActor", "inferred", { onlyIn: ["client/a.js", "client/e.js"] }] } }).sources;
  if (Object.keys(scoped).join() !== "client/a.js,client/e.js" || scoped["client/e.js"] !== "world.removeActor(2); world.OP();" || !scoped["client/a.js"].includes("removeActor() {}")) throw new Error("scoped member:\n" + JSON.stringify(scoped));
  const mixed = { ...sources, "client/d.js": "class Visuals { oM() {} }\nvisuals.oM(1);\nworld.oM(2);" };
  const byLine = renameMembers(mixed, "client/a.js", { World: { oM: ["removeActor", "inferred", { onlyIn: ["client/a.js"], lines: { "client/d.js": [3] } }] } }).sources;
  if (byLine["client/d.js"] !== "class Visuals { oM() {} }\nvisuals.oM(1);\nworld.removeActor(2);") throw new Error("member by line:\n" + byLine["client/d.js"]);
  for (const bad of [{ World: { OP: "x" } }, { World: { oM: "x" } }, { World: { oM: ["x", "", { onlyIn: ["client/d.js"] }] } }, { World: { oM: ["x", "", { onlyIn: ["client/a.js"], lines: { "client/d.js": [1] } }] } }]) {
    let threw = false;
    try { renameMembers(elsewhere, "client/a.js", bad); } catch { threw = true; }
    if (!threw) throw new Error("expected a refusal for " + JSON.stringify(bad));
  }
  // Refused: a string that equals the name, a new name the class has or
  // reads from `this`, an unknown member, an invalid or repeated new name.
  for (const bad of [{ Engine: { zz: "identity" } }, { Engine: { nd: "zz" } }, { Engine: { nd: "count" } }, { Engine: { nd: "tick" } }, { Engine: { nope: "x" } }, { Engine: { nd: "not valid" } }, { Engine: { nd: "same", qq: "same" } }]) {
    let threw = false;
    try { renameMembers(sources, "client/a.js", bad); } catch { threw = true; }
    if (!threw) throw new Error("expected a refusal for " + JSON.stringify(bad));
  }
  let threw = false;
  try { renameMembers({ ...sources, "client/c.js": "const o = { nd: 1 };" }, "client/a.js", { Engine: { nd: "advanceTick" } }); } catch { threw = true; }
  if (!threw) throw new Error("expected a refusal for an object key");
  // A member handed down: the base class (named by its variable, not by the
  // bundler's inner name), a subclass that overrides it and calls super, a
  // subclass in another file, and two sibling classes with the same setter.
  const handedDown = {
    "client/s.js": "var Base = class e { JD(a) { return e.count + a; } hook() { return this.JD(1); } };\nvar Mid = class extends Base { JD(a) { return super.JD(a) + 1; } };\nvar Left = class extends Base { hM(a) { this.t = a; } };\nvar Right = class extends Base { hM(a) { this.t = a; } };\nvar Lone = class e { zz() {} };\nexport { Base, Mid, Left, Right };",
    "client/toa/z.js": "export const build = (Scene) => { class Zed extends Scene { JD(a) { return super.JD(a) * 2; } } const scene = new Zed(); scene.hM(null); return scene; };",
    "test/s.mjs": 'const marker = "scene.hM(tracker);";',
  };
  const familyNames = { Base: { JD: ["syncInstances", "inferred", { alsoIn: ["Mid", "Zed@client/toa/z.js"] }] }, Left: { hM: ["setTracker", "inferred", { alsoIn: ["Right"] }] } };
  const family = renameMembers(handedDown, "client/s.js", familyNames);
  const familyExpected = {
    "client/s.js": handedDown["client/s.js"].replaceAll("JD", "syncInstances").replaceAll("hM", "setTracker"),
    "client/toa/z.js": handedDown["client/toa/z.js"].replaceAll("JD", "syncInstances").replaceAll("hM", "setTracker"),
    "test/s.mjs": 'const marker = "scene.setTracker(tracker);";',
  };
  if (JSON.stringify(family.sources) !== JSON.stringify(familyExpected) || family.renamed !== 2 || family.accesses !== 4) throw new Error("handed-down member:\n" + JSON.stringify(family, null, 1));
  const familyCensus = census(handedDown, "client/s.js");
  for (const part of ["## Base (1 members)", "  JD  s.js 2, z.js 1  !! also in Mid@s.js, Zed@z.js", "## Lone (1 members)"]) if (!familyCensus.includes(part)) throw new Error("census lacks " + JSON.stringify(part) + ":\n" + familyCensus);
  if (familyCensus.includes("## e ")) throw new Error("census names a class by the bundler's inner name:\n" + familyCensus);
  // Refused: the override left out of the family, no family at all, a family
  // class without the member, a new name one class of the family already has
  // or reads from `this`.
  for (const bad of [{ Base: { JD: ["x", "", { alsoIn: ["Mid"] }] } }, { Base: { JD: "x" } }, { Left: { hM: "x" } }, { Base: { JD: ["x", "", { alsoIn: ["Mid", "Zed@client/toa/z.js", "Left"] }] } }, { Base: { JD: ["hook", "", { alsoIn: ["Mid", "Zed@client/toa/z.js"] }] } }, { Left: { hM: ["t", "", { alsoIn: ["Right"] }] } }]) {
    threw = false;
    try { renameMembers(handedDown, "client/s.js", bad); } catch { threw = true; }
    if (!threw) throw new Error("expected a refusal for " + JSON.stringify(bad));
  }
  const listed = census(sources, "client/a.js");
  for (const part of ["## Engine (3 members)", "  nd  b.js 2, t.mjs 1  !! in strings: t.mjs:1", "  zz  a.js 1  !! in strings: b.js:3", "  OP  a.js 2  !! also in Other@a.js", "## World (3 members)"])
    if (!listed.includes(part)) throw new Error("census lacks " + JSON.stringify(part) + ":\n" + listed);
  console.log("rename-members self-test passed");
}

const args = process.argv.slice(2);
const [chunk, mapFile] = args.filter((arg) => !arg.startsWith("--"));
if (args.includes("--self-test")) selfTest();
else if (chunk && (mapFile || args.includes("--census"))) {
  const files = execFileSync("git", ["ls-files", "client", "test", "tools"], { encoding: "utf8" }).split("\n").filter((file) => /\.m?js$/.test(file) && !file.endsWith("bzip2-module.js") && file !== "tools/rename-members.mjs"); // not this file: its self-test is made of minified names
  const readSources = () => Object.fromEntries(files.map((file) => [file, readFileSync(file, "utf8")]));
  const given = chunk.replace(/\\/g, "/").replace(/\/$/, "");
  // A directory: every tracked module in it; the names file is then keyed
  // by module ({ "fireballs.js": { "FireballRuntime": { ... } } }).
  const isDirectory = existsSync(given) && statSync(given).isDirectory();
  const modules = isDirectory ? files.filter((file) => file.startsWith(given + "/") && !file.slice(given.length + 1).includes("/")) : [given];
  if (!isDirectory && !files.includes(given)) throw new Error(given + " is not a tracked source file");
  if (args.includes("--census")) {
    const sources = readSources();
    for (const target of modules) {
      const text = census(sources, target, { all: args.includes("--all") });
      if (text) console.log((isDirectory ? `# ${target}\n` : "") + text);
    }
  } else {
    const read = JSON.parse(readFileSync(mapFile, "utf8"));
    for (const [target, names] of isDirectory ? Object.entries(read).map(([file, entries]) => [`${given}/${file}`, entries]) : [[given, read]]) {
      if (!files.includes(target)) throw new Error(target + " is not a tracked source file");
      const { sources: out, renamed, accesses, notes } = renameMembers(readSources(), target, names);
      if (!args.includes("--dry")) for (const [file, code] of Object.entries(out)) writeFileSync(file, code);
      for (const note of notes) console.log("note: " + note);
      const evidence = Object.values(names).flatMap((entries) => Object.values(entries)).map((value) => (Array.isArray(value) ? value[1] ?? "inferred" : "inferred"));
      const inferred = evidence.filter((note) => note.startsWith("inferred")).length;
      console.log(`${isDirectory ? target.split("/").pop() + ": " : ""}${renamed} members renamed (${evidence.length - inferred} with evidence, ${inferred} inferred), ${accesses} accesses in ${Object.keys(out).length} files: ${Object.keys(out).map((file) => file.split("/").pop()).join(", ")}`);
    }
  }
} else {
  console.error("usage: node tools/rename-members.mjs <chunk.js | directory> (--census [--all] | <names.json> [--dry]) | --self-test");
  process.exit(1);
}
