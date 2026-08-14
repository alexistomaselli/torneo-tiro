# Contabilidad del Torneo

Aplicacion web para llevar la caja de la tesoreria del torneo. Esta pensada como el modulo financiero del proyecto `torneo-tiro` y guarda toda la informacion en una base SQLite local.

Hoy permite:

- Registrar ingresos y egresos
- Asociar movimientos a un equipo
- Ver balance, total de ingresos, total de egresos y cantidad de movimientos
- Editar los nombres y notas de los 10 equipos
- Eliminar movimientos desde la interfaz

## Objetivo

Este modulo sirve para que el tesorero lleve el control de:

- Cobros de inscripciones o cuotas
- Pagos de premios, arbitraje, cancha o gastos generales
- Saldo disponible de caja
- Historial de movimientos del torneo

## Stack

- Backend: Node.js nativo
- Base de datos: SQLite
- Frontend: HTML, CSS y JavaScript sin librerias

No requiere instalar paquetes externos para funcionar.

## Estructura

```text
contabilidad/
├── data/
│   └── contabilidad.sqlite
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── package.json
├── README.md
└── server.js
```

## Como correr la app

```bash
cd /Users/alexi/Proyectos/torneo-tiro/contabilidad
npm start
```

La aplicacion queda disponible en:

`http://127.0.0.1:3010`

## Base de datos

El archivo SQLite se crea automaticamente en:

`/Users/alexi/Proyectos/torneo-tiro/contabilidad/data/contabilidad.sqlite`

La base tiene dos tablas principales:

- `teams`: guarda los 10 equipos del torneo
- `movements`: guarda los ingresos y egresos de caja

## Equipos iniciales

La app trabaja con 10 equipos fijos del torneo. Actualmente quedaron cargados en la base y se pueden editar desde la web.

## API disponible

### `GET /api/summary`

Devuelve el resumen de caja:

```json
{
  "balanceCents": 0,
  "incomeCents": 0,
  "expenseCents": 0,
  "movementCount": 0
}
```

### `GET /api/teams`

Devuelve el listado de equipos.

### `PUT /api/teams/:id`

Actualiza nombre y notas de un equipo.

Ejemplo:

```json
{
  "name": "Sabores Caseros",
  "notes": "Pago al dia"
}
```

### `GET /api/movements`

Devuelve el historial de movimientos ordenado del mas reciente al mas antiguo.

### `POST /api/movements`

Crea un movimiento nuevo.

Ejemplo:

```json
{
  "type": "income",
  "amountCents": 15000000,
  "date": "2026-03-26",
  "category": "Pago de equipo",
  "method": "Efectivo",
  "description": "Pago de Sabores Caseros",
  "teamId": 5
}
```

Notas:

- `type` puede ser `income` o `expense`
- `amountCents` se guarda en centavos para evitar errores de redondeo
- `teamId` es opcional

### `DELETE /api/movements/:id`

Elimina un movimiento existente.

## Flujo de uso

1. Abrir la aplicacion en el navegador.
2. Verificar el balance actual.
3. Registrar cada cobro o pago desde el formulario.
4. Asociar el movimiento al equipo correspondiente cuando aplique.
5. Corregir nombres de equipos o notas desde la seccion de equipos.

## Scripts

```bash
npm start
```

Inicia el servidor en modo normal.

```bash
npm run dev
```

Inicia el servidor con recarga por cambios usando `node --watch`.

## Importar jugadores desde Excel

Tambien hay un importador para planillas de buena fe en formato `.xlsx`:

```bash
cd /Users/alexi/Proyectos/torneo-tiro/contabilidad
python3 scripts/import_roster_xlsx.py \
  --db data/contabilidad.sqlite \
  --file "listas-buena-fe/ORDEN PLANILLA 2026.xlsx" \
  --team-name "Orden Maderas"
```

El importador:

- detecta la hoja con la lista de jugadores,
- toma nombre, numero y DNI,
- busca el equipo en la base,
- inserta jugadores nuevos,
- actualiza los que ya existan,
- desactiva jugadores viejos que no aparezcan en la planilla.

## Estado actual

La app ya esta funcionando con:

- Frontend web operativo
- Backend HTTP operativo
- Persistencia real en SQLite
- 10 equipos cargados
- Registro manual de movimientos

## Proximos pasos sugeridos

- Definir categorias fijas para cobros y pagos
- Definir medios de pago fijos
- Agregar filtros por fecha y equipo
- Exportar movimientos a CSV
- Conectar este modulo con el resto del sistema del torneo
