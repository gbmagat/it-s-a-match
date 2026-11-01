// Runs the real API with the in-memory test database (mysql2.mjs) instead of
// MySQL, for testing on this computer without the local database:
//   node --env-file=tools/memory-db/memory.env --import ./tools/memory-db/register.mjs server/index.js
// (the "api-memory" launch configuration). Test data only; gone when it stops.
import { registerHooks } from 'node:module'

const fake = new URL('./mysql2.mjs', import.meta.url).href
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === 'mysql2/promise' ? { url: fake, shortCircuit: true } : nextResolve(specifier, context),
})
console.log('In-memory test database (tools/memory-db): test data only, gone when the server stops.')
