var createObject = Object.create;
var po = Object.defineProperty;
var yo = Object.getOwnPropertyDescriptor;
var co = Object.getOwnPropertyNames;
var bo = Object.getPrototypeOf;
var go = Object.prototype.hasOwnProperty;
var createCommonJsLoader = (e, r) => () => {
  if (!r) {
    e(
      (r = {
        exports: {},
      }).exports,
      r,
    );
    e = null;
  }
  return r.exports;
};
var defineModuleExports = (e, r) => {
  let t = {};
  for (var n in e) {
    po(t, n, {
      get: e[n],
      enumerable: true,
    });
  }
  if (!r) {
    po(t, Symbol.toStringTag, {
      value: "Module",
    });
  }
  return t;
};
var toEsModule = (e, r, t) => {
  t = e != null ? createObject(bo(e)) : {};
  return ((e, r, t, n) => {
    if ((r && typeof r == "object") || typeof r == "function") {
      var o;
      var u = co(r);
      for (var l = 0, length2 = u.length; l < length2; l++) {
        o = u[l];
        if (!go.call(e, o) && o !== t) {
          po(e, o, {
            get: ((e) => r[e]).bind(null, o),
            enumerable: !(n = yo(r, o)) || n.enumerable,
          });
        }
      }
    }
    return e;
  })(
    !r && e && e.__esModule && go.call(e, "default")
      ? t
      : po(t, "default", {
          value: e,
          enumerable: true,
        }),
    e,
  );
};
var runtimeRequire = ((e) =>
  typeof require != "undefined"
    ? require
    : typeof Proxy != "undefined"
      ? new Proxy(e, {
          get: (e, r) => (typeof require != "undefined" ? require : e)[r],
        })
      : e)(function (e) {
  if (typeof require != "undefined") {
    return require.apply(this, arguments);
  }
  throw Error(
    'Calling `require` for "' +
      e +
      "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.",
  );
});
export {
  toEsModule,
  defineModuleExports,
  runtimeRequire,
  createCommonJsLoader,
};
