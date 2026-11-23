// Third-party libraries used by the application chunks, from npm.
//
// The original build inlined these into one chunk and exported them under
// single letters. The application chunks still call React, ReactDOM and JSZip
// through the bundler's CommonJS interop (`toEsModule(requireReact())`), so
// those are exported as functions returning the CommonJS module object.
import react from "react";
import reactDom from "react-dom";
import reactDomClient from "react-dom/client";
import jsxRuntime from "react/jsx-runtime";
import jszip from "jszip";
import * as pako from "pako";
import { mat4, quat, vec2, vec3 } from "gl-matrix";
import PicoGL from "picogl";
import { Texture as PicoGLTexture } from "picogl/build/module/texture.js";
import * as z from "zod";
import { driver as createTourDriver } from "driver.js";
import "driver.js/dist/driver.css";

export const requireReact = () => react;
export const requireReactDom = () => reactDom;
export const requireReactDomClient = () => reactDomClient;
export const requireJsxRuntime = () => jsxRuntime;
export const requireJSZip = () => jszip;

export { pako, PicoGL, PicoGLTexture, createTourDriver };

export const mat4Add = mat4.add;
export const mat4Copy = mat4.copy;
export const mat4Create = mat4.create;
export const mat4FromQuat = mat4.fromQuat;
export const mat4FromScaling = mat4.fromScaling;
export const mat4GetScaling = mat4.getScaling;
export const mat4GetTranslation = mat4.getTranslation;
export const mat4Identity = mat4.identity;
export const mat4Invert = mat4.invert;
export const mat4Multiply = mat4.multiply;
export const quatCreate = quat.create;
export const quatIdentity = quat.identity;
export const quatMultiply = quat.multiply;
export const quatSetAxisAngle = quat.setAxisAngle;
export const vec2FromValues = vec2.fromValues;
export const vec3Create = vec3.create;
export const vec3Set = vec3.set;

export const zArray = z.array;
export const zBoolean = z.boolean;
export const zCustom = z.custom;
export const zDiscriminatedUnion = z.discriminatedUnion;
export const zEnum = z.enum;
export const zLiteral = z.literal;
export const zNull = z.null;
export const zNumber = z.number;
export const zObject = z.object;
export const zRecord = z.record;
export const zString = z.string;
export const zTuple = z.tuple;
export const zUndefined = z.undefined;
export const zUnion = z.union;
export const zUnknown = z.unknown;
export const ZodCatch = z.ZodCatch;
export const ZodError = z.ZodError;
export const ZOD_NEVER = z.NEVER;
