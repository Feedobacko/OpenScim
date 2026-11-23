var Module = (() => {
  var e =
    typeof document < `u` && document.currentScript
      ? document.currentScript.src
      : void 0;
  return (
    typeof __filename < `u` && (e ||= __filename),
    (t) => {
      t ||= {};
      var t = t === void 0 ? {} : t,
        n,
        r;
      ((t.ready = new Promise((e, t) => {
        ((n = e), (r = t));
      })),
        (t.locateFile = (e, t) =>
          l ? t + e : e.endsWith(`.wasm`) ? require("./module.wasm") : e));
      var i = Object.assign({}, t),
        a = [],
        o = (e, t) => {
          throw t;
        },
        s = typeof window == `object`,
        c = typeof importScripts == `function`,
        l =
          typeof process == `object` &&
          typeof process.versions == `object` &&
          typeof process.versions.node == `string`,
        u = ``;
      function d(e) {
        return t.locateFile ? t.locateFile(e, u) : u + e;
      }
      var f, p, m;
      function h(e) {
        e instanceof F || v(`exiting due to exception: ` + e);
      }
      if (l) {
        u = c ? require("path").dirname(u) + `/` : __dirname + `/`;
        var g, _;
        (typeof require == `function` &&
          ((g = require("fs")), (_ = require("path"))),
          (f = (e, t) => (
            (e = _.normalize(e)),
            g.readFileSync(e, t ? void 0 : `utf8`)
          )),
          (m = (e) => {
            var t = f(e, !0);
            return (t.buffer || (t = new Uint8Array(t)), t);
          }),
          (p = (e, t, n) => {
            ((e = _.normalize(e)),
              g.readFile(e, (e, r) => {
                e ? n(e) : t(r.buffer);
              }));
          }),
          process.argv.length > 1 && process.argv[1].replace(/\\/g, `/`),
          (a = process.argv.slice(2)),
          process.on(`uncaughtException`, (e) => {
            if (!(e instanceof F)) throw e;
          }),
          process.on(`unhandledRejection`, (e) => {
            throw e;
          }),
          (o = (e, t) => {
            if (me()) throw ((process.exitCode = e), t);
            (h(t), process.exit(e));
          }),
          (t.inspect = () => `[Emscripten Module object]`));
      } else
        (s || c) &&
          (c
            ? (u = self.location.href)
            : typeof document < `u` &&
              document.currentScript &&
              (u = document.currentScript.src),
          e && (u = e),
          (u =
            u.indexOf(`blob:`) === 0
              ? ``
              : u.substr(0, u.replace(/[?#].*/, ``).lastIndexOf(`/`) + 1)),
          (f = (e) => {
            var t = new XMLHttpRequest();
            return (t.open(`GET`, e, !1), t.send(null), t.responseText);
          }),
          c &&
            (m = (e) => {
              var t = new XMLHttpRequest();
              return (
                t.open(`GET`, e, !1),
                (t.responseType = `arraybuffer`),
                t.send(null),
                new Uint8Array(t.response)
              );
            }),
          (p = (e, t, n) => {
            var r = new XMLHttpRequest();
            (r.open(`GET`, e, !0),
              (r.responseType = `arraybuffer`),
              (r.onload = () => {
                if (r.status == 200 || (r.status == 0 && r.response)) {
                  t(r.response);
                  return;
                }
                n();
              }),
              (r.onerror = n),
              r.send(null));
          }));
      var ee = t.print || console.log.bind(console),
        v = t.printErr || console.warn.bind(console);
      (Object.assign(t, i),
        (i = null),
        t.arguments && (a = t.arguments),
        t.thisProgram && t.thisProgram,
        t.quit && (o = t.quit));
      var y;
      t.wasmBinary && (y = t.wasmBinary);
      var te = t.noExitRuntime || !0;
      typeof WebAssembly != `object` && N(`no native wasm support detected`);
      var b,
        x = !1,
        ne = typeof TextDecoder < `u` ? new TextDecoder(`utf8`) : void 0;
      function re(e, t, n) {
        for (var r = t + n, i = t; e[i] && !(i >= r);) ++i;
        if (i - t > 16 && e.buffer && ne) return ne.decode(e.subarray(t, i));
        for (var a = ``; t < i;) {
          var o = e[t++];
          if (!(o & 128)) {
            a += String.fromCharCode(o);
            continue;
          }
          var s = e[t++] & 63;
          if ((o & 224) == 192) {
            a += String.fromCharCode(((o & 31) << 6) | s);
            continue;
          }
          var c = e[t++] & 63;
          if (
            ((o =
              (o & 240) == 224
                ? ((o & 15) << 12) | (s << 6) | c
                : ((o & 7) << 18) | (s << 12) | (c << 6) | (e[t++] & 63)),
            o < 65536)
          )
            a += String.fromCharCode(o);
          else {
            var l = o - 65536;
            a += String.fromCharCode(55296 | (l >> 10), 56320 | (l & 1023));
          }
        }
        return a;
      }
      function S(e, t) {
        return e ? re(T, e, t) : ``;
      }
      function ie(e, t, n, r) {
        if (!(r > 0)) return 0;
        for (var i = n, a = n + r - 1, o = 0; o < e.length; ++o) {
          var s = e.charCodeAt(o);
          if (s >= 55296 && s <= 57343) {
            var c = e.charCodeAt(++o);
            s = (65536 + ((s & 1023) << 10)) | (c & 1023);
          }
          if (s <= 127) {
            if (n >= a) break;
            t[n++] = s;
          } else if (s <= 2047) {
            if (n + 1 >= a) break;
            ((t[n++] = 192 | (s >> 6)), (t[n++] = 128 | (s & 63)));
          } else if (s <= 65535) {
            if (n + 2 >= a) break;
            ((t[n++] = 224 | (s >> 12)),
              (t[n++] = 128 | ((s >> 6) & 63)),
              (t[n++] = 128 | (s & 63)));
          } else {
            if (n + 3 >= a) break;
            ((t[n++] = 240 | (s >> 18)),
              (t[n++] = 128 | ((s >> 12) & 63)),
              (t[n++] = 128 | ((s >> 6) & 63)),
              (t[n++] = 128 | (s & 63)));
          }
        }
        return ((t[n] = 0), n - i);
      }
      function ae(e, t, n) {
        return ie(e, T, t, n);
      }
      function oe(e) {
        for (var t = 0, n = 0; n < e.length; ++n) {
          var r = e.charCodeAt(n);
          r <= 127
            ? t++
            : r <= 2047
              ? (t += 2)
              : r >= 55296 && r <= 57343
                ? ((t += 4), ++n)
                : (t += 3);
        }
        return t;
      }
      var C, w, T, E, D, O, k, se, ce;
      function le(e) {
        ((C = e),
          (t.HEAP8 = w = new Int8Array(e)),
          (t.HEAP16 = E = new Int16Array(e)),
          (t.HEAP32 = O = new Int32Array(e)),
          (t.HEAPU8 = T = new Uint8Array(e)),
          (t.HEAPU16 = D = new Uint16Array(e)),
          (t.HEAPU32 = k = new Uint32Array(e)),
          (t.HEAPF32 = se = new Float32Array(e)),
          (t.HEAPF64 = ce = new Float64Array(e)));
      }
      t.INITIAL_MEMORY;
      var ue,
        de = [],
        fe = [],
        pe = [];
      function me() {
        return te;
      }
      function he() {
        if (t.preRun)
          for (
            typeof t.preRun == `function` && (t.preRun = [t.preRun]);
            t.preRun.length;
          )
            ve(t.preRun.shift());
        I(de);
      }
      function ge() {
        I(fe);
      }
      function _e() {
        if (t.postRun)
          for (
            typeof t.postRun == `function` && (t.postRun = [t.postRun]);
            t.postRun.length;
          )
            be(t.postRun.shift());
        I(pe);
      }
      function ve(e) {
        de.unshift(e);
      }
      function ye(e) {
        fe.unshift(e);
      }
      function be(e) {
        pe.unshift(e);
      }
      var A = 0,
        j = null,
        M = null;
      function xe(e) {
        (A++, t.monitorRunDependencies && t.monitorRunDependencies(A));
      }
      function Se(e) {
        if (
          (A--,
          t.monitorRunDependencies && t.monitorRunDependencies(A),
          A == 0 && (j !== null && (clearInterval(j), (j = null)), M))
        ) {
          var n = M;
          ((M = null), n());
        }
      }
      function N(e) {
        (t.onAbort && t.onAbort(e),
          (e = `Aborted(` + e + `)`),
          v(e),
          (x = !0),
          (e += `. Build with -sASSERTIONS for more info.`));
        var n = new WebAssembly.RuntimeError(e);
        throw (r(n), n);
      }
      var Ce = `data:application/octet-stream;base64,`;
      function we(e) {
        return e.startsWith(Ce);
      }
      function Te(e) {
        return e.startsWith(`file://`);
      }
      var P = `module.wasm`;
      we(P) || (P = d(P));
      function Ee(e) {
        try {
          if (e == P && y) return new Uint8Array(y);
          if (m) return m(e);
          throw `both async and sync fetching of the wasm failed`;
        } catch (e) {
          N(e);
        }
      }
      function De() {
        if (!y && (s || c)) {
          if (typeof fetch == `function` && !Te(P))
            return fetch(P, {
              credentials: `same-origin`,
            })
              .then((e) => {
                if (!e.ok)
                  throw `failed to load wasm binary file at '` + P + `'`;
                return e.arrayBuffer();
              })
              .catch(() => Ee(P));
          if (p)
            return new Promise((e, t) => {
              p(
                P,
                (t) => {
                  e(new Uint8Array(t));
                },
                t,
              );
            });
        }
        return Promise.resolve().then(() => Ee(P));
      }
      function Oe() {
        var e = {
          env: Yt,
          wasi_snapshot_preview1: Yt,
        };
        function n(e, n) {
          var exports2 = e.exports;
          ((t.asm = exports2),
            (b = t.asm.memory),
            le(b.buffer),
            (ue = t.asm.__indirect_function_table),
            ye(t.asm.__wasm_call_ctors),
            Se(`wasm-instantiate`));
        }
        xe(`wasm-instantiate`);
        function i(e) {
          n(e.instance);
        }
        function a(t) {
          return De()
            .then((t) => WebAssembly.instantiate(t, e))
            .then((e) => e)
            .then(t, (e) => {
              (v(`failed to asynchronously prepare wasm: ` + e), N(e));
            });
        }
        function o() {
          return !y &&
            typeof WebAssembly.instantiateStreaming == `function` &&
            !we(P) &&
            !Te(P) &&
            !l &&
            typeof fetch == `function`
            ? fetch(P, {
                credentials: `same-origin`,
              }).then((t) =>
                WebAssembly.instantiateStreaming(t, e).then(
                  i,
                  (e) => (
                    v(`wasm streaming compile failed: ` + e),
                    v(`falling back to ArrayBuffer instantiation`),
                    a(i)
                  ),
                ),
              )
            : a(i);
        }
        if (t.instantiateWasm)
          try {
            return t.instantiateWasm(e, n);
          } catch (e) {
            (v(`Module.instantiateWasm callback failed with error: ` + e),
              r(e));
          }
        return (o().catch(r), {});
      }
      function F(e) {
        ((this.name = `ExitStatus`),
          (this.message = `Program terminated with exit(` + e + `)`),
          (this.status = e));
      }
      function I(e) {
        for (; e.length > 0;) e.shift()(t);
      }
      function ke(e, t, n, r, i) {}
      function L(e) {
        switch (e) {
          case 1:
            return 0;
          case 2:
            return 1;
          case 4:
            return 2;
          case 8:
            return 3;
          default:
            throw TypeError(`Unknown type size: ` + e);
        }
      }
      function Ae() {
        for (var e = Array(256), t = 0; t < 256; ++t)
          e[t] = String.fromCharCode(t);
        je = e;
      }
      var je;
      function R(e) {
        for (var t = ``, n = e; T[n];) t += je[T[n++]];
        return t;
      }
      var z = {},
        B = {},
        V = {},
        Me = 48,
        Ne = 57;
      function Pe(e) {
        if (e === void 0) return `_unknown`;
        e = e.replace(/[^a-zA-Z0-9_]/g, `$`);
        var t = e.charCodeAt(0);
        return t >= Me && t <= Ne ? `_` + e : e;
      }
      function Fe(e, t) {
        return (
          (e = Pe(e)),
          Function(
            `body`,
            `return function ` +
              e +
              `() {
    "use strict";    return body.apply(this, arguments);
};
`,
          )(t)
        );
      }
      function H(e, t) {
        var n = Fe(t, function (e) {
          ((this.name = t), (this.message = e));
          var stack2 = Error(e).stack;
          stack2 !== void 0 &&
            (this.stack =
              this.toString() +
              `
` +
              stack2.replace(/^Error(:[^\n]*)?\n/, ``));
        });
        return (
          (n.prototype = Object.create(e.prototype)),
          (n.prototype.constructor = n),
          (n.prototype.toString = function () {
            return this.message === void 0
              ? this.name
              : this.name + `: ` + this.message;
          }),
          n
        );
      }
      var Ie;
      function U(e) {
        throw new Ie(e);
      }
      var Le;
      function Re(e) {
        throw new Le(e);
      }
      function ze(e, t, n) {
        e.forEach((e) => {
          V[e] = t;
        });
        function r(t) {
          var r = n(t);
          r.length !== e.length && Re(`Mismatched type converter count`);
          for (var i = 0; i < e.length; ++i) W(e[i], r[i]);
        }
        var i = Array(t.length),
          a = [],
          o = 0;
        (t.forEach((e, t) => {
          Object.hasOwn(B, e)
            ? (i[t] = B[e])
            : (a.push(e),
              Object.hasOwn(z, e) || (z[e] = []),
              z[e].push(() => {
                ((i[t] = B[e]), ++o, o === a.length && r(i));
              }));
        }),
          a.length === 0 && r(i));
      }
      function W(e, t, n = {}) {
        if (!(`argPackAdvance` in t))
          throw TypeError(
            `registerType registeredInstance requires argPackAdvance`,
          );
        var name2 = t.name;
        if (
          (e ||
            U(
              `type "` +
                name2 +
                `" must have a positive integer typeid pointer`,
            ),
          Object.hasOwn(B, e))
        ) {
          if (n.ignoreDuplicateRegistrations) return;
          U(`Cannot register type '` + name2 + `' twice`);
        }
        if (((B[e] = t), delete V[e], Object.hasOwn(z, e))) {
          var i = z[e];
          (delete z[e], i.forEach((e) => e()));
        }
      }
      function Be(e, t, n, r, i) {
        var a = L(n);
        ((t = R(t)),
          W(e, {
            name: t,
            fromWireType: (e) => !!e,
            toWireType: (e, t) => (t ? r : i),
            argPackAdvance: 8,
            readValueFromPointer: function (e) {
              var r;
              if (n === 1) r = w;
              else if (n === 2) r = E;
              else if (n === 4) r = O;
              else throw TypeError(`Unknown boolean type size: ` + t);
              return this.fromWireType(r[e >> a]);
            },
            destructorFunction: null,
          }));
      }
      var G = [],
        K = [
          {},
          {
            value: void 0,
          },
          {
            value: null,
          },
          {
            value: !0,
          },
          {
            value: !1,
          },
        ];
      function Ve(e) {
        e > 4 && --K[e].refcount === 0 && ((K[e] = void 0), G.push(e));
      }
      function He() {
        for (var e = 0, t = 5; t < K.length; ++t) K[t] !== void 0 && ++e;
        return e;
      }
      function Ue() {
        for (var e = 5; e < K.length; ++e) if (K[e] !== void 0) return K[e];
        return null;
      }
      function We() {
        ((t.count_emval_handles = He), (t.get_first_emval = Ue));
      }
      var q = {
        toValue: (e) => (
          e || U(`Cannot use deleted val. handle = ` + e),
          K[e].value
        ),
        toHandle: (e) => {
          switch (e) {
            case void 0:
              return 1;
            case null:
              return 2;
            case !0:
              return 3;
            case !1:
              return 4;
            default:
              var t = G.length ? G.pop() : K.length;
              return (
                (K[t] = {
                  refcount: 1,
                  value: e,
                }),
                t
              );
          }
        },
      };
      function J(e) {
        return this.fromWireType(O[e >> 2]);
      }
      function Ge(e, t) {
        ((t = R(t)),
          W(e, {
            name: t,
            fromWireType: (e) => {
              var t = q.toValue(e);
              return (Ve(e), t);
            },
            toWireType: (e, t) => q.toHandle(t),
            argPackAdvance: 8,
            readValueFromPointer: J,
            destructorFunction: null,
          }));
      }
      function Ke(e, t) {
        switch (t) {
          case 2:
            return function (e) {
              return this.fromWireType(se[e >> 2]);
            };
          case 3:
            return function (e) {
              return this.fromWireType(ce[e >> 3]);
            };
          default:
            throw TypeError(`Unknown float type: ` + e);
        }
      }
      function qe(e, t, n) {
        var r = L(n);
        ((t = R(t)),
          W(e, {
            name: t,
            fromWireType: (e) => e,
            toWireType: (e, t) => t,
            argPackAdvance: 8,
            readValueFromPointer: Ke(t, r),
            destructorFunction: null,
          }));
      }
      function Je(e, t) {
        if (!(e instanceof Function))
          throw TypeError(
            `new_ called with constructor type ` +
              typeof e +
              ` which is not a function`,
          );
        var n = Fe(e.name || `unknownFunctionName`, () => {});
        n.prototype = e.prototype;
        var r = new n(),
          i = e.apply(r, t);
        return i instanceof Object ? i : r;
      }
      function Ye(e) {
        for (; e.length;) {
          var t = e.pop();
          e.pop()(t);
        }
      }
      function Xe(e, t, n, r, i) {
        var length2 = t.length;
        length2 < 2 &&
          U(
            `argTypes array size mismatch! Must at least get return value and 'this' types!`,
          );
        for (
          var o = t[1] !== null && n !== null, s = !1, c = 1;
          c < t.length;
          ++c
        )
          if (t[c] !== null && t[c].destructorFunction === void 0) {
            s = !0;
            break;
          }
        for (
          var l = t[0].name !== `void`, u = ``, d = ``, c = 0;
          c < length2 - 2;
          ++c
        )
          ((u += (c === 0 ? `` : `, `) + `arg` + c),
            (d += (c === 0 ? `` : `, `) + `arg` + c + `Wired`));
        var f =
          `return function ` +
          Pe(e) +
          `(` +
          u +
          `) {
if (arguments.length !== ` +
          (length2 - 2) +
          `) {
throwBindingError('function ` +
          e +
          ` called with ' + arguments.length + ' arguments, expected ` +
          (length2 - 2) +
          ` args!');
}
`;
        s &&
          (f += `var destructors = [];
`);
        var p = s ? `destructors` : `null`,
          m = [
            `throwBindingError`,
            `invoker`,
            `fn`,
            `runDestructors`,
            `retType`,
            `classParam`,
          ],
          h = [U, r, i, Ye, t[0], t[1]];
        o &&
          (f +=
            `var thisWired = classParam.toWireType(` +
            p +
            `, this);
`);
        for (var c = 0; c < length2 - 2; ++c)
          ((f +=
            `var arg` +
            c +
            `Wired = argType` +
            c +
            `.toWireType(` +
            p +
            `, arg` +
            c +
            `); // ` +
            t[c + 2].name +
            `
`),
            m.push(`argType` + c),
            h.push(t[c + 2]));
        if (
          (o && (d = `thisWired` + (d.length > 0 ? `, ` : ``) + d),
          (f +=
            (l ? `var rv = ` : ``) +
            `invoker(fn` +
            (d.length > 0 ? `, ` : ``) +
            d +
            `);
`),
          s)
        )
          f += `runDestructors(destructors);
`;
        else
          for (var c = o ? 1 : 2; c < t.length; ++c) {
            var g = c === 1 ? `thisWired` : `arg` + (c - 2) + `Wired`;
            t[c].destructorFunction !== null &&
              ((f +=
                g +
                `_dtor(` +
                g +
                `); // ` +
                t[c].name +
                `
`),
              m.push(g + `_dtor`),
              h.push(t[c].destructorFunction));
          }
        return (
          l &&
            (f += `var ret = retType.fromWireType(rv);
return ret;
`),
          (f += `}
`),
          m.push(f),
          Je(Function, m).apply(null, h)
        );
      }
      function Ze(e, t, n) {
        if (e[t].overloadTable === void 0) {
          var r = e[t];
          ((e[t] = function () {
            return (
              Object.hasOwn(e[t].overloadTable, arguments.length) ||
                U(
                  `Function '` +
                    n +
                    `' called with an invalid number of arguments (` +
                    arguments.length +
                    `) - expects one of (` +
                    e[t].overloadTable +
                    `)!`,
                ),
              e[t].overloadTable[arguments.length].apply(this, arguments)
            );
          }),
            (e[t].overloadTable = []),
            (e[t].overloadTable[r.argCount] = r));
        }
      }
      function Qe(e, n, r) {
        Object.hasOwn(t, e)
          ? ((r === void 0 ||
              (t[e].overloadTable !== void 0 &&
                t[e].overloadTable[r] !== void 0)) &&
              U(`Cannot register public name '` + e + `' twice`),
            Ze(t, e, e),
            Object.hasOwn(t, r) &&
              U(
                `Cannot register multiple overloads of a function with the same number of arguments (` +
                  r +
                  `)!`,
              ),
            (t[e].overloadTable[r] = n))
          : ((t[e] = n), r !== void 0 && (t[e].numArguments = r));
      }
      function $e(e, t) {
        for (var n = [], r = 0; r < e; r++) n.push(k[(t + r * 4) >> 2]);
        return n;
      }
      function et(e, n, r) {
        (Object.hasOwn(t, e) || Re(`Replacing nonexistant public symbol`),
          t[e].overloadTable !== void 0 && r !== void 0
            ? (t[e].overloadTable[r] = n)
            : ((t[e] = n), (t[e].argCount = r)));
      }
      function tt(e, n, r) {
        var i = t[`dynCall_` + e];
        return r && r.length ? i.apply(null, [n].concat(r)) : i.call(null, n);
      }
      var Y = [];
      function nt(e) {
        var t = Y[e];
        return (
          t || (e >= Y.length && (Y.length = e + 1), (Y[e] = t = ue.get(e))),
          t
        );
      }
      function rt(e, t, n) {
        return e.includes(`j`) ? tt(e, t, n) : nt(t).apply(null, n);
      }
      function it(e, t) {
        var n = [];
        return function () {
          return ((n.length = 0), Object.assign(n, arguments), rt(e, t, n));
        };
      }
      function at(e, t) {
        e = R(e);
        function n() {
          return e.includes(`j`) ? it(e, t) : nt(t);
        }
        var r = n();
        return (
          typeof r != `function` &&
            U(`unknown function pointer with signature ` + e + `: ` + t),
          r
        );
      }
      var ot;
      function st(e) {
        var t = Zt(e),
          n = R(t);
        return (Z(t), n);
      }
      function ct(e, t) {
        var n = [],
          r = {};
        function i(e) {
          if (!r[e] && !B[e]) {
            if (V[e]) {
              V[e].forEach(i);
              return;
            }
            (n.push(e), (r[e] = !0));
          }
        }
        throw (t.forEach(i), new ot(e + `: ` + n.map(st).join([`, `])));
      }
      function lt(e, t, n, r, i, a) {
        var o = $e(t, n);
        ((e = R(e)),
          (i = at(r, i)),
          Qe(
            e,
            () => {
              ct(`Cannot call ` + e + ` due to unbound types`, o);
            },
            t - 1,
          ),
          ze([], o, (n) => {
            var r = [n[0], null].concat(n.slice(1));
            return (et(e, Xe(e, r, null, i, a), t - 1), []);
          }));
      }
      function ut(e, t, n) {
        switch (t) {
          case 0:
            return n
              ? function (e) {
                  return w[e];
                }
              : function (e) {
                  return T[e];
                };
          case 1:
            return n
              ? function (e) {
                  return E[e >> 1];
                }
              : function (e) {
                  return D[e >> 1];
                };
          case 2:
            return n
              ? function (e) {
                  return O[e >> 2];
                }
              : function (e) {
                  return k[e >> 2];
                };
          default:
            throw TypeError(`Unknown integer type: ` + e);
        }
      }
      function dt(e, t, n, r, i) {
        ((t = R(t)), i === -1 && (i = 4294967295));
        var a = L(n),
          o = (e) => e;
        if (r === 0) {
          var s = 32 - 8 * n;
          o = (e) => (e << s) >>> s;
        }
        var c = t.includes(`unsigned`);
        W(e, {
          name: t,
          fromWireType: o,
          toWireType: c
            ? function (e, t) {
                return (this.name, t >>> 0);
              }
            : function (e, t) {
                return (this.name, t);
              },
          argPackAdvance: 8,
          readValueFromPointer: ut(t, a, r !== 0),
          destructorFunction: null,
        });
      }
      function ft(e, t, n) {
        var r = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
        ][t];
        function i(e) {
          e >>= 2;
          var t = k,
            n = t[e],
            i = t[e + 1];
          return new r(C, i, n);
        }
        ((n = R(n)),
          W(
            e,
            {
              name: n,
              fromWireType: i,
              argPackAdvance: 8,
              readValueFromPointer: i,
            },
            {
              ignoreDuplicateRegistrations: !0,
            },
          ));
      }
      function pt(e, t) {
        t = R(t);
        var n = t === `std::string`;
        W(e, {
          name: t,
          fromWireType: (e) => {
            var t = k[e >> 2],
              r = e + 4,
              i;
            if (n)
              for (var a = r, o = 0; o <= t; ++o) {
                var s = r + o;
                if (o == t || T[s] == 0) {
                  var c = s - a,
                    l = S(a, c);
                  (i === void 0 ? (i = l) : ((i += `\0`), (i += l)),
                    (a = s + 1));
                }
              }
            else {
              for (var u = Array(t), o = 0; o < t; ++o)
                u[o] = String.fromCharCode(T[r + o]);
              i = u.join(``);
            }
            return (Z(e), i);
          },
          toWireType: (e, t) => {
            t instanceof ArrayBuffer && (t = new Uint8Array(t));
            var r,
              i = typeof t == `string`;
            (i ||
              t instanceof Uint8Array ||
              t instanceof Uint8ClampedArray ||
              t instanceof Int8Array ||
              U(`Cannot pass non-string to std::string`),
              (r = n && i ? oe(t) : t.length));
            var a = X(4 + r + 1),
              o = a + 4;
            if (((k[a >> 2] = r), n && i)) ae(t, o, r + 1);
            else if (i)
              for (var s = 0; s < r; ++s) {
                var c = t.charCodeAt(s);
                (c > 255 &&
                  (Z(o),
                  U(`String has UTF-16 code units that do not fit in 8 bits`)),
                  (T[o + s] = c));
              }
            else for (var s = 0; s < r; ++s) T[o + s] = t[s];
            return (e !== null && e.push(Z, a), a);
          },
          argPackAdvance: 8,
          readValueFromPointer: J,
          destructorFunction: (e) => {
            Z(e);
          },
        });
      }
      var mt = typeof TextDecoder < `u` ? new TextDecoder(`utf-16le`) : void 0;
      function ht(e, t) {
        for (var n = e, r = n >> 1, i = r + t / 2; !(r >= i) && D[r];) ++r;
        if (((n = r << 1), n - e > 32 && mt))
          return mt.decode(T.subarray(e, n));
        for (var a = ``, o = 0; !(o >= t / 2); ++o) {
          var s = E[(e + o * 2) >> 1];
          if (s == 0) break;
          a += String.fromCharCode(s);
        }
        return a;
      }
      function gt(e, t, n) {
        if ((n === void 0 && (n = 2147483647), n < 2)) return 0;
        n -= 2;
        for (
          var r = t, i = n < e.length * 2 ? n / 2 : e.length, a = 0;
          a < i;
          ++a
        ) {
          var o = e.charCodeAt(a);
          ((E[t >> 1] = o), (t += 2));
        }
        return ((E[t >> 1] = 0), t - r);
      }
      function _t(e) {
        return e.length * 2;
      }
      function vt(e, t) {
        for (var n = 0, r = ``; !(n >= t / 4);) {
          var i = O[(e + n * 4) >> 2];
          if (i == 0) break;
          if ((++n, i >= 65536)) {
            var a = i - 65536;
            r += String.fromCharCode(55296 | (a >> 10), 56320 | (a & 1023));
          } else r += String.fromCharCode(i);
        }
        return r;
      }
      function yt(e, t, n) {
        if ((n === void 0 && (n = 2147483647), n < 4)) return 0;
        for (var r = t, i = r + n - 4, a = 0; a < e.length; ++a) {
          var o = e.charCodeAt(a);
          if (o >= 55296 && o <= 57343) {
            var s = e.charCodeAt(++a);
            o = (65536 + ((o & 1023) << 10)) | (s & 1023);
          }
          if (((O[t >> 2] = o), (t += 4), t + 4 > i)) break;
        }
        return ((O[t >> 2] = 0), t - r);
      }
      function bt(e) {
        for (var t = 0, n = 0; n < e.length; ++n) {
          var r = e.charCodeAt(n);
          (r >= 55296 && r <= 57343 && ++n, (t += 4));
        }
        return t;
      }
      function xt(e, t, n) {
        n = R(n);
        var r, i, a, o, s;
        (t === 2
          ? ((r = ht), (i = gt), (o = _t), (a = () => D), (s = 1))
          : t === 4 && ((r = vt), (i = yt), (o = bt), (a = () => k), (s = 2)),
          W(e, {
            name: n,
            fromWireType: (e) => {
              for (
                var n = k[e >> 2], i = a(), o, c = e + 4, l = 0;
                l <= n;
                ++l
              ) {
                var u = e + 4 + l * t;
                if (l == n || i[u >> s] == 0) {
                  var d = u - c,
                    f = r(c, d);
                  (o === void 0 ? (o = f) : ((o += `\0`), (o += f)),
                    (c = u + t));
                }
              }
              return (Z(e), o);
            },
            toWireType: (e, r) => {
              typeof r != `string` &&
                U(`Cannot pass non-string to C++ string type ` + n);
              var a = o(r),
                c = X(4 + a + t);
              return (
                (k[c >> 2] = a >> s),
                i(r, c + 4, a + t),
                e !== null && e.push(Z, c),
                c
              );
            },
            argPackAdvance: 8,
            readValueFromPointer: J,
            destructorFunction: (e) => {
              Z(e);
            },
          }));
      }
      function St(e, t) {
        ((t = R(t)),
          W(e, {
            isVoid: !0,
            name: t,
            argPackAdvance: 0,
            fromWireType: () => void 0,
            toWireType: (e, t) => {},
          }));
      }
      function Ct(e) {
        e > 4 && (K[e].refcount += 1);
      }
      var wt = {};
      function Tt(e) {
        var t = wt[e];
        return t === void 0 ? R(e) : t;
      }
      function Et(e) {
        return q.toHandle(Tt(e));
      }
      function Dt() {
        return q.toHandle({});
      }
      function Ot(e, t, n) {
        ((e = q.toValue(e)),
          (t = q.toValue(t)),
          (n = q.toValue(n)),
          (e[t] = n));
      }
      function kt(e, t) {
        var n = B[e];
        return (n === void 0 && U(t + ` has unknown type ` + st(e)), n);
      }
      function At(e, t) {
        e = kt(e, `_emval_take_value`);
        var n = e.readValueFromPointer(t);
        return q.toHandle(n);
      }
      function jt() {
        N(``);
      }
      function Mt(e, t, n) {
        T.copyWithin(e, t, t + n);
      }
      function Nt() {
        return 2147483648;
      }
      function Pt(e) {
        try {
          return (b.grow((e - C.byteLength + 65535) >>> 16), le(b.buffer), 1);
        } catch {}
      }
      function Ft(e) {
        var length3 = T.length;
        e >>>= 0;
        var n = Nt();
        if (e > n) return !1;
        let r = (e, t) => e + ((t - (e % t)) % t);
        for (var i = 1; i <= 4; i *= 2) {
          var a = length3 * (1 + 0.2 / i);
          if (
            ((a = Math.min(a, e + 100663296)),
            Pt(Math.min(n, r(Math.max(e, a), 65536))))
          )
            return !0;
        }
        return !1;
      }
      var It = {
        varargs: void 0,
        get: () => ((It.varargs += 4), O[(It.varargs - 4) >> 2]),
        getStr: (e) => S(e),
      };
      function Lt(e) {
        (me() || (t.onExit && t.onExit(e), (x = !0)), o(e, new F(e)));
      }
      function Rt(e, t) {
        Lt(e);
      }
      var zt = Rt;
      function Bt(e) {
        return 52;
      }
      function Vt(e, t, n, r, i) {
        return 70;
      }
      var Ht = [null, [], []];
      function Ut(e, t) {
        var n = Ht[e];
        t === 0 || t === 10
          ? ((e === 1 ? ee : v)(re(n, 0)), (n.length = 0))
          : n.push(t);
      }
      function Wt(e, t, n, r) {
        for (var i = 0, a = 0; a < n; a++) {
          var o = k[t >> 2],
            s = k[(t + 4) >> 2];
          t += 8;
          for (var c = 0; c < s; c++) Ut(e, T[o + c]);
          i += s;
        }
        return ((k[r >> 2] = i), 0);
      }
      function Gt(e) {
        return t[`_` + e];
      }
      function Kt(e, t) {
        w.set(e, t);
      }
      function qt(e, t, n, r, i) {
        var a = {
          string: (e) => {
            var t = 0;
            if (e != null && e !== 0) {
              var n = (e.length << 2) + 1;
              ((t = Q(n)), ae(e, t, n));
            }
            return t;
          },
          array: (e) => {
            var t = Q(e.length);
            return (Kt(e, t), t);
          },
        };
        function o(e) {
          return t === `string` ? S(e) : t === `boolean` ? !!e : e;
        }
        var s = Gt(e),
          c = [],
          l = 0;
        if (r)
          for (var u = 0; u < r.length; u++) {
            var d = a[n[u]];
            d ? (l === 0 && (l = en()), (c[u] = d(r[u]))) : (c[u] = r[u]);
          }
        var f = s.apply(null, c);
        function p(e) {
          return (l !== 0 && tn(l), o(e));
        }
        return ((f = p(f)), f);
      }
      function Jt(e, t, n, r) {
        n ||= [];
        var i = n.every((e) => e === `number` || e === `boolean`);
        return t !== `string` && i && !r
          ? Gt(e)
          : function () {
              return qt(e, t, n, arguments, r);
            };
      }
      (Ae(),
        (Ie = t.BindingError = H(Error, `BindingError`)),
        (Le = t.InternalError = H(Error, `InternalError`)),
        We(),
        (ot = t.UnboundTypeError = H(Error, `UnboundTypeError`)));
      var Yt = {
        _embind_register_bigint: ke,
        _embind_register_bool: Be,
        _embind_register_emval: Ge,
        _embind_register_float: qe,
        _embind_register_function: lt,
        _embind_register_integer: dt,
        _embind_register_memory_view: ft,
        _embind_register_std_string: pt,
        _embind_register_std_wstring: xt,
        _embind_register_void: St,
        _emval_decref: Ve,
        _emval_incref: Ct,
        _emval_new_cstring: Et,
        _emval_new_object: Dt,
        _emval_set_property: Ot,
        _emval_take_value: At,
        abort: jt,
        emscripten_memcpy_big: Mt,
        emscripten_resize_heap: Ft,
        exit: zt,
        fd_close: Bt,
        fd_seek: Vt,
        fd_write: Wt,
      };
      Oe();
      var Xt = (t.___wasm_call_ctors = function () {
          return (Xt = t.___wasm_call_ctors = t.asm.__wasm_call_ctors).apply(
            null,
            arguments,
          );
        }),
        X = (t._malloc = function () {
          return (X = t._malloc = t.asm.malloc).apply(null, arguments);
        }),
        Z = (t._free = function () {
          return (Z = t._free = t.asm.free).apply(null, arguments);
        }),
        Zt = (t.___getTypeName = function () {
          return (Zt = t.___getTypeName = t.asm.__getTypeName).apply(
            null,
            arguments,
          );
        }),
        Qt = (t.__embind_initialize_bindings = function () {
          return (Qt = t.__embind_initialize_bindings =
            t.asm._embind_initialize_bindings).apply(null, arguments);
        }),
        $t = (t.___errno_location = function () {
          return ($t = t.___errno_location = t.asm.__errno_location).apply(
            null,
            arguments,
          );
        }),
        en = (t.stackSave = function () {
          return (en = t.stackSave = t.asm.stackSave).apply(null, arguments);
        }),
        tn = (t.stackRestore = function () {
          return (tn = t.stackRestore = t.asm.stackRestore).apply(
            null,
            arguments,
          );
        }),
        Q = (t.stackAlloc = function () {
          return (Q = t.stackAlloc = t.asm.stackAlloc).apply(null, arguments);
        }),
        nn = (t.___cxa_demangle = function () {
          return (nn = t.___cxa_demangle = t.asm.__cxa_demangle).apply(
            null,
            arguments,
          );
        }),
        rn = (t.dynCall_jiji = function () {
          return (rn = t.dynCall_jiji = t.asm.dynCall_jiji).apply(
            null,
            arguments,
          );
        });
      ((t.ccall = qt), (t.cwrap = Jt));
      var $;
      M = function e() {
        ($ || an(), $ || (M = e));
      };
      function an(e) {
        if (((e ||= a), A > 0 || (he(), A > 0))) return;
        function r() {
          $ ||
            (($ = !0),
            (t.calledRun = !0),
            !x &&
              (ge(),
              n(t),
              t.onRuntimeInitialized && t.onRuntimeInitialized(),
              _e()));
        }
        t.setStatus
          ? (t.setStatus(`Running...`),
            setTimeout(() => {
              (setTimeout(() => {
                t.setStatus(``);
              }, 1),
                r());
            }, 1))
          : r();
      }
      if (t.preInit)
        for (
          typeof t.preInit == `function` && (t.preInit = [t.preInit]);
          t.preInit.length > 0;
        )
          t.preInit.pop()();
      return (an(), t.ready);
    }
  );
})();
typeof exports == `object` && typeof module == `object`
  ? (module.exports = Module)
  : typeof define == `function` && define.amd
    ? define([], () => Module)
    : typeof exports == `object` && (exports.Module = Module);
