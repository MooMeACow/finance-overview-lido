// Lets Node's built-in test runner import the app's TypeScript files,
// which use extensionless imports like `from './csv'`.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try {
          return await next(specifier, context);
        } catch (err) {
          if (specifier.startsWith('.') && !/\\.[a-z]+$/.test(specifier)) {
            return next(specifier + '.ts', context);
          }
          throw err;
        }
      }
    `),
  import.meta.url,
);
