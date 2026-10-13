// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
var write = /* @__PURE__ */ Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
  if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
  } finally {
    ancestors.delete(value);
  }
}
function createVolatile(value) {
  let current = snapshot(value);
  return Object.freeze({
    get: () => current,
    [write]: (value2) => {
      current = value2;
    }
  });
}
function isVolatile(value) {
  return typeof value === "object" && value !== null && write in value;
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  const ancestors = /* @__PURE__ */ new Set();
  function compare(a2, b2) {
    if (a2 === b2) return true;
    if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
    if (!strict && isNullable(a2) && isNullable(b2)) return true;
    if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
    if (ancestors.has(a2)) return false;
    function check(test, then) {
      return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
    }
    ancestors.add(a2);
    try {
      return check(Array.isArray, (a3, b3) => {
        if (a3.length !== b3.length) return false;
        for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
        return true;
      }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
        if (a3.byteLength !== b3.byteLength) return false;
        const viewA = new Uint8Array(a3);
        const viewB = new Uint8Array(b3);
        for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
        return true;
      }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
        ...a2,
        ...b2
      }).every((key) => compare(a2[key], b2[key])));
    } finally {
      ancestors.delete(a2);
    }
  }
  return compare(a, b);
}
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError];
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (isVolatile(value)) value = value.get();
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.volatile = function volatile() {
  if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
  return this.extra("volatile", true);
};
var resolvers = {};
var checkedVolatile = /* @__PURE__ */ Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (!options[checkedVolatile]) {
    validateVolatileSchema(schema, options.path);
    options = {
      ...options,
      [checkedVolatile]: true
    };
  }
  if (schema.meta?.volatile) {
    const inner = Schema(schema);
    inner.meta = {
      ...schema.meta,
      volatile: false
    };
    const [value, adapted] = Schema.resolve(data, inner, options, strict);
    try {
      return [createVolatile(value), adapted];
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : String(error), options);
    }
  }
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
    validateVolatileSchema(schema.inner, options.path, true);
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name2, keys, format) {
  formatters[name2] = format;
  Object.assign(Schema, { [name2](...args) {
    const schema = new Schema({ type: name2 });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name2 === "object" || name2 === "dict") schema.meta.default = {};
    else if (name2 === "array" || name2 === "tuple") schema.meta.default = [];
    else if (name2 === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// src/fingerprint.ts
var PROBE_MS = 8e3;
var PROBE_PATH = "/api/status";
var cache = /* @__PURE__ */ new Map();
async function probe(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const response = await fetch(new URL(PROBE_PATH, origin), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const parsed = await response.json().catch(() => ({}));
    const body = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { status: response.status, body };
  } catch {
    return { status: 0, body: {} };
  } finally {
    clearTimeout(timer);
  }
}
function score({ status, body }) {
  if (status === 0) return { software: "unknown", reason: `\u8FDE\u4E0D\u4E0A\u7AD9\u70B9\uFF08${PROBE_PATH}\uFF09` };
  if (status < 200 || status >= 300) {
    return { software: "unknown", reason: `\u7AD9\u70B9\u6CA1\u6709 New API \u7684 ${PROBE_PATH}\uFF08HTTP ${status}\uFF09` };
  }
  if (body.success === false || body.code === false) {
    return { software: "unknown", reason: `\u7AD9\u70B9\u62D2\u7EDD\u4E86 ${PROBE_PATH}` };
  }
  return { software: "newapi" };
}
async function fingerprintOrigin(origin) {
  const cached = cache.get(origin);
  if (cached !== void 0) return cached;
  const result = score(await probe(origin));
  if (result.software === "newapi") cache.set(origin, result);
  return result;
}

// src/ledger.ts
var PAGE_SIZE = 100;
var MAX_PAGES = 200;
var CONCURRENCY = 12;
var CALLS_MAX = 30;
var TIMEOUT_MS = 15e3;
var caches = /* @__PURE__ */ new Map();
function cacheKey(origin, day) {
  return origin + "|" + day;
}
function localDay(now = Date.now()) {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mm + "-" + dd;
}
function dayStartSeconds(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1e3);
}
function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function parsePrice(exprB64) {
  if (typeof exprB64 !== "string" || exprB64 === "") return void 0;
  let expression;
  try {
    expression = Buffer.from(exprB64, "base64").toString("utf8");
  } catch {
    return void 0;
  }
  const price = { p: 0, c: 0, cr: 0, cc: 0 };
  let hits = 0;
  for (const match of expression.matchAll(/\b(cc|cr|p|c)\s*\*\s*([0-9.]+)/g)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < 0) continue;
    price[match[1]] = value;
    hits += 1;
  }
  return hits === 0 ? void 0 : price;
}
function toRow(record) {
  const id = typeof record.request_id === "string" && record.request_id !== "" ? record.request_id : void 0;
  const sec = num(record.created_at);
  if (id === void 0 || sec === void 0 || sec <= 0) return void 0;
  const prompt = num(record.prompt_tokens) ?? 0;
  const completion = num(record.completion_tokens) ?? 0;
  let other = {};
  try {
    const parsed = JSON.parse(typeof record.other === "string" ? record.other : "{}");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) other = parsed;
  } catch {
  }
  const cacheRead = Math.min(num(other.cache_tokens) ?? 0, prompt);
  const cacheWrite = Math.min(num(other.cache_creation_tokens) ?? num(other.cache_write_tokens) ?? 0, prompt - cacheRead);
  const uncached = Math.max(prompt - cacheRead - cacheWrite, 0);
  const billed = num(record.quota) ?? 0;
  const price = parsePrice(other.expr_b64);
  const group = num(other.group_ratio) ?? num(other.user_group_ratio) ?? 1;
  const wIn = price !== void 0 ? uncached * price.p : uncached * (num(other.model_ratio) ?? 1) * group;
  const wOut = price !== void 0 ? completion * price.c : completion * (num(other.completion_ratio) ?? 1) * group;
  const wRead = price !== void 0 ? cacheRead * price.cr : cacheRead * (num(other.cache_ratio) ?? 0) * (num(other.model_ratio) ?? 1) * group;
  const wWrite = price !== void 0 ? cacheWrite * price.cc : 0;
  const sum = wIn + wOut + wRead + wWrite;
  let qi = 0, qo = 0, qr = 0, qw = 0;
  if (billed > 0 && sum > 0) {
    const k = billed / sum;
    qi = wIn * k;
    qo = wOut * k;
    qr = wRead * k;
    qw = wWrite * k;
  } else if (billed > 0) {
    qi = billed;
  }
  const model = typeof record.model_name === "string" && record.model_name !== "" ? record.model_name : void 0;
  const tokenName = typeof record.token_name === "string" && record.token_name !== "" ? record.token_name : void 0;
  const groupName = typeof record.group === "string" && record.group !== "" ? record.group : void 0;
  return {
    id,
    t: sec > 1e12 ? sec : sec * 1e3,
    ...model !== void 0 ? { m: model } : {},
    ...tokenName !== void 0 ? { k: tokenName } : {},
    ...groupName !== void 0 ? { g: groupName } : {},
    q: billed,
    i: qi,
    o: qo,
    r: qr,
    w: qw,
    pi: uncached,
    po: completion,
    pr: cacheRead,
    pw: cacheWrite
  };
}
async function fetchPage(origin, accessKey2, params) {
  const url = new URL("/api/log/self", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", authorization: "Bearer " + accessKey2 },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (response.status < 200 || response.status >= 300) return { ok: false, items: [] };
    if (body.success === false || body.code === false) return { ok: false, items: [] };
    const payload = body.data;
    const items = payload !== null && typeof payload === "object" && Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [];
    const total = payload !== null && typeof payload === "object" ? num(payload.total) : void 0;
    return { ok: true, items, ...total !== void 0 ? { total } : {} };
  } catch {
    return { ok: false, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
function absorb(cache2, items) {
  let added = 0;
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const row = toRow(item);
    if (row === void 0 || cache2.rows.has(row.id)) continue;
    cache2.rows.set(row.id, row);
    added += 1;
    const sec = Math.floor(row.t / 1e3);
    if (sec > cache2.newest) cache2.newest = sec;
  }
  return added;
}
async function fetchPages(cache2, origin, accessKey2, from2, to, pages) {
  let anyOk = false;
  const queue = [...pages];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const page = queue.shift();
      if (page === void 0) return;
      const result = await fetchPage(origin, accessKey2, {
        type: 2,
        p: page,
        page_size: PAGE_SIZE,
        start_timestamp: from2,
        end_timestamp: to
      });
      if (!result.ok) continue;
      anyOk = true;
      if (result.total !== void 0) cache2.serverTotal = result.total;
      absorb(cache2, result.items);
    }
  });
  await Promise.all(workers);
  return anyOk;
}
async function loadDay(origin, accessKey2) {
  const now = Date.now();
  const day = localDay(now);
  for (const [key2, entry] of caches) {
    if (entry.day !== day) caches.delete(key2);
  }
  const key = cacheKey(origin, day);
  let cache2 = caches.get(key);
  if (cache2 === void 0) {
    cache2 = { day, origin, rows: /* @__PURE__ */ new Map(), newest: 0, truncated: false, primed: false };
    caches.set(key, cache2);
  }
  const to = Math.floor(now / 1e3);
  if (!cache2.primed) {
    const first = await fetchPage(origin, accessKey2, {
      type: 2,
      p: 1,
      page_size: PAGE_SIZE,
      start_timestamp: dayStartSeconds(now),
      end_timestamp: to
    });
    if (!first.ok) return cache2.rows.size > 0 ? cache2 : void 0;
    cache2.primed = true;
    if (first.total !== void 0) cache2.serverTotal = first.total;
    const before = cache2.newest;
    absorb(cache2, first.items);
    if (before === 0 && cache2.newest > 0) cache2.newest = Math.max(cache2.newest - 1, dayStartSeconds(now));
    const total = cache2.serverTotal ?? first.items.length;
    const wanted = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const capped = Math.min(wanted, MAX_PAGES);
    cache2.truncated = wanted > MAX_PAGES;
    if (capped > 1) {
      const rest = [];
      for (let page = 2; page <= capped; page++) rest.push(page);
      await fetchPages(cache2, origin, accessKey2, dayStartSeconds(now), to, rest);
    }
    return cache2;
  }
  const dayFrom = dayStartSeconds(now);
  const head = await fetchPage(origin, accessKey2, {
    type: 2,
    p: 1,
    page_size: PAGE_SIZE,
    start_timestamp: dayFrom,
    end_timestamp: to
  });
  if (head.ok) {
    if (head.total !== void 0) cache2.serverTotal = head.total;
    absorb(cache2, head.items);
    if (cache2.rows.size > 0) cache2.newest = Math.max(cache2.newest - 1, dayFrom);
  }
  if (cache2.serverTotal !== void 0) cache2.truncated = cache2.serverTotal > MAX_PAGES * PAGE_SIZE;
  if (cache2.newest > 0 && to > cache2.newest) {
    let page = 1;
    while (page <= MAX_PAGES) {
      const result = await fetchPage(origin, accessKey2, {
        type: 2,
        p: page,
        page_size: PAGE_SIZE,
        start_timestamp: cache2.newest,
        end_timestamp: to
      });
      if (!result.ok) break;
      absorb(cache2, result.items);
      if (result.items.length < PAGE_SIZE) break;
      page += 1;
    }
  }
  return cache2;
}
function aggregate(cache2, filter = {}) {
  const wantModel = filter.model !== void 0 && filter.model !== "" ? filter.model : void 0;
  const wantToken = filter.token !== void 0 && filter.token !== "" ? filter.token : void 0;
  const out = {
    ok: true,
    rows: 0,
    allRows: cache2.rows.size,
    ...cache2.serverTotal !== void 0 ? { serverTotal: cache2.serverTotal } : {},
    truncated: cache2.truncated,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    amountQuota: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    models: /* @__PURE__ */ new Map(),
    tokensByName: /* @__PURE__ */ new Map(),
    calls: []
  };
  const all = [...cache2.rows.values()];
  all.sort((a, b) => b.t - a.t);
  const bump = (map, name2, row) => {
    const tokens = row.pi + row.po + row.pr + row.pw;
    const hit = map.get(name2);
    if (hit === void 0) map.set(name2, { quota: row.q, calls: 1, tokens });
    else {
      hit.quota += row.q;
      hit.calls += 1;
      hit.tokens += tokens;
    }
  };
  for (const row of all) {
    if (row.m !== void 0) bump(out.models, row.m, row);
    if (row.k !== void 0) bump(out.tokensByName, row.k, row);
    if (wantModel !== void 0 && row.m !== wantModel) continue;
    if (wantToken !== void 0 && row.k !== wantToken) continue;
    out.rows += 1;
    out.inputTokens += row.pi;
    out.outputTokens += row.po;
    out.cacheReadTokens += row.pr;
    out.cacheWriteTokens += row.pw;
    out.amountQuota.input += row.i;
    out.amountQuota.output += row.o;
    out.amountQuota.cacheRead += row.r;
    out.amountQuota.cacheWrite += row.w;
    out.amountQuota.total += row.q;
    if (out.calls.length < CALLS_MAX) {
      out.calls.push({
        createdAt: row.t,
        ...row.m !== void 0 ? { model: row.m } : {},
        quota: row.q,
        promptTokens: row.pi + row.pr + row.pw,
        completionTokens: row.po,
        cacheTokens: row.pr,
        cacheWriteTokens: row.pw,
        requestId: row.id,
        ...row.g !== void 0 ? { group: row.g } : {},
        ...row.k !== void 0 ? { tokenName: row.k } : {}
      });
    }
  }
  return out;
}
async function readLedger(origin, accessKey2, filter = {}) {
  const cache2 = await loadDay(origin, accessKey2);
  if (cache2 === void 0 || !cache2.primed) return void 0;
  return aggregate(cache2, filter);
}

