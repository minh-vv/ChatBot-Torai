# SensorData API (Node.js + MongoDB)

Simple REST API implementing CRUD for SensorData using Express and Mongoose.

Quick start (PowerShell):

```powershell
# 1) Install dependencies
npm install

# 2) Copy .env.example to .env and edit if necessary
copy .env.example .env

# 3) Start MongoDB (ensure mongod is running)

# 4) Run the server
npm run dev   # or npm start
```

Endpoints:
- GET    /api/sensordatas         -> get all sensor records
- GET    /api/sensordatas/:id     -> get single record by id
- POST   /api/sensordatas         -> create a new record (JSON body)
- PUT    /api/sensordatas/:id     -> update record (JSON body)
- DELETE /api/sensordatas/:id     -> delete record

Notes:
- MongoDB database is configured by `MONGODB_URI` in `.env`.
- No migrations needed for MongoDB; schema changes are handled in code.
