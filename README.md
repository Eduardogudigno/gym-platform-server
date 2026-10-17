# Gym API

Backend de gestión de gimnasio centrado en suscripciones. El frontend React vive en otro repositorio y consume esta API por HTTP. No hay lógica que dependa de la interfaz.

Express es el servidor HTTP: el límite de este sistema es la consistencia de suscripciones y pagos, y Express encaja con Helmet, CORS, rate limit y Swagger.

## Requisitos

- Node.js 22 o superior
- Docker y Docker Compose, para levantar API y MySQL juntos

## Arranque con Docker

```bash
cd gym-api
docker compose up --build
```

La API queda en `http://localhost:3000`. Al arrancar aplica migraciones, carga los datos de demo y empieza a escuchar. MySQL publica el puerto `3306` (usuario `gym`, contraseña `gym`, base `gym`).

Swagger: `http://localhost:3000/docs`

## Arranque local

```bash
cp .env.example .env
docker compose up mysql -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Producción compilada:

```bash
npm run build
npm start
```

## Variables de entorno

Copia `.env.example`. Las que cambian el comportamiento:

| Variable | Uso |
|---|---|
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL 8 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Secretos de al menos 16 caracteres |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Duración de los tokens (`15m`, `7d`) |
| `DEFAULT_CURRENCY` | Moneda por defecto (`USD`) |
| `BUSINESS_TIMEZONE` | Zona para sumar meses de calendario (`UTC`) |
| `SUBSCRIPTION_PENDING_TTL_HOURS` | Una suscripción `pending` se cancela al pasar este plazo |
| `REMINDER_DAYS` | Avisos antes del vencimiento (`7,3,1`) |
| `ENABLE_CRON`, `CRON_SCHEDULE` | Barrido de vencimientos y recordatorios |
| `PAYMENT_GATEWAY` | `manual` o `stripe` |
| `WEBHOOK_SECRET` | HMAC del webhook `manual` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Admin inicial |

## Base de datos

Al migrar, sembrar o arrancar la API, se consulta si existe la base de `DB_NAME`. Si no existe, se crea con `utf8mb4`. El usuario de `DB_USER` necesita permiso para crear bases. El esquema de tablas solo cambia con migraciones de Umzug, escritas en JavaScript en `src/database/migrations`. La primera migración crea las tablas con `CREATE TABLE IF NOT EXISTS`. La aplicación no llama a `sync()`.

```bash
npm run db:migrate
npm run db:migrate:undo
npm run db:seed
npm run db:seed:undo
```

`db:migrate:undo` y `db:seed:undo` revierten el último paso. Cada migración tiene `up` y `down`.

En un entorno que no sea `production`, el seed crea:

| Dato | Valor |
|---|---|
| Admin | `admin@gym.local` / `ChangeMe123!` |
| Admin id | `11111111-1111-4111-8111-111111111111` |
| Miembro | `member@gym.local` / `ChangeMe123!` |
| Member id | `33333333-3333-4333-8333-333333333333` |
| Plan mensual | `44444444-4444-4444-8444-444444444444` |
| Plan trimestral | `55555555-5555-4555-8555-555555555555` |
| Plan anual | `66666666-6666-4666-8666-666666666666` |
| Suscripción activa | `77777777-7777-4777-8777-777777777777` |

Cambia esas contraseñas fuera de un entorno local. El token de recuperación de contraseña no vuelve en la respuesta: el adaptador de correo lo escribe en el log.

## Supuestos

- Un miembro tiene como máximo una suscripción `pending`, `active` o `paused`. Lo garantiza una columna generada en MySQL.
- Pausar congela el tiempo restante. Reanudar corre el vencimiento por el tiempo en pausa. Una suscripción en pausa no vence.
- La duración suma 1, 3 o 12 meses de calendario en `BUSINESS_TIMEZONE`.
- `POST /subscriptions/:id/renew` alarga la misma suscripción. `renewedFromId` enlaza una suscripción nueva con una anterior vencida o cancelada.
- Un pago `completed` sobre una suscripción `pending` la activa en la misma transacción. El cron no cobra: marca vencidas, cancela pendientes abandonadas y deja recordatorios. `StripeGateway` es el punto donde entraría el SDK, sin tocar los servicios.
- El check-in exige miembro `active` y suscripción `active` dentro de su vigencia.
- Usuarios, miembros y planes usan borrado lógico. Pagos, eventos y asistencias se conservan.

La tasa de renovación es `renovadas / (renovadas + vencidas + canceladas)` en el período. Si el denominador es 0, `rate` es `null`.

## Respuestas

```json
{ "success": true, "data": {}, "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }
```

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Los listados aceptan `page`, `pageSize` (máximo 100) y `sort=campo:asc|desc`.

## Probar el flujo

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@gym.local","password":"ChangeMe123!"}' | jq -r .data.accessToken)

curl -s http://localhost:3000/api/v1/plans -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3000/api/v1/attendance/check-in \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"memberId":"33333333-3333-4333-8333-333333333333"}'

curl -s -X POST http://localhost:3000/api/v1/subscriptions/77777777-7777-4777-8777-777777777777/pause \
  -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3000/api/v1/subscriptions/77777777-7777-4777-8777-777777777777/resume \
  -H "Authorization: Bearer $TOKEN"

curl -s "http://localhost:3000/api/v1/reports/subscriptions/expiring?withinDays=30" \
  -H "Authorization: Bearer $TOKEN"
```

Crear otra suscripción con pago en efectivo, para un miembro nuevo:

```bash
curl -s -X POST http://localhost:3000/api/v1/members \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"nueva@gym.local","password":"ChangeMe123!","firstName":"Nueva","lastName":"Socia"}'

curl -s -X POST http://localhost:3000/api/v1/subscriptions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"memberId":"<member-id>","planId":"44444444-4444-4444-8444-444444444444","payment":{"method":"cash","amount":"39.99"}}'
```

## Endpoints

Prefijo `/api/v1`. El contrato completo está en `openapi/openapi.yaml` y en `/docs`.

| Método | Ruta | Rol |
|---|---|---|
| POST | `/auth/register` | público |
| POST | `/auth/login` | público |
| POST | `/auth/refresh` | público |
| POST | `/auth/logout` | autenticado |
| POST | `/auth/forgot-password` | público |
| POST | `/auth/reset-password` | público |
| GET | `/auth/me` | autenticado |
| GET, POST | `/users` | admin |
| GET, PATCH | `/users/:id` | admin o el propio |
| PATCH | `/users/:id/role`, `/users/:id/status` | admin |
| DELETE | `/users/:id` | admin |
| GET, POST | `/members` | admin, staff |
| GET, PATCH | `/members/:id` | admin, staff o el propio |
| PATCH | `/members/:id/status` | admin, staff |
| GET | `/members/:id/history` | admin, staff o el propio |
| DELETE | `/members/:id` | admin |
| GET | `/plans`, `/plans/:id` | autenticado |
| POST, PATCH, DELETE | `/plans`, `/plans/:id`, `/plans/:id/status` | admin |
| POST | `/plans/:id/members` | admin, staff |
| GET, POST | `/subscriptions` | admin, staff |
| GET | `/subscriptions/:id`, `/subscriptions/:id/events` | admin, staff o el propio |
| POST | `/subscriptions/:id/activate`, `/renew`, `/pause`, `/resume`, `/change-plan` | admin, staff |
| POST | `/subscriptions/:id/cancel` | admin, staff o el propio |
| GET, POST | `/payments` | admin, staff |
| POST | `/payments/intents` | admin, staff |
| GET | `/payments/:id` | admin, staff o el propio |
| POST | `/payments/:id/refund` | admin |
| POST | `/webhooks/payments/:provider` | firma del proveedor |
| POST | `/attendance/check-in` | admin, staff o member |
| GET | `/attendance`, `/attendance/:id` | lista: admin, staff; detalle: también el propio |
| GET | `/reports/members/active` | admin, staff |
| GET | `/reports/revenue` | admin, staff |
| GET | `/reports/subscriptions/expiring` | admin, staff |
| GET | `/reports/renewal-rate` | admin, staff |
| POST | `/jobs/subscriptions/expire` | admin |
| POST | `/jobs/subscriptions/reminders` | admin |
| GET | `/reminders` | admin, staff |

`GET /health` y `GET /health/ready` quedan fuera del prefijo de versión.

## Pruebas

```bash
npm test
npm run lint
```

Las pruebas de suscripción cubren renovación (vigente y vencida), pausa, vencimiento y cambio de plan, sin depender de MySQL. El contrato HTTP se prueba con Supertest.
