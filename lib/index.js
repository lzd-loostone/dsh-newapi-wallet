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
function validateVolatileSchema(schema, path2 = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
  const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
  if (states.has(blocked)) return;
  states.add(blocked);
  seen.set(schema, states);
  if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path: path2 });
  const nested = blocked || !!schema.meta?.volatile;
  if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path2, key], nested, seen);
  if (schema.sKey) validateVolatileSchema(schema.sKey, [...path2, "<key>"], true, seen);
  if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path2, "*"], true, seen);
  if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path2, String(index)], true, seen);
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

// src/pool.ts
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  if (items.length === 0) return out;
  let next = 0;
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    for (; ; ) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  }));
  return out;
}
var MAX_RETRY_DELAY_MS = 2500;
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
function retryDelayMs(attempt, retryAfterSec) {
  if (retryAfterSec !== void 0 && Number.isFinite(retryAfterSec) && retryAfterSec >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(retryAfterSec * 1e3));
  }
  return Math.min(MAX_RETRY_DELAY_MS, 400 * 3 ** Math.max(0, Math.floor(attempt)));
}
function shouldRetryNow(attempt, retryAfterSec, maxAttempts = 2) {
  if (attempt >= maxAttempts) return false;
  if (retryAfterSec !== void 0 && Number.isFinite(retryAfterSec) && retryAfterSec * 1e3 > MAX_RETRY_DELAY_MS) {
    return false;
  }
  return true;
}

// src/limit.ts
function createLimiter(limit) {
  const max = Math.max(1, Math.floor(limit) || 1);
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start === void 0) return;
    active += 1;
    start();
  };
  return async (fn) => {
    if (active < max && queue.length === 0) {
      active += 1;
    } else {
      await new Promise((resolve2) => {
        queue.push(resolve2);
      });
    }
    try {
      return await fn();
    } finally {
      active -= 1;
      pump();
    }
  };
}
var configured = Number(process.env.DSH_NEWAPI_WALLET_CONCURRENCY);
var gatewayLimit = createLimiter(Number.isFinite(configured) && configured > 0 ? configured : 8);

