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
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
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
var resolvers = {};
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
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
    return schema.meta.default;
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
function exists(status) {
  return status !== void 0 && status !== 404 && status !== 0;
}
var SIGNATURES = [
  {
    software: "newapi",
    required: ["/api/status", "/api/usage/token"],
    absent: ["/v1/usage"]
  },
  {
    software: "sub2api",
    required: ["/v1/usage"],
    absent: ["/api/status", "/api/usage/token"]
  }
];
var PROBE_PATHS = [...new Set(SIGNATURES.flatMap((s) => [...s.required, ...s.absent]))];
var cache = /* @__PURE__ */ new Map();
async function probeStatus(origin, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const response = await fetch(new URL(path, origin), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
function score(statuses) {
  const hits = [];
  for (const signature of SIGNATURES) {
    let disqualified = false;
    let agreed = 0;
    let total = 0;
    for (const path of signature.required) {
      total += 1;
      if (exists(statuses[path])) agreed += 1;
      else disqualified = true;
    }
    for (const path of signature.absent) {
      total += 1;
      if (!exists(statuses[path])) agreed += 1;
      else disqualified = true;
    }
    if (!disqualified) hits.push({ software: signature.software, agreed, total });
  }
  const summary = Object.entries(statuses).map(([path, status]) => `${path}=${status === 0 ? "\xD7" : status}`).join(" ");
  if (hits.length === 0) {
    const values = Object.values(statuses);
    if (values.every((status) => status === 0)) {
      return { software: "unknown", reason: `\u8FDE\u4E0D\u4E0A\u7AD9\u70B9\uFF08${summary}\uFF09` };
    }
    const distinct = new Set(values);
    if (distinct.size === 1) {
      return { software: "unknown", reason: `\u63A2\u6D4B\u8DEF\u7531\u90FD\u8FD4\u56DE ${[...distinct][0]}\uFF0C\u65E0\u6CD5\u533A\u5206\u7A0B\u5E8F\uFF08${summary}\uFF09` };
    }
    return { software: "unknown", reason: `\u6CA1\u6709\u5339\u914D\u5230\u5DF2\u77E5\u8D26\u672C\u7A0B\u5E8F\uFF08${summary}\uFF09` };
  }
  hits.sort((a, b) => b.agreed / b.total - a.agreed / a.total);
  if (hits.length > 1 && hits[0].agreed / hits[0].total === hits[1].agreed / hits[1].total) {
    return { software: "unknown", reason: `\u540C\u65F6\u50CF ${hits.map((h) => h.software).join(" \u548C ")}\uFF08${summary}\uFF09` };
  }
  return { software: hits[0].software };
}
async function fingerprintOrigin(origin) {
  const cached = cache.get(origin);
  if (cached !== void 0) return cached;
  const statuses = {};
  await Promise.all(PROBE_PATHS.map(async (path) => {
    statuses[path] = await probeStatus(origin, path);
  }));
  const result = score(statuses);
  if (result.software === "sub2api" || result.software === "newapi") {
    cache.set(origin, result);
  }
  return result;
}

// src/snapshot.ts
var TIMEOUT_MS = 15e3;
var LOG_PAGE_SIZE = 100;
var RECENT_MAX = 30;
var LOG_MAX_PAGES = 10;
var HEAT_DAYS = 28;
var HEAT_FILL_MAX = 12;
var DEEPSEEK_ORIGIN = "https://api.deepseek.com";
var DEEPSEEK_KEY_ENV = "DEEPSEEK_API_KEY";
var FALLBACK_CURRENCY = "CNY";
function num(value) {
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
function isOfficialDeepSeekOrigin(origin) {
  try {
    return new URL(origin).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
}
function isOfficialDeepSeekProvider(provider) {
  return provider === "deepseek-official" || provider === "deepseek";
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    const quotaPerUnit = num(data.quota_per_unit) ?? 5e5;
    const usdExchangeRate = num(data.usd_exchange_rate) ?? num(data.custom_currency_exchange_rate) ?? 1;
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
function listRouteAccounts(ctx) {
  const llm = ctx.get("llm");
  const settings = ctx.get("settings");
  if (llm?.listConfigurableProviders === void 0 || settings?.get === void 0) return [];
  const out = [];
  for (const entry of llm.listConfigurableProviders()) {
    let profile;
    try {
      profile = readAt(settings.get(entry.settingsNs), entry.settingsPath ?? []);
    } catch {
      profile = void 0;
    }
    const typed = profile;
    let origin = originOf(typed?.baseURL ?? typed?.baseUrl);
    if (origin === void 0 && isOfficialDeepSeekProvider(entry.provider)) origin = DEEPSEEK_ORIGIN;
    if (origin === void 0) continue;
    const apiKeyEnv = typeof typed?.apiKeyEnv === "string" && typed.apiKeyEnv !== "" ? typed.apiKeyEnv : isOfficialDeepSeekProvider(entry.provider) ? DEEPSEEK_KEY_ENV : void 0;
    out.push({
      route: entry.provider,
      displayName: entry.displayName ?? entry.provider,
      origin,
      ...apiKeyEnv !== void 0 ? { apiKeyEnv } : {}
    });
  }
  return out;
}
function currentAccount(ctx) {
  const accounts = listRouteAccounts(ctx);
  if (accounts.length === 0) return void 0;
  const settings = ctx.get("settings");
  const defaults = settings?.get?.("agent-default-model");
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
function normalizedRouteKey(route) {
  return route.trim().toLowerCase();
}
function accessKeyForRoute(route) {
  const config = accessConfigSource?.get();
  const perRoute = config?.routeAccessTokens;
  if (perRoute !== void 0 && perRoute !== null && typeof perRoute === "object") {
    for (const [key, value] of Object.entries(perRoute)) {
      if (typeof value === "string" && value.trim() !== "" && normalizedRouteKey(key) === normalizedRouteKey(route)) {
        return value.trim();
      }
    }
  }
  const globalToken = config?.accessToken;
  if (typeof globalToken === "string" && globalToken.trim() !== "") return globalToken.trim();
  return void 0;
}
async function listAccounts(ctx) {
  const current = currentAccount(ctx);
  const out = [];
  for (const account of listRouteAccounts(ctx)) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv);
    const hasCredential = apiKey !== void 0 && apiKey !== "";
    const hasAccessKey = accessKeyForRoute(account.route) !== void 0;
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
function accountForRoute(ctx, route) {
  const accounts = listRouteAccounts(ctx);
  if (accounts.length === 0) return { ok: false, error: "no-provider" };
  const current = currentAccount(ctx);
  if (route === void 0 || route === "") {
    return current ?? { ok: false, error: "no-provider" };
  }
  const hit = accounts.find((account) => account.route === route);
  if (hit === void 0) return { ok: false, error: "unknown-account", detail: route };
  return current?.route === hit.route && current.model !== void 0 ? { ...hit, model: current.model } : hit;
}
async function fetchToday(origin, accessKey, units) {
  const now = Date.now();
  const from2 = Math.floor(localDayStartMs(now) / 1e3);
  const to = Math.floor(now / 1e3);
  const outcome = {};
  try {
    const stat = await getJson(origin, "/api/log/self/stat", accessKey, {
      type: 2,
      start_timestamp: from2,
      end_timestamp: to
    });
    if (isNewApiOk(stat.status, stat.body)) {
      const data = stat.body.data ?? {};
      const quota = num(data.quota);
      if (quota !== void 0) {
        outcome.money = quotaToMoney(quota, units);
        outcome.requests = num(data.count);
      }
      const rpm = num(data.rpm);
      const tpm = num(data.tpm);
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
    const aggregate = await getJson(origin, "/api/data/self", accessKey, {
      start_timestamp: from2,
      end_timestamp: to,
      default_time: "hour"
    });
    if (isNewApiOk(aggregate.status, aggregate.body)) {
      const rows = Array.isArray(aggregate.body.data) ? aggregate.body.data : [];
      const byModel = /* @__PURE__ */ new Map();
      let quota = 0;
      let requests = 0;
      let tokensTotal;
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const record = row;
        const rowQuota = num(record.quota) ?? 0;
        const rowCalls = num(record.count) ?? 0;
        quota += rowQuota;
        const requestCount = num(record.request_count) ?? 0;
        requests += requestCount > 0 ? requestCount : rowCalls;
        const rowTokens = num(record.token_used);
        if (rowTokens !== void 0) tokensTotal = (tokensTotal ?? 0) + rowTokens;
        const model = typeof record.model_name === "string" && record.model_name !== "" ? record.model_name : "\u672A\u77E5\u6A21\u578B";
        const existing = byModel.get(model);
        if (existing === void 0) {
          byModel.set(model, { model, quota: rowQuota, calls: rowCalls, ...rowTokens !== void 0 ? { tokens: rowTokens } : {} });
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
async function fetchDailyHistory(origin, accessKey, units) {
  const now = Date.now();
  const todayStr = localDayString(now);
  const firstDayStart = localDayStartMs(now - (HEAT_DAYS - 1) * 864e5);
  try {
    const aggregate = await getJson(origin, "/api/data/self", accessKey, {
      start_timestamp: Math.floor(firstDayStart / 1e3),
      end_timestamp: Math.floor(now / 1e3),
      default_time: "hour"
    });
    if (!isNewApiOk(aggregate.status, aggregate.body)) return void 0;
    const rows = Array.isArray(aggregate.body.data) ? aggregate.body.data : [];
    const byDay = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (row === null || typeof row !== "object") continue;
      const record = row;
      const ms = epochMs(num(record.created_at));
      if (ms === void 0) continue;
      const key = localDayString(ms);
      const quota = num(record.quota) ?? 0;
      const calls = num(record.count) ?? 0;
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
          const stat = await getJson(origin, "/api/log/self/stat", accessKey, {
            type: 2,
            start_timestamp: s0,
            end_timestamp: s1
          });
          if (isNewApiOk(stat.status, stat.body)) {
            const data = stat.body.data ?? {};
            const q = num(data.quota);
            if (q !== void 0) resolved = { quota: q, calls: num(data.count) ?? 0 };
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
function parseOther(value) {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    const cacheTokens = num(parsed.cache_tokens);
    const modelRatio = num(parsed.model_ratio);
    const completionRatio = num(parsed.completion_ratio);
    const cacheRatio = num(parsed.cache_ratio);
    const groupRatio = num(parsed.group_ratio) ?? num(parsed.user_group_ratio);
    return {
      ...cacheTokens !== void 0 ? { cacheTokens } : {},
      ...modelRatio !== void 0 ? { modelRatio } : {},
      ...completionRatio !== void 0 ? { completionRatio } : {},
      ...cacheRatio !== void 0 ? { cacheRatio } : {},
      ...groupRatio !== void 0 ? { groupRatio } : {}
    };
  } catch {
    return {};
  }
}
async function fetchTodayLedger(origin, accessKey, units) {
  const from2 = Math.floor(localDayStartMs() / 1e3);
  const to = Math.floor(Date.now() / 1e3);
  const out = {
    ok: false,
    records: [],
    rows: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    amountQuota: { input: 0, output: 0, cacheRead: 0, total: 0 },
    partial: false
  };
  let page = 1;
  let shortPageSeen = false;
  let fresh = 0;
  const seenRowIds = /* @__PURE__ */ new Set();
  while (page <= LOG_MAX_PAGES) {
    let status;
    let body;
    try {
      const result = await getJson(origin, "/api/log/self", accessKey, {
        type: 2,
        p: page,
        page_size: LOG_PAGE_SIZE,
        start_timestamp: from2,
        end_timestamp: to
      });
      status = result.status;
      body = result.body;
    } catch {
      break;
    }
    if (!isNewApiOk(status, body)) break;
    out.ok = true;
    const payload = body.data;
    const rawItems = payload !== null && typeof payload === "object" && Array.isArray(payload.items) ? payload.items : Array.isArray(payload) ? payload : [];
    out.rows += rawItems.length;
    if (payload !== null && typeof payload === "object") {
      const totalFromServer = num(payload.total);
      if (totalFromServer !== void 0) out.serverTotal = totalFromServer;
    }
    fresh = 0;
    for (const item of rawItems) {
      if (item === null || typeof item !== "object") continue;
      const record = item;
      const rowId = num(record.id);
      if (rowId !== void 0) {
        if (seenRowIds.has(rowId)) continue;
        seenRowIds.add(rowId);
      }
      fresh += 1;
      const createdAtMs = epochMs(num(record.created_at));
      if (createdAtMs === void 0) continue;
      const quota = num(record.quota);
      const promptTokens = num(record.prompt_tokens);
      const completionTokens = num(record.completion_tokens);
      const other = parseOther(record.other);
      const model = typeof record.model_name === "string" && record.model_name !== "" ? record.model_name : void 0;
      const requestId = typeof record.request_id === "string" && record.request_id !== "" ? record.request_id : void 0;
      const group = typeof record.group === "string" && record.group !== "" ? record.group : void 0;
      const tokenName = typeof record.token_name === "string" && record.token_name !== "" ? record.token_name : void 0;
      if (out.records.length < RECENT_MAX) {
        out.records.push({
          createdAt: createdAtMs,
          ...model !== void 0 ? { model } : {},
          ...quota !== void 0 ? { quota } : {},
          ...quota !== void 0 ? { amount: quotaToMoney(quota, units) } : {},
          ...promptTokens !== void 0 ? { promptTokens } : {},
          ...completionTokens !== void 0 ? { completionTokens } : {},
          ...other.cacheTokens !== void 0 ? { cacheTokens: other.cacheTokens } : {},
          ...requestId !== void 0 ? { requestId } : {},
          ...group !== void 0 ? { group } : {},
          ...tokenName !== void 0 ? { tokenName } : {}
        });
      }
      const billedQuota = quota ?? 0;
      out.amountQuota.total += billedQuota;
      const cacheTok = Math.min(other.cacheTokens ?? 0, promptTokens ?? 0);
      const uncached = Math.max((promptTokens ?? 0) - cacheTok, 0);
      out.inputTokens += uncached;
      out.outputTokens += completionTokens ?? 0;
      out.cacheTokens += cacheTok;
      const mr = other.modelRatio ?? 1;
      const cmr = other.completionRatio ?? 1;
      const cr = other.cacheRatio ?? 0;
      const gr = other.groupRatio ?? 1;
      let qIn = uncached * mr * gr;
      let qCache = cacheTok * cr * mr * gr;
      let qOut = (completionTokens ?? 0) * cmr * gr;
      const sum = qIn + qCache + qOut;
      if (billedQuota > 0 && sum > 0) {
        const k = billedQuota / sum;
        qIn *= k;
        qCache *= k;
        qOut *= k;
      } else if (billedQuota > 0) {
        qIn = billedQuota;
        qCache = 0;
        qOut = 0;
      } else {
        qIn = 0;
        qCache = 0;
        qOut = 0;
      }
      out.amountQuota.input += qIn;
      out.amountQuota.cacheRead += qCache;
      out.amountQuota.output += qOut;
    }
    if (rawItems.length < LOG_PAGE_SIZE || fresh === 0) {
      shortPageSeen = true;
      break;
    }
    page += 1;
  }
  out.partial = out.ok && (out.serverTotal === void 0 ? !shortPageSeen : out.rows < out.serverTotal);
  return out;
}
async function readNewApi(account, accessKey) {
  const units = await readUnits(account.origin);
  let remaining;
  let used;
  let keyName;
  const self = await getJson(account.origin, "/api/user/self", accessKey);
  if (isNewApiOk(self.status, self.body)) {
    const data = self.body.data ?? {};
    remaining = quotaToMoney(num(data.quota), units);
    used = quotaToMoney(num(data.used_quota), units);
    const displayName = typeof data.display_name === "string" && data.display_name !== "" ? data.display_name : typeof data.username === "string" && data.username !== "" ? data.username : void 0;
    keyName = displayName;
  }
  const today = await fetchToday(account.origin, accessKey, units);
  const todayOk = today.reason === void 0 && today.money !== void 0;
  const ledger = await fetchTodayLedger(account.origin, accessKey, units);
  const recentCalls = ledger.ok ? ledger.records : void 0;
  const dailyHistory = await fetchDailyHistory(account.origin, accessKey, units);
  let todayTokens;
  let todayAmounts;
  {
    const hasLedger = ledger.ok && ledger.rows > 0;
    const requests = today.requests;
    const total = today.tokens?.totalTokens;
    const inputTokens = hasLedger ? ledger.inputTokens : void 0;
    const outputTokens = hasLedger ? ledger.outputTokens : void 0;
    const cacheReadTokens = hasLedger ? ledger.cacheTokens : void 0;
    const hasAny = inputTokens !== void 0 || outputTokens !== void 0 || cacheReadTokens !== void 0 || total !== void 0 || requests !== void 0;
    if (hasAny) {
      todayTokens = {
        ...requests !== void 0 ? { requests } : {},
        ...inputTokens !== void 0 ? { inputTokens } : {},
        ...outputTokens !== void 0 ? { outputTokens } : {},
        ...cacheReadTokens !== void 0 ? { cacheReadTokens } : {},
        ...total !== void 0 ? { totalTokens: total } : {}
      };
    }
    if (hasLedger) {
      todayAmounts = {
        input: quotaToMoney(round6(ledger.amountQuota.input), units),
        output: quotaToMoney(round6(ledger.amountQuota.output), units),
        cacheRead: quotaToMoney(round6(ledger.amountQuota.cacheRead), units),
        total: quotaToMoney(round6(ledger.amountQuota.total), units)
      };
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
    ...ledger.ok && ledger.rows > 0 ? { todayLogRows: ledger.rows } : {},
    ...ledger.ok && ledger.partial ? { todayLogsPartial: true } : {},
    ...today.models !== void 0 && today.models.length > 0 ? { todayModels: today.models } : {},
    ...recentCalls !== void 0 && recentCalls.length > 0 ? { recentCalls } : {},
    ...today.rate !== void 0 ? { rate: today.rate } : {},
    scheme: "newapi",
    isAvailable: remaining?.quota === void 0 || remaining.quota > 0
  };
}
async function fetchWallet(ctx, route) {
  const account = accountForRoute(ctx, route);
  if ("ok" in account && account.ok === false) return account;
  const accessKey = accessKeyForRoute(account.route);
  if (accessKey === void 0) {
    return { ok: false, error: "no-access-token", detail: account.route };
  }
  try {
    if (isOfficialDeepSeekOrigin(account.origin)) {
      return { ok: false, error: "unsupported-official", detail: account.origin };
    }
    const finger = await fingerprintOrigin(account.origin);
    if (finger.software === "unknown") {
      return { ok: false, error: "unknown-software", detail: finger.reason ?? account.origin };
    }
    if (finger.software === "sub2api") {
      return { ok: false, error: "scheme-unsupported", detail: "sub2api \u7AD9\u70B9\u4E0D\u5728\u672C fork \u652F\u6301\u8303\u56F4" };
    }
    return await readNewApi(account, accessKey);
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
async function fetchBundle(ctx, route) {
  const accounts = await listAccounts(ctx);
  const selected = route !== void 0 && accounts.some((account) => account.route === route) ? route : accounts.find((account) => account.isCurrent)?.route ?? accounts[0]?.route ?? "";
  return {
    accounts,
    selected,
    refreshMs: resolveRefreshMs(),
    wallet: await fetchWallet(ctx, selected === "" ? void 0 : selected)
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
function routeQuery(req) {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = url.searchParams.get("route");
    return route !== null && route !== "" ? route : void 0;
  } catch {
    return void 0;
  }
}
function screenRequest(req) {
  if (req.method !== "GET") return { status: 405, body: { ok: false, error: "method-not-allowed" } };
  const peerOk = isLoopbackAddress(req.socket?.remoteAddress);
  const hostOk = isLoopbackAddress(hostNameOf(req.headers.host));
  if (peerOk && hostOk) return void 0;
  return { status: 403, body: { ok: false, error: "forbidden" } };
}
function send(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(value));
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
          send(res, refused.status, refused.body);
          return;
        }
        try {
          send(res, 200, await fetchBundle(ctx, routeQuery(req)));
        } catch (error) {
          ctx.logger?.(LOGGER_KEY)?.warn?.("wallet route failed: %s", error instanceof Error ? error.message : error);
          send(res, 500, { ok: false, error: "internal" });
        }
      }
    }), "loostone-newapi-wallet: http");
  });
  return true;
}

// src/index.ts
var name = "loostone-newapi-wallet";
var LOGGER_KEY2 = "loostone-newapi-wallet";
var walletSettingsSchema = Schema.object({
  /** New API 访问令牌（用户中心 → 生成的访问令牌，非 sk- 模型密钥）。 */
  accessToken: Schema.string().default(""),
  /** 可选：按路由覆盖令牌，键为 DSH 路由名。 */
  routeAccessTokens: Schema.dict(Schema.string()).default({}),
  /** 浏览器轮询间隔（毫秒）。 */
  refreshMs: Schema.natural().default(6e4)
});
function registerAccessSettings(ctx, config) {
  const wire = (settings) => {
    if (settings?.register === void 0) {
      ctx.logger?.(LOGGER_KEY2)?.warn?.(
        "settings service unavailable; accessToken falls back to row config (refreshMs=%s)",
        config.refreshMs ?? "(default)"
      );
      return;
    }
    try {
      const scope = settings.register("newapi-wallet", walletSettingsSchema, {
        base: { accessToken: "", routeAccessTokens: {}, ...config.refreshMs !== void 0 ? { refreshMs: config.refreshMs } : {} },
        applies: "live"
      });
      setAccessConfigSource({
        get: () => {
          const value = scope.get();
          if (value === void 0 || value === null || typeof value !== "object") return void 0;
          const section = value;
          return {
            ...typeof section.accessToken === "string" ? { accessToken: section.accessToken } : {},
            ...section.routeAccessTokens !== void 0 && section.routeAccessTokens !== null && typeof section.routeAccessTokens === "object" ? { routeAccessTokens: section.routeAccessTokens } : {},
            ...typeof section.refreshMs === "number" && Number.isFinite(section.refreshMs) ? { refreshMs: section.refreshMs } : {}
          };
        }
      });
      ctx.logger?.(LOGGER_KEY2)?.info?.("settings namespace newapi-wallet registered");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger?.(LOGGER_KEY2)?.warn?.("settings.register failed: %s", message);
    }
  };
  if (typeof ctx.inject === "function") {
    ctx.inject(["settings"], (scoped) => {
      wire(scoped.settings);
    });
    return;
  }
  wire(ctx.get("settings"));
}
function apply(ctx, config = {}) {
  const logger = ctx.logger?.(LOGGER_KEY2) ?? ctx.logger;
  try {
    registerAccessSettings(ctx, config);
    const served = registerWalletRoute(ctx);
    if (served) logger?.info?.("serving /api/newapi-wallet");
    else logger?.info?.("no web server; wallet overlay will not be served");
  } catch (error) {
    logger?.warn?.("could not register wallet route: %s", error instanceof Error ? error.message : error);
  }
}
export {
  apply,
  name,
  walletSettingsSchema
};
