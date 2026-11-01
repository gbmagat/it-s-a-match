// One-time database setup. Creates the database, a restricted user for the
// site (password from .env) and the tables. Safe to run again.
//
//   npm run db:setup
//     Asks for your MySQL root password (typed here, never stored).
//
//   node --env-file=.env server/setup.js --print-sql | sudo mysql
//     For servers where MySQL's root has no password and signs in through
//     sudo instead (the default on Ubuntu/Debian): prints the same SQL for
//     `sudo mysql` to run.
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import mysql from 'mysql2/promise'

const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_NAME, DB_USER, DB_PASSWORD } = process.env
if (!DB_NAME || !DB_USER || !DB_PASSWORD) {
  console.error('Missing DB_NAME / DB_USER / DB_PASSWORD in .env')
  process.exit(1)
}

const id = (s) => mysql.escapeId(s)
const sql = [
  `CREATE DATABASE IF NOT EXISTS ${id(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  ...['localhost', '127.0.0.1'].flatMap((host) => {
    const who = `${mysql.escape(DB_USER)}@${mysql.escape(host)}`
    return [
      `CREATE USER IF NOT EXISTS ${who} IDENTIFIED BY ${mysql.escape(DB_PASSWORD)};`,
      `ALTER USER ${who} IDENTIFIED BY ${mysql.escape(DB_PASSWORD)};`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${id(DB_NAME)}.* TO ${who};`,
    ]
  }),
  `USE ${id(DB_NAME)};`,
  readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
].join('\n')

if (process.argv.includes('--print-sql')) {
  process.stdout.write(sql + '\n')
  process.exit(0)
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const rootPassword = await askHidden('MySQL root password: ')
const conn = await mysql.createConnection({
  host: DB_HOST, port: Number(DB_PORT), user: 'root', password: rootPassword, multipleStatements: true,
})
await conn.query(sql)
await conn.end()
console.log(`Done: database "${DB_NAME}" and user "${DB_USER}" are ready. Start the server with: npm run server`)