// src/fingerprint.ts
var PROBE_MS = 8e3;
var PROBE_PATH = "/api/status";
var cache = /* @__PURE__ */ new Map();
async function probe(origin, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const response = await gatewayLimit(() => fetch(new URL(PROBE_PATH, origin), {
      headers: { accept: "application/json" },
      signal: controller.signal
    }));
    const parsed = await response.json().catch(() => ({}));
    const body = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : void 0;
      if (shouldRetryNow(attempt, wait, 1)) {
        await sleep(retryDelayMs(attempt, wait));
        return probe(origin, attempt + 1);
      }
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: {} };
  } finally {
    clearTimeout(timer);
  }
}
function score({ status, body }) {
  if (status === 0) return { software: "unknown", reason: `\u8FDE\u4E0D\u4E0A\u7AD9\u70B9\uFF08${PROBE_PATH}\uFF09` };
  if (status === 429) {
    return { software: "unknown", reason: "\u7AD9\u70B9\u6B63\u5728\u9650\u6D41\uFF08HTTP 429\uFF09\uFF0C\u7A0D\u540E\u81EA\u52A8\u91CD\u8BD5" };
  }
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

// src/store.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var UNITS_TTL_MS = 10 * 6e4;
var DAY_KEEP_DAYS = 7;
var HISTORY_KEEP_DAYS = 28;
function defaultStoreDir() {
  const override = process.env.DSH_NEWAPI_WALLET_CACHE_DIR;
  if (typeof override === "string" && override.trim() !== "") return override.trim();
  return path.join(os.homedir(), ".dsh", "newapi-wallet-cache");
}
function loadSqlite() {
  try {
    const get = process.getBuiltinModule;
    if (typeof get === "function") {
      const mod = get("node:sqlite");
      if (mod?.DatabaseSync !== void 0) return { DatabaseSync: mod.DatabaseSync };
    }
  } catch {
  }
  return void 0;
}
function shiftDay(day, deltaDays) {
  const [y, m, d] = day.split("-").map(Number);
  const date2 = new Date(y, (m ?? 1) - 1, d ?? 1);
  date2.setDate(date2.getDate() + deltaDays);
  const mm = String(date2.getMonth() + 1).padStart(2, "0");
  const dd = String(date2.getDate()).padStart(2, "0");
  return date2.getFullYear() + "-" + mm + "-" + dd;
}
var SCHEMA = `
CREATE TABLE IF NOT EXISTS units (
  origin TEXT PRIMARY KEY,
  quota_per_unit REAL NOT NULL,
  usd_rate REAL,
  currency TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS day_rows (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL, id TEXT NOT NULL,
  t INTEGER NOT NULL, m TEXT, k TEXT, g TEXT,
  q REAL NOT NULL, i REAL NOT NULL, o REAL NOT NULL, r REAL NOT NULL, w REAL NOT NULL,
  pi INTEGER NOT NULL, po INTEGER NOT NULL, pr INTEGER NOT NULL, pw INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day, id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS day_meta (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL,
  newest INTEGER NOT NULL, server_total INTEGER, truncated INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS history (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL,
  quota REAL NOT NULL, calls INTEGER NOT NULL, available INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day)
) WITHOUT ROWID;
`;
var sharedState = { ready: false };
function sharedStore() {
  if (!sharedState.ready) {
    sharedState = { ready: true, store: openStore() };
  }
  return sharedState.store;
}
function openStore(dir = defaultStoreDir()) {
  const sqlite = loadSqlite();
  if (sqlite === void 0) return void 0;
  let db;
  try {
    fs.mkdirSync(dir, { recursive: true });
    db = new sqlite.DatabaseSync(path.join(dir, "wallet.db"));
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    db.exec(SCHEMA);
  } catch {
    return void 0;
  }
  let broken = false;
  const debug = process.env.DSH_NEWAPI_WALLET_CACHE_DEBUG === "1";
  const guard = (fn, fallback) => {
    if (broken) return fallback;
    try {
      return fn();
    } catch (error) {
      broken = true;
      if (debug) console.error("[newapi-wallet] cache store failed:", error);
      return fallback;
    }
  };
  return {
    getUnits(origin, now) {
      return guard(() => {
        const row = db.prepare("SELECT quota_per_unit, usd_rate, currency, at FROM units WHERE origin = ?").get(origin);
        if (row === void 0) return void 0;
        if (now - row.at > UNITS_TTL_MS) return void 0;
        return {
          quotaPerUnit: row.quota_per_unit,
          ...row.usd_rate !== null ? { usdExchangeRate: row.usd_rate } : {},
          ...row.currency !== null ? { displayCurrency: row.currency } : {}
        };
      }, void 0);
    },
    setUnits(origin, units, at) {
      guard(() => {
        db.prepare(
          "INSERT INTO units (origin, quota_per_unit, usd_rate, currency, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(origin) DO UPDATE SET quota_per_unit = excluded.quota_per_unit, usd_rate = excluded.usd_rate, currency = excluded.currency, at = excluded.at"
        ).run(origin, units.quotaPerUnit, units.usdExchangeRate ?? null, units.displayCurrency ?? null, at);
      }, void 0);
    },
    getDay(origin, account, day) {
      return guard(() => {
        const meta = db.prepare("SELECT newest, server_total, truncated FROM day_meta WHERE origin = ? AND account = ? AND day = ?").get(origin, account, day);
        const raw = db.prepare(
          "SELECT id, t, m, k, g, q, i, o, r, w, pi, po, pr, pw FROM day_rows WHERE origin = ? AND account = ? AND day = ?"
        ).all(origin, account, day);
        if (raw.length === 0 && meta === void 0) return void 0;
        const rows = raw.map((row) => {
          const out = {
            id: String(row.id),
            t: Number(row.t),
            q: Number(row.q),
            i: Number(row.i),
            o: Number(row.o),
            r: Number(row.r),
            w: Number(row.w),
            pi: Number(row.pi),
            po: Number(row.po),
            pr: Number(row.pr),
            pw: Number(row.pw)
          };
          if (typeof row.m === "string") out.m = row.m;
          if (typeof row.k === "string") out.k = row.k;
          if (typeof row.g === "string") out.g = row.g;
          return out;
        });
        return {
          rows,
          newest: meta?.newest ?? rows.reduce((max, row) => Math.max(max, Math.floor(row.t / 1e3)), 0),
          ...meta?.server_total !== null && meta?.server_total !== void 0 ? { serverTotal: meta.server_total } : {},
          truncated: (meta?.truncated ?? 0) === 1
        };
      }, void 0);
    },
    appendRows(origin, account, day, rows, newest, serverTotal, truncated) {
      guard(() => {
        if (rows.length > 0) {
          const insert = db.prepare(
            "INSERT OR IGNORE INTO day_rows (origin, account, day, id, t, m, k, g, q, i, o, r, w, pi, po, pr, pw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          );
          db.exec("BEGIN");
          try {
            for (const row of rows) {
              insert.run(
                origin,
                account,
                day,
                row.id,
                row.t,
                row.m ?? null,
                row.k ?? null,
                row.g ?? null,
                row.q,
                row.i,
                row.o,
                row.r,
                row.w,
                row.pi,
                row.po,
                row.pr,
                row.pw
              );
            }
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        }
        db.prepare(
          "INSERT INTO day_meta (origin, account, day, newest, server_total, truncated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(origin, account, day) DO UPDATE SET newest = MAX(day_meta.newest, excluded.newest), server_total = COALESCE(excluded.server_total, day_meta.server_total), truncated = MAX(day_meta.truncated, excluded.truncated)"
        ).run(origin, account, day, newest, serverTotal ?? null, truncated === true ? 1 : 0);
      }, void 0);
    },
    getHistoryDay(origin, account, day) {
      return guard(() => {
        const row = db.prepare("SELECT quota, calls, available, at FROM history WHERE origin = ? AND account = ? AND day = ?").get(origin, account, day);
        if (row === void 0) return void 0;
        return { quota: row.quota, calls: row.calls, available: row.available === 1, at: row.at };
      }, void 0);
    },
    setHistoryDay(origin, account, day, value) {
      guard(() => {
        db.prepare(
          "INSERT INTO history (origin, account, day, quota, calls, available, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(origin, account, day) DO UPDATE SET quota = excluded.quota, calls = excluded.calls, available = excluded.available, at = excluded.at"
        ).run(origin, account, day, value.quota, value.calls, value.available ? 1 : 0, Date.now());
      }, void 0);
    },
    prune(today) {
      guard(() => {
        const dayCutoff = shiftDay(today, -DAY_KEEP_DAYS);
        const historyCutoff = shiftDay(today, -HISTORY_KEEP_DAYS);
        db.exec("BEGIN");
        try {
          db.prepare("DELETE FROM day_rows WHERE day < ?").run(dayCutoff);
          db.prepare("DELETE FROM day_meta WHERE day < ?").run(dayCutoff);
          db.prepare("DELETE FROM history WHERE day < ?").run(historyCutoff);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }, void 0);
    },
    close() {
      if (broken) return;
      try {
        db.close();
      } catch {
      }
    }
  };
}

// src/ledger.ts
var PAGE_SIZE = 100;
var MAX_PAGES = 200;
var CONCURRENCY = 12;
var CALLS_MAX = 30;
var TIMEOUT_MS = 15e3;
var caches = /* @__PURE__ */ new Map();
function cacheKey(origin, accountKey, day) {
  return origin + "|" + accountKey + "|" + day;
}
function cacheKeyForTest(origin, accountKey, day) {
  return cacheKey(origin, accountKey, day);
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
var sleep2 = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
async function fetchPage(origin, accessKey, params, attempt = 0) {
  const url = new URL("/api/log/self", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await gatewayLimit(() => fetch(url, {
      headers: { accept: "application/json", authorization: "Bearer " + accessKey },
      signal: controller.signal
    }));
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : void 0;
      if (shouldRetryNow(attempt, wait, 1)) {
        await sleep2(retryDelayMs(attempt, wait));
        return fetchPage(origin, accessKey, params, attempt + 1);
      }
    }
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
  const added = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const row = toRow(item);
    if (row === void 0 || cache2.rows.has(row.id)) continue;
    cache2.rows.set(row.id, row);
    added.push(row);
    const sec = Math.floor(row.t / 1e3);
    if (sec > cache2.newest) cache2.newest = sec;
  }
  return added;
}
async function fetchPages(cache2, origin, accessKey, from2, to, pages, sink) {
  let anyOk = false;
  let failed = 0;
  const queue = [...pages];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const page = queue.shift();
      if (page === void 0) return;
      const result = await fetchPage(origin, accessKey, {
        type: 2,
        p: page,
        page_size: PAGE_SIZE,
        start_timestamp: from2,
        end_timestamp: to
      });
      if (!result.ok) {
        failed += 1;
        continue;
      }
      anyOk = true;
      if (result.total !== void 0) cache2.serverTotal = result.total;
      const added = absorb(cache2, result.items);
      if (sink !== void 0) sink.push(...added);
    }
  });
  await Promise.all(workers);
  return failed;
}
async function loadDay(origin, accountKey, accessKey) {
  const now = Date.now();
  const day = localDay(now);
  for (const [key2, entry] of caches) {
    if (entry.day !== day) caches.delete(key2);
  }
  const key = cacheKey(origin, accountKey, day);
  const store = sharedStore();
  let cache2 = caches.get(key);
  if (cache2 === void 0) {
    cache2 = { day, origin, rows: /* @__PURE__ */ new Map(), newest: 0, truncated: false, primed: false };
    const stored = store?.getDay(origin, accountKey, day);
    if (stored !== void 0 && stored.rows.length > 0) {
      for (const row of stored.rows) cache2.rows.set(row.id, row);
      cache2.newest = stored.newest;
      if (stored.serverTotal !== void 0) cache2.serverTotal = stored.serverTotal;
      cache2.truncated = stored.truncated;
      cache2.primed = true;
    }
    caches.set(key, cache2);
  }
  const addedRows = [];
  const to = Math.floor(now / 1e3);
  if (!cache2.primed) {
    const first = await fetchPage(origin, accessKey, {
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
    addedRows.push(...absorb(cache2, first.items));
    if (before === 0 && cache2.newest > 0) cache2.newest = Math.max(cache2.newest - 1, dayStartSeconds(now));
    const total = cache2.serverTotal ?? first.items.length;
    const wanted = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const capped = Math.min(wanted, MAX_PAGES);
    cache2.truncated = wanted > MAX_PAGES;
    if (capped > 1) {
      const rest = [];
      for (let page = 2; page <= capped; page++) rest.push(page);
      const failedPages = await fetchPages(cache2, origin, accessKey, dayStartSeconds(now), to, rest, addedRows);
      if (failedPages > 0) {
        cache2.primed = false;
        cache2.truncated = false;
      }
    }
    persist(store, origin, accountKey, day, addedRows, cache2);
    return cache2;
  }
  const dayFrom = dayStartSeconds(now);
  const head = await fetchPage(origin, accessKey, {
    type: 2,
    p: 1,
    page_size: PAGE_SIZE,
    start_timestamp: dayFrom,
    end_timestamp: to
  });
  if (head.ok) {
    if (head.total !== void 0) cache2.serverTotal = head.total;
    addedRows.push(...absorb(cache2, head.items));
    if (cache2.rows.size > 0) cache2.newest = Math.max(cache2.newest - 1, dayFrom);
  }
  if (cache2.serverTotal !== void 0) cache2.truncated = cache2.serverTotal > MAX_PAGES * PAGE_SIZE;
  if (cache2.newest > 0 && to > cache2.newest) {
    const startNewest = cache2.newest;
    let page = 1;
    let deltaFailed = false;
    while (page <= MAX_PAGES) {
      const result = await fetchPage(origin, accessKey, {
        type: 2,
        p: page,
        page_size: PAGE_SIZE,
        start_timestamp: cache2.newest,
        end_timestamp: to
      });
      if (!result.ok) {
        deltaFailed = true;
        break;
      }
      addedRows.push(...absorb(cache2, result.items));
      if (result.items.length < PAGE_SIZE) break;
      page += 1;
    }
    if (deltaFailed) cache2.newest = startNewest;
  }
  persist(store, origin, accountKey, day, addedRows, cache2);
  return cache2;
}
function persist(store, origin, accountKey, day, addedRows, cache2) {
  if (store === void 0) return;
  if (addedRows.length > 0 || cache2.serverTotal !== void 0) {
    store.appendRows(origin, accountKey, day, addedRows, cache2.newest, cache2.serverTotal, cache2.truncated);
  }
  if (prunedFor !== day) {
    prunedFor = day;
    store.prune(day);
  }
}
var prunedFor;
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
async function readLedger(origin, accountKey, accessKey, filter = {}) {
  const cache2 = await loadDay(origin, accountKey, accessKey);
  if (cache2 === void 0 || !cache2.primed) return void 0;
  return aggregate(cache2, filter);
}

// src/accounts.ts
import { createHash } from "node:crypto";
var MAX_ACCOUNTS = 8;
function accountKeyForToken(token) {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
function readEntry(value) {
  if (value === null || typeof value !== "object") return { name: "", token: "" };
  const entry = value;
  const name2 = typeof entry.name === "string" ? entry.name.trim() : "";
  const token = typeof entry.token === "string" ? entry.token.trim() : "";
  return { name: name2, token };
}
function parseAccounts(config) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const dict = config?.accounts;
  if (dict !== null && typeof dict === "object" && !Array.isArray(dict)) {
    for (const [key, value] of Object.entries(dict)) {
      if (out.length >= MAX_ACCOUNTS) break;
      const entry = readEntry(value);
      if (entry.token === "" || seen.has(entry.token)) continue;
      seen.add(entry.token);
      out.push({ key, name: entry.name !== "" ? entry.name : `\u8D26\u53F7${out.length + 1}`, token: entry.token });
    }
  }
  if (out.length === 0) {
    const legacy = typeof config?.accessToken === "string" ? config.accessToken.trim() : "";
    if (legacy !== "") out.push({ key: "legacy", name: "\u9ED8\u8BA4\u8D26\u53F7", token: legacy });
  }
  return out;
}

// src/merge.ts
var CALLS_MAX2 = 30;
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
function sumDefined(values) {
  let total;
  for (const value of values) {
    if (value === void 0 || !Number.isFinite(value)) continue;
    total = (total ?? 0) + value;
  }
  return total === void 0 ? void 0 : total;
}
function mergeMoney(list) {
  const present = list.filter((money) => money !== void 0 && money !== null);
  if (present.length === 0) return void 0;
  const out = {};
  if (present.some((money) => money.quota !== void 0)) {
    out.quota = round6(present.reduce((sum, money) => sum + (money.quota ?? 0), 0));
  }
  if (present.some((money) => money.display !== void 0)) {
    out.display = round6(present.reduce((sum, money) => sum + (money.display ?? 0), 0));
  }
  const currency = present.find((money) => money.currency !== void 0)?.currency;
  if (currency !== void 0) out.currency = currency;
  if (present.every((money) => money.usd !== void 0)) {
    out.usd = round6(present.reduce((sum, money) => sum + (money.usd ?? 0), 0));
  }
  return out;
}
function mergeBuckets(list) {
  const present = list.filter((buckets) => buckets !== void 0);
  if (present.length === 0) return void 0;
  const out = {};
  const fields = ["requests", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "totalTokens"];
  for (const field of fields) {
    const total = sumDefined(present.map((buckets) => buckets[field]));
    if (total !== void 0) out[field] = total;
  }
  return out;
}
function mergeAmounts(list) {
  const present = list.filter((amounts) => amounts !== void 0);
  if (present.length === 0) return void 0;
  const out = {};
  const fields = ["input", "output", "cacheRead", "cacheWrite", "total"];
  let any = false;
  for (const field of fields) {
    const merged = mergeMoney(present.map((amounts) => amounts[field]));
    if (merged !== void 0) {
      out[field] = merged;
      any = true;
    }
  }
  return any ? out : void 0;
}
function mergeHistory(list) {
  const byDate = /* @__PURE__ */ new Map();
  for (const history of list) {
    for (const point of history ?? []) {
      const hit = byDate.get(point.date);
      if (hit === void 0) {
        byDate.set(point.date, { ...point, ...point.amount !== void 0 ? { amount: { ...point.amount } } : {} });
        continue;
      }
      hit.quota = round6(hit.quota + point.quota);
      if (point.calls !== void 0) hit.calls = (hit.calls ?? 0) + point.calls;
      hit.available = hit.available || point.available;
      const amount = mergeMoney([hit.amount, point.amount]);
      if (amount !== void 0) hit.amount = amount;
    }
  }
  if (byDate.size === 0) return void 0;
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function accumulateRow(map, row) {
  const hit = map.get(row.name);
  if (hit === void 0) {
    map.set(row.name, { ...row, ...row.amount !== void 0 ? { amount: { ...row.amount } } : {} });
    return;
  }
  hit.quota = round6(hit.quota + row.quota);
  hit.calls += row.calls;
  if (row.tokens !== void 0) hit.tokens = (hit.tokens ?? 0) + row.tokens;
  const amount = mergeMoney([hit.amount, row.amount]);
  if (amount !== void 0) hit.amount = amount;
}
function mergeSnapshots(parts, _lowBalanceCny = 5) {
  const okParts = parts.filter((part) => part.snapshot.ok === true);
  const failures = parts.filter((part) => part.snapshot.ok !== true).map((part) => ({ name: part.name, error: part.snapshot.error }));
  if (okParts.length === 0) {
    const first2 = failures[0];
    return {
      ok: false,
      error: first2?.error ?? "unauthorized",
      ...failures.length > 1 ? { detail: failures.map((failure) => failure.name + "\uFF1A" + failure.error).join("\uFF1B") } : {}
    };
  }
  const multi = parts.length > 1;
  const first = okParts[0].snapshot;
  const accounts = parts.map((part) => {
    if (part.snapshot.ok !== true) return { name: part.name, error: part.snapshot.error };
    const snapshot2 = part.snapshot;
    return {
      name: part.name,
      ...snapshot2.remaining !== void 0 ? { remaining: snapshot2.remaining } : {},
      ...snapshot2.today !== void 0 ? { today: snapshot2.today } : {},
      ...snapshot2.used !== void 0 ? { used: snapshot2.used } : {}
    };
  });
  const todayMoney = mergeMoney(okParts.map((part) => part.snapshot.today));
  const requests = sumDefined(okParts.map((part) => part.snapshot.today?.requests));
  const today = todayMoney === void 0 ? void 0 : requests === void 0 ? todayMoney : { ...todayMoney, requests };
  const models = /* @__PURE__ */ new Map();
  for (const part of okParts) {
    for (const row of part.snapshot.todayModels ?? []) accumulateRow(models, row);
  }
  const tokenRows = [];
  for (const part of okParts) {
    for (const row of part.snapshot.todayTokenRows ?? []) {
      tokenRows.push(multi ? { ...row, name: part.name + " - " + row.name, account: part.name } : row);
    }
  }
  const calls = [];
  for (const part of okParts) {
    for (const call of part.snapshot.recentCalls ?? []) {
      calls.push(multi ? { ...call, account: part.name } : call);
    }
  }
  calls.sort((a, b) => b.createdAt - a.createdAt);
  const merged = {
    ok: true,
    fetchedAt: Math.max(...okParts.map((part) => part.snapshot.fetchedAt)),
    route: first.route,
    displayName: first.displayName,
    origin: first.origin,
    ...first.scheme !== void 0 ? { scheme: first.scheme } : {},
    ...first.model !== void 0 ? { model: first.model } : {},
    ...first.keyName !== void 0 ? { keyName: first.keyName } : {},
    ...first.keyHint !== void 0 ? { keyHint: first.keyHint } : {},
    ...mergeMoney(okParts.map((part) => part.snapshot.remaining)) !== void 0 ? { remaining: mergeMoney(okParts.map((part) => part.snapshot.remaining)) } : {},
    ...mergeMoney(okParts.map((part) => part.snapshot.used)) !== void 0 ? { used: mergeMoney(okParts.map((part) => part.snapshot.used)) } : {},
    ...today !== void 0 ? { today } : {},
    ...mergeBuckets(okParts.map((part) => part.snapshot.todayTokens)) !== void 0 ? { todayTokens: mergeBuckets(okParts.map((part) => part.snapshot.todayTokens)) } : {},
    ...mergeAmounts(okParts.map((part) => part.snapshot.todayAmounts)) !== void 0 ? { todayAmounts: mergeAmounts(okParts.map((part) => part.snapshot.todayAmounts)) } : {},
    ...mergeHistory(okParts.map((part) => part.snapshot.dailyHistory)) !== void 0 ? { dailyHistory: mergeHistory(okParts.map((part) => part.snapshot.dailyHistory)) } : {},
    ...sumDefined(okParts.map((part) => part.snapshot.todayLogRows)) !== void 0 ? { todayLogRows: sumDefined(okParts.map((part) => part.snapshot.todayLogRows)) } : {},
    ...okParts.some((part) => part.snapshot.todayLogsTruncated === true) ? { todayLogsTruncated: true } : {},
    ...sumDefined(okParts.map((part) => part.snapshot.todayLedgerRows)) !== void 0 ? { todayLedgerRows: sumDefined(okParts.map((part) => part.snapshot.todayLedgerRows)) } : {},
    ...models.size > 0 ? { todayModels: [...models.values()].sort((a, b) => b.quota - a.quota) } : {},
    ...tokenRows.length > 0 ? { todayTokenRows: tokenRows.sort((a, b) => b.quota - a.quota) } : {},
    ...calls.length > 0 ? { recentCalls: calls.slice(0, CALLS_MAX2) } : {},
    ...!multi && first.rate !== void 0 ? { rate: first.rate } : {},
    ...first.todayUnavailableReason !== void 0 ? { todayUnavailableReason: first.todayUnavailableReason } : {},
    todayAvailable: okParts.some((part) => part.snapshot.todayAvailable),
    accounts,
    ...failures.length > 0 ? { accountFailures: failures } : {},
    ...mergeMoney(okParts.map((part) => part.snapshot.remaining))?.quota !== void 0 ? { isAvailable: (mergeMoney(okParts.map((part) => part.snapshot.remaining))?.quota ?? 0) > 0 } : {}
  };
  return merged;
}

// src/snapshot.ts
var TIMEOUT_MS2 = 15e3;
var HEAT_DAYS = 28;
var HEAT_FILL_MAX = 12;
var HISTORY_NEGATIVE_TTL_MS = 30 * 6e4;
var ACCOUNT_CONCURRENCY = 3;
var FALLBACK_CURRENCY = "CNY";
function num2(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function round62(value) {
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
function readAt(section, path2) {
  let cursor = section;
  for (const key of path2) {
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
  const usd = units.quotaPerUnit > 0 ? round62(quota / units.quotaPerUnit) : void 0;
  const rate = units.usdExchangeRate ?? 1;
  const display = usd !== void 0 ? round62(usd * rate) : void 0;
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
var sleep3 = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
async function getJson(origin, path2, apiKey, params = {}, attempt = 0) {
  const url = new URL(path2, origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS2);
  try {
    const headers = { accept: "application/json" };
    if (apiKey !== void 0 && apiKey !== "") headers.authorization = `Bearer ${apiKey}`;
    const response = await gatewayLimit(() => fetch(url, { headers, signal: controller.signal }));
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : void 0;
      if (shouldRetryNow(attempt, wait)) {
        await sleep3(retryDelayMs(attempt, wait));
        return getJson(origin, path2, apiKey, params, attempt + 1);
      }
    }
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
  const store = sharedStore();
  const cached = store?.getUnits(origin, Date.now());
  if (cached !== void 0) {
    return {
      quotaPerUnit: cached.quotaPerUnit,
      usdExchangeRate: cached.usdExchangeRate ?? 1,
      displayCurrency: cached.displayCurrency === "USD" ? "USD" : FALLBACK_CURRENCY
    };
  }
  try {
    const { status, body } = await getJson(origin, "/api/status", void 0);
    const data = body.data ?? body;
    if (!isNewApiOk(status, body)) return { quotaPerUnit: 5e5, displayCurrency: FALLBACK_CURRENCY };
    const quotaPerUnit = num2(data.quota_per_unit) ?? 5e5;
    const usdExchangeRate = num2(data.usd_exchange_rate) ?? num2(data.custom_currency_exchange_rate) ?? 1;
    const displayType = typeof data.quota_display_type === "string" ? data.quota_display_type : void 0;
    const displayCurrency = displayType === "CNY" || displayType === "USD" ? displayType : FALLBACK_CURRENCY;
    const units = {
      quotaPerUnit: quotaPerUnit > 0 ? quotaPerUnit : 5e5,
      usdExchangeRate: usdExchangeRate > 0 ? usdExchangeRate : 1,
      displayCurrency
    };
    store?.setUnits(origin, {
      quotaPerUnit: units.quotaPerUnit,
      ...units.usdExchangeRate !== void 0 ? { usdExchangeRate: units.usdExchangeRate } : {},
      ...units.displayCurrency !== void 0 ? { displayCurrency: units.displayCurrency } : {}
    }, Date.now());
    return units;
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
function accountTokens() {
  return parseAccounts(accessConfigSource?.get());
}
function tokenNameForAccount(filterToken, accountName) {
  if (filterToken === void 0 || filterToken === "") return void 0;
  const prefix = accountName + " - ";
  return filterToken.startsWith(prefix) ? filterToken.slice(prefix.length) : filterToken;
}
async function listAccounts(ctx) {
  const { accounts: detected } = await newApiAccounts(ctx);
  const current = currentAccount(detected, ctx);
  const out = [];
  for (const account of detected) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv);
    const hasCredential = apiKey !== void 0 && apiKey !== "";
    const hasAccessKey = accountTokens().length > 0;
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
async function readHours28(origin, accessKey) {
  const now = Date.now();
  const firstDayStart = localDayStartMs(now - (HEAT_DAYS - 1) * 864e5);
  try {
    const aggregate3 = await getJson(origin, "/api/data/self", accessKey, {
      start_timestamp: Math.floor(firstDayStart / 1e3),
      end_timestamp: Math.floor(now / 1e3),
      default_time: "hour"
    });
    if (!isNewApiOk(aggregate3.status, aggregate3.body)) return void 0;
    return Array.isArray(aggregate3.body.data) ? aggregate3.body.data : [];
  } catch {
    return void 0;
  }
}
async function fetchToday(origin, accessKey, units, hours) {
  const now = Date.now();
  const from2 = Math.floor(localDayStartMs(now) / 1e3);
  const to = Math.floor(now / 1e3);
  const today = localDayString(now);
  const outcome = {};
  try {
    const stat = await getJson(origin, "/api/log/self/stat", accessKey, {
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
        outcome.todayPoint = { quota, calls: num2(data.count) ?? 0 };
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
  if (hours !== void 0) {
    const byModel = modelsFromHours(hours, today);
    if (byModel.length > 0) {
      outcome.models = byModel.map((row) => ({ ...row, amount: quotaToMoney(row.quota, units) })).sort((a, b) => b.quota - a.quota);
      let quota = 0;
      let requests = 0;
      let tokens;
      for (const row of byModel) {
        quota += row.quota;
        requests += row.calls;
        if (row.tokens !== void 0) tokens = (tokens ?? 0) + row.tokens;
      }
      if (outcome.money === void 0 && quota > 0) outcome.money = quotaToMoney(quota, units);
      if (outcome.requests === void 0 && requests > 0) outcome.requests = requests;
      if (tokens !== void 0) outcome.tokens = { ...outcome.tokens, totalTokens: tokens };
    }
  }
  if (outcome.money === void 0) outcome.reason = "gateway-logs-unavailable";
  return outcome;
}
function modelsFromHours(rows, today) {
  const byModel = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row;
    const ms = epochMs(num2(record.created_at));
    if (ms === void 0 || localDayString(ms) !== today) continue;
    const quota = num2(record.quota) ?? 0;
    const rowCalls = num2(record.count) ?? 0;
    const requestCount = num2(record.request_count) ?? 0;
    const tokens = num2(record.token_used) ?? 0;
    const model = typeof record.model_name === "string" && record.model_name !== "" ? record.model_name : "\u672A\u77E5\u6A21\u578B";
    const calls = requestCount > 0 ? requestCount : rowCalls;
    const hit = byModel.get(model);
    if (hit === void 0) byModel.set(model, { quota, calls, tokens });
    else {
      hit.quota += quota;
      hit.calls += calls;
      hit.tokens += tokens;
    }
  }
  return [...byModel.entries()].map(([name2, value]) => ({ name: name2, quota: value.quota, calls: value.calls, tokens: value.tokens })).sort((a, b) => b.quota - a.quota);
}
async function fetchDailyHistory(origin, accountKey, accessKey, units, hours, todayPoint) {
  const now = Date.now();
  const todayStr = localDayString(now);
  const store = sharedStore();
  const byDay = /* @__PURE__ */ new Map();
  for (const row of hours ?? []) {
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
  const dates = [];
  const dayStarts = /* @__PURE__ */ new Map();
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    const dayStart = localDayStartMs(now - i * 864e5);
    const date2 = localDayString(dayStart);
    dates.push(date2);
    dayStarts.set(date2, dayStart);
  }
  const resolved = /* @__PURE__ */ new Map();
  const pending = [];
  for (const date2 of dates) {
    const isToday = date2 === todayStr;
    if (isToday) {
      if (todayPoint !== void 0) resolved.set(date2, todayPoint);
      else pending.push(date2);
      continue;
    }
    const stored = store?.getHistoryDay(origin, accountKey, date2);
    if (stored !== void 0 && (stored.available || now - (stored.at ?? 0) < HISTORY_NEGATIVE_TTL_MS)) {
      resolved.set(date2, stored.available ? { quota: stored.quota, calls: stored.calls } : null);
      continue;
    }
    const fromHour = byDay.get(date2);
    if (fromHour !== void 0) {
      store?.setHistoryDay(origin, accountKey, date2, { quota: fromHour.quota, calls: fromHour.calls, available: true });
      resolved.set(date2, fromHour);
      continue;
    }
    pending.push(date2);
  }
  const missingDays = pending.filter((date2) => date2 !== todayStr).length;
  const firstFill = missingDays > HEAT_DAYS / 2;
  let fillBudget = firstFill ? HEAT_DAYS : HEAT_FILL_MAX;
  for (const date2 of [...pending].reverse()) {
    const isToday = date2 === todayStr;
    if (!isToday) {
      if (fillBudget <= 0) continue;
      fillBudget -= 1;
    }
    const dayStart = dayStarts.get(date2) ?? now;
    try {
      const s0 = Math.floor(dayStart / 1e3);
      const s1 = Math.min(s0 + 86400, Math.floor(now / 1e3));
      const stat = await getJson(origin, "/api/log/self/stat", accessKey, {
        type: 2,
        start_timestamp: s0,
        end_timestamp: s1
      });
      if (!isNewApiOk(stat.status, stat.body)) {
        if (!isToday) store?.setHistoryDay(origin, accountKey, date2, { quota: 0, calls: 0, available: false });
        continue;
      }
      const data = stat.body.data ?? {};
      const q = num2(data.quota);
      const point = q !== void 0 ? { quota: q, calls: num2(data.count) ?? 0 } : null;
      resolved.set(date2, point);
      if (!isToday) {
        store?.setHistoryDay(origin, accountKey, date2, {
          quota: point?.quota ?? 0,
          calls: point?.calls ?? 0,
          available: point !== null
        });
      }
    } catch {
    }
  }
  let resolvedAny = false;
  const points = dates.map((date2) => {
    const point = resolved.get(date2);
    if (point !== void 0 && point !== null) {
      resolvedAny = true;
      return {
        date: date2,
        available: true,
        quota: point.quota,
        calls: point.calls,
        amount: quotaToMoney(point.quota, units) ?? { quota: point.quota, currency: FALLBACK_CURRENCY }
      };
    }
    return { date: date2, available: false, quota: 0 };
  });
  if (!resolvedAny && hours === void 0) return void 0;
  return points;
}
async function readNewApi(account, accessKey, filter = {}) {
  const units = await readUnits(account.origin);
  let remaining;
  let used;
  let keyName;
  const self = await getJson(account.origin, "/api/user/self", accessKey);
  if (isNewApiOk(self.status, self.body)) {
    const data = self.body.data ?? {};
    remaining = quotaToMoney(num2(data.quota), units);
    used = quotaToMoney(num2(data.used_quota), units);
    const displayName = typeof data.display_name === "string" && data.display_name !== "" ? data.display_name : typeof data.username === "string" && data.username !== "" ? data.username : void 0;
    keyName = displayName;
  }
  const hours = await readHours28(account.origin, accessKey);
  const today = await fetchToday(account.origin, accessKey, units, hours);
  const todayOk = today.reason === void 0 && today.money !== void 0;
  const accountKey = accountKeyForToken(accessKey);
  const ledger = await readLedger(account.origin, accountKey, accessKey, filter);
  const recentCalls = ledger !== void 0 && ledger.calls.length > 0 ? ledger.calls.map((call) => ({
    createdAt: call.createdAt,
    ...call.model !== void 0 ? { model: call.model } : {},
    quota: round62(call.quota),
    amount: quotaToMoney(round62(call.quota), units),
    promptTokens: call.promptTokens,
    completionTokens: call.completionTokens,
    cacheTokens: call.cacheTokens,
    cacheWriteTokens: call.cacheWriteTokens,
    requestId: call.requestId,
    ...call.group !== void 0 ? { group: call.group } : {},
    ...call.tokenName !== void 0 ? { tokenName: call.tokenName } : {}
  })) : void 0;
  const dailyHistory = await fetchDailyHistory(account.origin, accountKey, accessKey, units, hours, today.todayPoint);
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
        input: quotaToMoney(round62(led.amountQuota.input), units),
        output: quotaToMoney(round62(led.amountQuota.output), units),
        cacheRead: quotaToMoney(round62(led.amountQuota.cacheRead), units),
        cacheWrite: quotaToMoney(round62(led.amountQuota.cacheWrite), units),
        total: quotaToMoney(round62(led.amountQuota.total), units)
      };
      const groupRows = (map) => [...map.entries()].map(([name2, row]) => ({
        name: name2,
        quota: round62(row.quota),
        calls: row.calls,
        tokens: row.tokens,
        amount: quotaToMoney(round62(row.quota), units)
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
  const tokens = accountTokens();
  if (tokens.length === 0) {
    return { ok: false, error: "no-access-token", detail: account.route };
  }
  const parts = await mapPool(tokens, ACCOUNT_CONCURRENCY, async (tokenAccount) => {
    const scoped = filter.token !== void 0 ? { ...filter, token: tokenNameForAccount(filter.token, tokenAccount.name) } : filter;
    try {
      return { name: tokenAccount.name, snapshot: await readNewApi(account, tokenAccount.token, scoped) };
    } catch (error) {
      const name2 = error instanceof Error && error.name === "AbortError" ? "timeout" : "unreachable";
      return { name: tokenAccount.name, snapshot: { ok: false, error: name2, detail: account.origin } };
    }
  });
  const merged = mergeSnapshots(parts, resolveLowBalanceCny());
  if (merged.ok !== true) return merged;
  merged.filter = {
    ...filter.model !== void 0 ? { model: filter.model } : {},
    ...filter.token !== void 0 ? { token: filter.token } : {},
    ...filter.account !== void 0 ? { account: filter.account } : {}
  };
  return merged;
}
function resolveRefreshMs() {
  const raw = accessConfigSource?.get()?.refreshMs;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 6e4;
  return Math.min(6e5, Math.max(1e4, Math.round(raw)));
}
function resolveLowBalanceCny() {
  const raw = accessConfigSource?.get()?.lowBalanceCny;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 5;
  return Math.min(1e6, Math.max(0, raw));
}
async function fetchBundle(ctx, route, filter = {}) {
  const accounts = await listAccounts(ctx);
  const selected = route !== void 0 && accounts.some((account) => account.route === route) ? route : accounts.find((account) => account.isCurrent)?.route ?? accounts[0]?.route ?? "";
  const refreshMs = accountTokens().length > 1 ? Math.max(3e4, resolveRefreshMs()) : resolveRefreshMs();
  return {
    accounts,
    selected,
    refreshMs,
    lowBalanceCny: resolveLowBalanceCny(),
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
  /**
   * 多账号：稳定键 → { 名字, 令牌 }。键（如 a1）是写入路径与账本缓存键的一部分，
   * 名字是用户随时可改的显示名——改名只写 name 子路径，令牌不动。
   * 令牌标 secret，宿主的 redactSecrets 按路径逐个摘掉，浏览器只能看到键与名字。
   */
  accounts: Schema.dict(Schema.object({
    name: Schema.string().default(""),
    token: Schema.string().role("secret").default("")
  })).default({}).volatile(),
  /** 旧版单令牌。保留一版用于迁移：accounts 为空时视为「默认账号」。 */
  accessToken: Schema.string().role("secret").default("").volatile(),
  /** 余额偏低阈值（人民币）。任一账号低于它，侧栏红点亮。 */
  lowBalanceCny: Schema.number().default(5).min(0).volatile(),
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
      const accounts = unwrapVolatile(config.accounts);
      const accessToken = unwrapVolatile(config.accessToken);
      const refreshMs = unwrapVolatile(config.refreshMs);
      const lowBalanceCny = unwrapVolatile(config.lowBalanceCny);
      return {
        ...accounts !== void 0 && accounts !== null && typeof accounts === "object" ? { accounts } : {},
        ...typeof accessToken === "string" ? { accessToken } : {},
        ...typeof refreshMs === "number" && Number.isFinite(refreshMs) ? { refreshMs } : {},
        ...typeof lowBalanceCny === "number" && Number.isFinite(lowBalanceCny) ? { lowBalanceCny } : {}
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
  MAX_RETRY_DELAY_MS,
  UNITS_TTL_MS,
  accountKeyForToken,
  apply,
  cacheKeyForTest,
  createLimiter,
  defaultStoreDir,
  gatewayLimit,
  mapPool,
  mergeMoney,
  mergeSnapshots,
  modelsFromHours,
  name,
  openStore,
  parseAccounts,
  resolveLowBalanceCny,
  retryDelayMs,
  setAccessConfigSource,
  shiftDay,
  shouldRetryNow
};
