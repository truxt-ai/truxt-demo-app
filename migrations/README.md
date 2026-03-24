# Database Migrations

Run migrations in order against the target database:

```bash
for f in migrations/*.sql; do psql $DATABASE_URL -f "$f"; done
```
