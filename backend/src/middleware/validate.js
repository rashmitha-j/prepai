const AppError = require('../utils/AppError');

/**
 * Validates req.body / req.params / req.query with zod schemas. Parsed values replace
 * the raw input so controllers only ever see typed, trimmed, whitelisted data.
 * Express 5 exposes req.query as a getter, so parsed query values go to req.validatedQuery.
 */
function validate({ body, params, query } = {}) {
  return (req, _res, next) => {
    const issues = [];
    const run = (schema, value, where) => {
      if (!schema) return value;
      const result = schema.safeParse(value ?? {});
      if (!result.success) {
        for (const i of result.error.issues.slice(0, 10)) {
          issues.push({ field: [where, ...i.path].join('.'), message: i.message });
        }
        return undefined;
      }
      return result.data;
    };
    const parsedBody = run(body, req.body, 'body');
    const parsedParams = run(params, req.params, 'params');
    const parsedQuery = run(query, req.query, 'query');
    if (issues.length) return next(AppError.validation('Invalid request', issues));
    if (body) req.body = parsedBody;
    if (params) Object.assign(req.params, parsedParams);
    if (query) req.validatedQuery = parsedQuery;
    return next();
  };
}

module.exports = validate;
