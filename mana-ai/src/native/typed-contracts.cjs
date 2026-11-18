'use strict';

const TYPES = new Set([
  'string', 'number', 'integer', 'boolean',
  'object', 'array', 'null'
]);

function validType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'object') return value !== null &&
    typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

// Intentional bounded-recursion addition to the owner-exported server source.
function validateContract(value, schema, path = '$', depth = 0) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 32) throw Error('Contract depth exceeded');
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw Error('Invalid contract schema');

  if (!TYPES.has(schema.type))
    throw Error('Unsupported contract type');

  if (!validType(value, schema.type))
    return {ok:false, path, reason:'TYPE_MISMATCH'};

  if (schema.type === 'object') {
    const required = schema.required || [];
    if (!Array.isArray(required) ||
        !required.every(x => typeof x === 'string'))
      throw Error('Invalid required fields');

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key))
        return {ok:false, path:path+'.'+key, reason:'REQUIRED_FIELD_MISSING'};
    }

    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const result = validateContract(value[key], child, path+'.'+key, depth+1);
        if (!result.ok) return result;
      }
    }
  }

  if (schema.type === 'array' && schema.items) {
    for (let i=0; i<value.length; i++) {
      const result = validateContract(value[i], schema.items, path+'['+i+']', depth+1);
      if (!result.ok) return result;
    }
  }

  return {ok:true};
}

module.exports = {validateContract};
