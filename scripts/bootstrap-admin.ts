/**
 * Bootstrap admin user. Run with:
 *   npx tsx scripts/bootstrap-admin.ts <email> <password>
 */
import postgres from 'postgres'
import bcrypt from 'bcryptjs'

const email = process.argv[2]
const password = process.argv[3]

if (!email || !password) {
  console.error('Usage: npx tsx scripts/bootstrap-admin.ts <email> <password>')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' })

async function main() {
  const hash = await bcrypt.hash(password, 10)
  await sql`
    INSERT INTO users (email, password_hash, is_admin)
    VALUES (${email}, ${hash}, true)
    ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}, is_admin = true
  `
  console.log(`Admin user ${email} created/updated.`)
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