// src/snapshot.ts
var TIMEOUT_MS2 = 15e3;
var HEAT_DAYS = 28;
var HEAT_FILL_MAX = 12;
var FALLBACK_CURRENCY = "CNY";
function num2(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
function originOf(baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl === "") return void 0;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return void 0;
  }
}
function readAt(section, path) {
  let cursor = section;
  for (const key of path) {
    if (cursor === null || typeof cursor !== "object" || Array.isArray(cursor)) return void 0;
    cursor = cursor[key];
  }
  return cursor;
}
function maskKey(apiKey) {
  const last4 = apiKey.slice(-4);
  if (apiKey.startsWith("sk-")) return `sk-\u2022\u2022\u2022\u2022${last4}`;
  return `\u2022\u2022\u2022\u2022${last4}`;
}
function localDayStartMs(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function localDayString(ms) {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function quotaToMoney(quota, units) {
  if (quota === void 0) return void 0;
  const usd = units.quotaPerUnit > 0 ? round6(quota / units.quotaPerUnit) : void 0;
  const rate = units.usdExchangeRate ?? 1;
  const display = usd !== void 0 ? round6(usd * rate) : void 0;
  const currency = units.displayCurrency === "USD" ? "CNY" : units.displayCurrency ?? FALLBACK_CURRENCY;
  const out = { quota };
  if (display !== void 0) out.display = display;
  out.currency = currency;
  if (usd !== void 0 && rate !== 1) out.usd = usd;
  return out;
}
function epochMs(value) {
  if (value === void 0 || !Number.isFinite(value) || value <= 0) return void 0;
  return value > 1e12 ? value : value * 1e3;
}
async function getJson(origin, path, apiKey, params = {}) {
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS2);
  try {
    const headers = { accept: "application/json" };
    if (apiKey !== void 0 && apiKey !== "") headers.authorization = `Bearer ${apiKey}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}
function isNewApiOk(status, body) {
  if (status < 200 || status >= 300) return false;
  if (body.success === false || body.code === false) return false;
  return true;
}
async function readUnits(origin) {
  try {
    const { status, body } = await getJson(origin, "/api/status", void 0);
    const data = body.data ?? body;
    if (!isNewApiOk(status, body)) return { quotaPerUnit: 5e5, displayCurrency: FALLBACK_CURRENCY };
    const quotaPerUnit = num2(data.quota_per_unit) ?? 5e5;
    const usdExchangeRate = num2(data.usd_exchange_rate) ?? num2(data.custom_currency_exchange_rate) ?? 1;
    const displayType = typeof data.quota_display_type === "string" ? data.quota_display_type : void 0;
    const displayCurrency = displayType === "CNY" || displayType === "USD" ? displayType : FALLBACK_CURRENCY;
    return {
      quotaPerUnit: quotaPerUnit > 0 ? quotaPerUnit : 5e5,
      usdExchangeRate: usdExchangeRate > 0 ? usdExchangeRate : 1,
      displayCurrency
    };
  } catch {
    return { quotaPerUnit: 5e5, displayCurrency: FALLBACK_CURRENCY };
  }
}
function hostLabel(origin) {
  try {
    const url = new URL(origin);
    return url.port === "" ? url.hostname : `${url.hostname}:${url.port}`;
  } catch {
    return origin;
  }
}
function settingsValues(ctx) {
  const out = /* @__PURE__ */ new Map();
  const settings = ctx.get("settings");
  if (settings?.describe === void 0) return out;
  try {
    for (const row of settings.describe()) {
      if (row !== null && typeof row?.ns === "string") out.set(row.ns, row.value);
    }
  } catch {
  }
  return out;
}
function listRouteAccounts(ctx) {
  const llm = ctx.get("llm");
  if (llm?.listConfigurableProviders === void 0) return [];
  const values = settingsValues(ctx);
  const out = [];
  for (const entry of llm.listConfigurableProviders()) {
    let profile;
    try {
      profile = readAt(values.get(entry.settingsNs), entry.settingsPath ?? []);
    } catch {
      profile = void 0;
    }
    const typed = profile;
    const origin = originOf(typed?.baseURL ?? typed?.baseUrl);
    if (origin === void 0) continue;
    const apiKeyEnv = typeof typed?.apiKeyEnv === "string" && typed.apiKeyEnv !== "" ? typed.apiKeyEnv : void 0;
    out.push({
      route: entry.provider,
      displayName: entry.displayName ?? entry.provider,
      origin,
      ...apiKeyEnv !== void 0 ? { apiKeyEnv } : {}
    });
  }
  return out;
}
async function newApiAccounts(ctx) {
  const all = listRouteAccounts(ctx);
  const marks = await Promise.all(all.map((account) => fingerprintOrigin(account.origin)));
  const accounts = [];
  const reasons = [];
  all.forEach((account, index) => {
    const mark = marks[index];
    if (mark?.software === "newapi") accounts.push(account);
    else reasons.push(`${account.displayName}\uFF08${account.origin}\uFF09\uFF1A${mark?.reason ?? "\u4E0D\u662F New API \u7AD9\u70B9"}`);
  });
  return { accounts, reasons };
}
function currentAccount(accounts, ctx) {
  if (accounts.length === 0) return void 0;
  const defaults = settingsValues(ctx).get("agent-default-model");
  const hit = defaults?.provider !== void 0 ? accounts.find((account2) => account2.route === defaults.provider) : void 0;
  const account = hit ?? accounts[0];
  if (account === void 0) return void 0;
  return defaults?.model !== void 0 ? { ...account, model: defaults.model } : account;
}
async function resolveApiKey(ctx, reference) {
  if (reference === void 0) return void 0;
  const credentials = ctx.get("credentials");
  if (credentials?.resolve === void 0) return void 0;
  try {
    const hit = await credentials.resolve(reference);
    if (typeof hit === "string") return hit;
    return typeof hit?.value === "string" ? hit.value : void 0;
  } catch {
    return void 0;
  }
}
var accessConfigSource;
function setAccessConfigSource(source) {
  accessConfigSource = source;
}
function accessKey() {
  const token = accessConfigSource?.get()?.accessToken;
  return typeof token === "string" && token.trim() !== "" ? token.trim() : void 0;
}
async function listAccounts(ctx) {
  const { accounts: detected } = await newApiAccounts(ctx);
  const current = currentAccount(detected, ctx);
  const out = [];
  for (const account of detected) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv);
    const hasCredential = apiKey !== void 0 && apiKey !== "";
    const hasAccessKey = accessKey() !== void 0;
    out.push({
      route: account.route,
      displayName: account.displayName,
      origin: account.origin,
      host: hostLabel(account.origin),
      hasCredential,
      hasAccessKey,
      isCurrent: current?.route === account.route,
      // 脱敏提示只反映「配了模型密钥」；访问令牌本身永不回传浏览器。
      ...hasCredential ? { keyHint: maskKey(apiKey ?? "") } : {}
    });
  }
  return out;
}
async function accountForRoute(ctx, route) {
  const { accounts, reasons } = await newApiAccounts(ctx);
  if (accounts.length === 0) {
    return reasons.length === 0 ? { ok: false, error: "no-provider" } : { ok: false, error: "no-newapi", detail: reasons.join("\uFF1B") };
  }
  const current = currentAccount(accounts, ctx);
  if (route === void 0 || route === "") {
    return current ?? { ok: false, error: "no-provider" };
  }
  const hit = accounts.find((account) => account.route === route);
  if (hit === void 0) return { ok: false, error: "unknown-account", detail: route };
  return current?.route === hit.route && current.model !== void 0 ? { ...hit, model: current.model } : hit;
}
async function fetchToday(origin, accessKey2, units) {
  const now = Date.now();
  const from2 = Math.floor(localDayStartMs(now) / 1e3);
  const to = Math.floor(now / 1e3);
  const outcome = {};
  try {
    const stat = await getJson(origin, "/api/log/self/stat", accessKey2, {
      type: 2,
      start_timestamp: from2,
      end_timestamp: to
    });
    if (isNewApiOk(stat.status, stat.body)) {
      const data = stat.body.data ?? {};
      const quota = num2(data.quota);
      if (quota !== void 0) {
        outcome.money = quotaToMoney(quota, units);
        outcome.requests = num2(data.count);
      }
      const rpm = num2(data.rpm);
      const tpm = num2(data.tpm);
      if (rpm !== void 0 || tpm !== void 0) {
        outcome.rate = {
          ...rpm !== void 0 ? { rpm } : {},
          ...tpm !== void 0 ? { tpm } : {}
        };
      }
    }
  } catch {
  }
  try {
    const aggregate3 = await getJson(origin, "/api/data/self", accessKey2, {
      start_timestamp: from2,
      end_timestamp: to,
      default_time: "hour"
    });
    if (isNewApiOk(aggregate3.status, aggregate3.body)) {
      const rows = Array.isArray(aggregate3.body.data) ? aggregate3.body.data : [];
      const byModel = /* @__PURE__ */ new Map();
      let quota = 0;
      let requests = 0;
      let tokensTotal;
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const record = row;
        const rowQuota = num2(record.quota) ?? 0;
        const rowCalls = num2(record.count) ?? 0;
        quota += rowQuota;
        const requestCount = num2(record.request_count) ?? 0;
        requests += requestCount > 0 ? requestCount : rowCalls;
        const rowTokens = num2(record.token_used);
        if (rowTokens !== void 0) tokensTotal = (tokensTotal ?? 0) + rowTokens;
        const model = typeof record.model_name === "string" && record.model_name !== "" ? record.model_name : "\u672A\u77E5\u6A21\u578B";
        const existing = byModel.get(model);
        if (existing === void 0) {
          byModel.set(model, { name: model, quota: rowQuota, calls: rowCalls, ...rowTokens !== void 0 ? { tokens: rowTokens } : {} });
        } else {
          existing.quota += rowQuota;
          existing.calls += rowCalls;
          if (rowTokens !== void 0) existing.tokens = (existing.tokens ?? 0) + rowTokens;
        }
      }
      if (byModel.size > 0) {
        outcome.models = [...byModel.values()].map((row) => ({ ...row, amount: quotaToMoney(row.quota, units) })).sort((a, b) => b.quota - a.quota);
      }
      if (outcome.money === void 0 && quota > 0) outcome.money = quotaToMoney(quota, units);
      if (outcome.requests === void 0 && requests > 0) outcome.requests = requests;
      if (tokensTotal !== void 0) {
        outcome.tokens = { ...outcome.tokens, totalTokens: tokensTotal };
      }
    }
  } catch {
  }
  if (outcome.money === void 0) outcome.reason = "gateway-logs-unavailable";
  return outcome;
}
async function fetchDailyHistory(origin, accessKey2, units) {
  const now = Date.now();
  const todayStr = localDayString(now);
  const firstDayStart = localDayStartMs(now - (HEAT_DAYS - 1) * 864e5);
  try {
    const aggregate3 = await getJson(origin, "/api/data/self", accessKey2, {
      start_timestamp: Math.floor(firstDayStart / 1e3),
      end_timestamp: Math.floor(now / 1e3),
      default_time: "hour"
    });
    if (!isNewApiOk(aggregate3.status, aggregate3.body)) return void 0;
    const rows = Array.isArray(aggregate3.body.data) ? aggregate3.body.data : [];
    const byDay = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (row === null || typeof row !== "object") continue;
      const record = row;
      const ms = epochMs(num2(record.created_at));
      if (ms === void 0) continue;
      const key = localDayString(ms);
      const quota = num2(record.quota) ?? 0;
      const calls = num2(record.count) ?? 0;
      const hit = byDay.get(key);
      if (hit === void 0) byDay.set(key, { quota, calls });
      else {
        hit.quota += quota;
        hit.calls += calls;
      }
    }
    let fillBudget = HEAT_FILL_MAX;
    const points = [];
    for (let i = HEAT_DAYS - 1; i >= 0; i--) {
      const dayStart = localDayStartMs(now - i * 864e5);
      const date2 = localDayString(dayStart);
      const fromHour = byDay.get(date2);
      let resolved = fromHour;
      const mustStat = date2 === todayStr;
      if ((resolved === void 0 || mustStat) && (mustStat || fillBudget > 0)) {
        if (!mustStat) fillBudget -= 1;
        try {
          const s0 = Math.floor(dayStart / 1e3);
          const s1 = Math.min(s0 + 86400, Math.floor(now / 1e3));
          const stat = await getJson(origin, "/api/log/self/stat", accessKey2, {
            type: 2,
            start_timestamp: s0,
            end_timestamp: s1
          });
          if (isNewApiOk(stat.status, stat.body)) {
            const data = stat.body.data ?? {};
            const q = num2(data.quota);
            if (q !== void 0) resolved = { quota: q, calls: num2(data.count) ?? 0 };
          }
        } catch {
        }
      }
      if (resolved !== void 0) {
        points.push({
          date: date2,
          available: true,
          quota: resolved.quota,
          calls: resolved.calls,
          amount: quotaToMoney(resolved.quota, units) ?? { quota: resolved.quota, currency: FALLBACK_CURRENCY }
        });
      } else {
        points.push({ date: date2, available: false, quota: 0 });
      }
    }
    return points;
  } catch {
    return void 0;
  }
}
async function readNewApi(account, accessKey2, filter = {}) {
  const units = await readUnits(account.origin);
  let remaining;
  let used;
  let keyName;
  const self = await getJson(account.origin, "/api/user/self", accessKey2);
  if (isNewApiOk(self.status, self.body)) {
    const data = self.body.data ?? {};
    remaining = quotaToMoney(num2(data.quota), units);
    used = quotaToMoney(num2(data.used_quota), units);
    const displayName = typeof data.display_name === "string" && data.display_name !== "" ? data.display_name : typeof data.username === "string" && data.username !== "" ? data.username : void 0;
    keyName = displayName;
  }
  const today = await fetchToday(account.origin, accessKey2, units);
  const todayOk = today.reason === void 0 && today.money !== void 0;
  const ledger = await readLedger(account.origin, accessKey2, filter);
  const recentCalls = ledger !== void 0 && ledger.calls.length > 0 ? ledger.calls.map((call) => ({
    createdAt: call.createdAt,
    ...call.model !== void 0 ? { model: call.model } : {},
    quota: round6(call.quota),
    amount: quotaToMoney(round6(call.quota), units),
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    cacheTokens: call.cacheTokens,
    cacheWriteTokens: call.cacheWriteTokens,
    requestId: call.requestId,
    ...call.group !== void 0 ? { group: call.group } : {},
    ...call.tokenName !== void 0 ? { tokenName: call.tokenName } : {}
  })) : void 0;
  const dailyHistory = await fetchDailyHistory(account.origin, accessKey2, units);
  let todayTokens;
  let todayAmounts;
  let todayModels = today.models;
  let todayTokenRows;
  {
    const led = ledger;
    const requests = led !== void 0 ? led.rows : today.requests;
    const inputTokens = led?.inputTokens;
    const outputTokens = led?.outputTokens;
    const cacheReadTokens = led?.cacheReadTokens;
    const cacheWriteTokens = led?.cacheWriteTokens;
    const total = led !== void 0 ? led.inputTokens + led.outputTokens + led.cacheReadTokens + led.cacheWriteTokens : today.tokens?.totalTokens;
    const hasAny = inputTokens !== void 0 || outputTokens !== void 0 || cacheReadTokens !== void 0 || cacheWriteTokens !== void 0 || total !== void 0 || requests !== void 0;
    if (hasAny) {
      todayTokens = {
        ...requests !== void 0 ? { requests } : {},
        ...inputTokens !== void 0 ? { inputTokens } : {},
        ...outputTokens !== void 0 ? { outputTokens } : {},
        ...cacheReadTokens !== void 0 ? { cacheReadTokens } : {},
        ...cacheWriteTokens !== void 0 ? { cacheWriteTokens } : {},
        ...total !== void 0 ? { totalTokens: total } : {}
      };
    }
    if (led !== void 0) {
      todayAmounts = {
        input: quotaToMoney(round6(led.amountQuota.input), units),
        output: quotaToMoney(round6(led.amountQuota.output), units),
        cacheRead: quotaToMoney(round6(led.amountQuota.cacheRead), units),
        cacheWrite: quotaToMoney(round6(led.amountQuota.cacheWrite), units),
        total: quotaToMoney(round6(led.amountQuota.total), units)
      };
      const groupRows = (map) => [...map.entries()].map(([name2, row]) => ({
        name: name2,
        quota: round6(row.quota),
        calls: row.calls,
        tokens: row.tokens,
        amount: quotaToMoney(round6(row.quota), units)
      })).sort((a, b) => b.quota - a.quota);
      if (led.models.size > 0) todayModels = groupRows(led.models);
      if (led.tokensByName.size > 0) todayTokenRows = groupRows(led.tokensByName);
    }
  }
  return {
    ok: true,
    fetchedAt: Date.now(),
    route: account.route,
    displayName: account.displayName,
    origin: account.origin,
    ...account.model !== void 0 ? { model: account.model } : {},
    ...keyName !== void 0 ? { keyName } : {},
    // keyHint 缺省：访问令牌绝不回传浏览器；sk- 密钥与查账无关。
    ...remaining !== void 0 ? { remaining } : {},
    ...used !== void 0 ? { used } : {},
    todayAvailable: todayOk,
    ...todayOk && today.money !== void 0 ? { today: { ...today.money, ...today.requests !== void 0 ? { requests: today.requests } : {} } } : {},
    ...!todayOk && today.reason !== void 0 ? { todayUnavailableReason: today.reason } : {},
    ...todayTokens !== void 0 ? { todayTokens } : {},
    ...todayAmounts !== void 0 ? { todayAmounts } : {},
    ...dailyHistory !== void 0 ? { dailyHistory } : {},
    // 空交集时它就是 0：0 是**结果**，不是「缺字段」，必须下发，否则右列数字自相矛盾。
    ...ledger !== void 0 ? { todayLogRows: ledger.rows } : {},
    ...ledger !== void 0 && ledger.truncated ? { todayLogsTruncated: true } : {},
    // 「今日 N 行」这里的 N 是**服务端**当日总行数，不是本地缓存行数——
    // 截断日要用它和「已统计 M 行」对比出漏了多少，否则这行状态永远自说自话。
    ...ledger !== void 0 && (ledger.serverTotal ?? ledger.allRows) > 0 ? { todayLedgerRows: ledger.serverTotal ?? ledger.allRows } : {},
    ...filter.model !== void 0 || filter.token !== void 0 ? { filter: { ...filter.model !== void 0 ? { model: filter.model } : {}, ...filter.token !== void 0 ? { token: filter.token } : {} } } : {},
    ...todayModels !== void 0 && todayModels.length > 0 ? { todayModels } : {},
    ...todayTokenRows !== void 0 && todayTokenRows.length > 0 ? { todayTokenRows } : {},
    ...recentCalls !== void 0 && recentCalls.length > 0 ? { recentCalls } : {},
    ...today.rate !== void 0 ? { rate: today.rate } : {},
    scheme: "newapi",
    isAvailable: remaining?.quota === void 0 || remaining.quota > 0
  };
}
async function fetchWallet(ctx, route, filter = {}) {
  const account = await accountForRoute(ctx, route);
  if ("ok" in account && account.ok === false) return account;
  const token = accessKey();
  if (token === void 0) {
    return { ok: false, error: "no-access-token", detail: account.route };
  }
  try {
    return await readNewApi(account, token, filter);
  } catch (error) {
    const name2 = error instanceof Error && error.name === "AbortError" ? "timeout" : "unreachable";
    return { ok: false, error: name2, detail: account.origin };
  }
}
function resolveRefreshMs() {
  const raw = accessConfigSource?.get()?.refreshMs;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 6e4;
  return Math.min(6e5, Math.max(1e4, Math.round(raw)));
}
async function fetchBundle(ctx, route, filter = {}) {
  const accounts = await listAccounts(ctx);
  const selected = route !== void 0 && accounts.some((account) => account.route === route) ? route : accounts.find((account) => account.isCurrent)?.route ?? accounts[0]?.route ?? "";
  return {
    accounts,
    selected,
    refreshMs: resolveRefreshMs(),
    wallet: await fetchWallet(ctx, selected === "" ? void 0 : selected, filter)
  };
}

// src/http.ts
var WALLET_PATH = "/api/newapi-wallet";
var LOGGER_KEY = "loostone-newapi-wallet";
function isLoopbackAddress(address) {
  if (typeof address !== "string" || address === "") return false;
  const bare = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (bare === "::1" || bare === "localhost") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}
function hostNameOf(header) {
  if (typeof header !== "string" || header === "") return "";
  if (header.startsWith("[")) return header.slice(1, header.indexOf("]"));
  const colon = header.lastIndexOf(":");
  return colon === -1 ? header : header.slice(0, colon);
}
function queryValue(req, key) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const value = url.searchParams.get(key);
    return value !== null && value !== "" ? value : void 0;
  } catch {
    return void 0;
  }
}
function screenRequest(req) {
  const peerOk = isLoopbackAddress(req.socket?.remoteAddress);
  const hostOk = isLoopbackAddress(hostNameOf(req.headers.host));
  if (peerOk && hostOk) return void 0;
  return { ok: false, error: "forbidden", status: 403 };
}
function send(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(value));
}
function fail(res, status, error, detail) {
  send(res, status, detail !== void 0 ? { ok: false, error, detail } : { ok: false, error });
}
function registerWalletRoute(ctx) {
  if (typeof ctx.inject !== "function") return false;
  ctx.inject(["webServer"], (scoped) => {
    const webServer = scoped.webServer;
    scoped.effect(() => webServer.register({
      kind: "exact",
      path: WALLET_PATH,
      handler: async (req, res) => {
        const refused = screenRequest(req);
        if (refused !== void 0) {
          fail(res, refused.status, refused.error);
          return;
        }
        if (req.method !== "GET") {
          fail(res, 405, "method-not-allowed");
          return;
        }
        const model = queryValue(req, "model");
        const token = queryValue(req, "token");
        const filter = {
          ...model !== void 0 ? { model } : {},
          ...token !== void 0 ? { token } : {}
        };
        try {
          send(res, 200, await fetchBundle(ctx, queryValue(req, "route"), filter));
        } catch (error) {
          ctx.logger?.(LOGGER_KEY)?.warn?.("wallet route failed: %s", error instanceof Error ? error.message : error);
          fail(res, 500, "internal");
        }
      }
    }), "loostone-newapi-wallet: http");
  });
  return true;
}

// src/index.ts
var name = "loostone-newapi-wallet";
var LOGGER_KEY2 = "loostone-newapi-wallet";
var Config = Schema.object({
  /** New API 访问令牌（用户中心 → 生成的访问令牌，非 sk- 模型密钥）。 */
  accessToken: Schema.string().role("secret").default("").volatile(),
  /** 浏览器轮询间隔（毫秒）。 */
  refreshMs: Schema.natural().default(6e4).volatile()
});
function unwrapVolatile(value) {
  if (value === null || typeof value !== "object") return value;
  const get = value.get;
  return typeof get === "function" ? get.call(value) : value;
}
function wireAccessConfig(config) {
  setAccessConfigSource({
    get: () => {
      const accessToken = unwrapVolatile(config.accessToken);
      const refreshMs = unwrapVolatile(config.refreshMs);
      return {
        ...typeof accessToken === "string" ? { accessToken } : {},
        ...typeof refreshMs === "number" && Number.isFinite(refreshMs) ? { refreshMs } : {}
      };
    }
  });
}
function apply(ctx, config = {}) {
  const logger = ctx.logger?.(LOGGER_KEY2) ?? ctx.logger;
  try {
    wireAccessConfig(config);
    const served = registerWalletRoute(ctx);
    if (served) logger?.info?.("serving /api/newapi-wallet");
    else logger?.info?.("no web server; wallet overlay will not be served");
  } catch (error) {
    logger?.warn?.("could not register wallet route: %s", error instanceof Error ? error.message : error);
  }
}
export {
  Config,
  apply,
  name
};
