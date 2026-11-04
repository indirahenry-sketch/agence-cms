/**
 * Préparation des tests : on travaille sur une base SÉPARÉE (DATABASE_URI_TEST),
 * entièrement vidée avant chaque lancement. Jamais sur ta vraie base.
 */
import 'dotenv/config'
import pg from 'pg'

const testURI = process.env.DATABASE_URI_TEST
if (!testURI) throw new Error('DATABASE_URI_TEST manquant dans apps/cms/.env')
if (testURI === process.env.DATABASE_URI) throw new Error('DATABASE_URI_TEST doit être différente de DATABASE_URI')

process.env.DATABASE_URI = testURI
process.env.PAYLOAD_SECRET ||= 'test-secret'
// Pas de vrais e-mails ni de vrai stockage pendant les tests
delete process.env.SMTP_HOST
delete process.env.S3_BUCKET
process.env.AGENCY_EMAIL = 'agence@test.local'

const client = new pg.Client({ connectionString: testURI })
await client.connect()
await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
await client.end()
