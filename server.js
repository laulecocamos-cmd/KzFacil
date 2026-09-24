const express = require("express");

const cors = require("cors");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const { Pool } = require("pg");

const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const SECRET = process.env.JWT_SECRET || "TROQUE_ESTA_CHAVE";

const pool = new Pool({

  connectionString: process.env.DATABASE_URL,

  ssl: process.env.DATABASE_URL

    ? { rejectUnauthorized: false }

    : false

});

app.disable("x-powered-by");

app.use(cors());

app.use(express.json({ limit: "100kb" }));

app.get("/health", (req, res) => {

  res.json({ ok: true, service: "kzfacil" });

});

app.use(express.static(path.join(__dirname, "public")));

async function init() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      commission_rate REAL DEFAULT 0.10
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      service_id INTEGER REFERENCES services(id),
      details TEXT,
      price INTEGER,
      commission INTEGER,
      status TEXT DEFAULT 'Pendente',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_method TEXT
  `);
  
    const admin = await pool.query(
  "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
);

const adminPassword = process.env.ADMIN_PASSWORD;

if (admin.rowCount === 0) {
  const password = adminPassword || "Admin@12345";
  const hash = bcrypt.hashSync(password, 10);

  await pool.query(
    "INSERT INTO users(name, phone, password, role) VALUES($1,$2,$3,'admin')",
    ["Administrador", "admin", hash]
  );
} else if (adminPassword) {
  const hash = bcrypt.hashSync(adminPassword, 10);

  await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2",
    [hash, admin.rows[0].id]
  );
}

  const count = await pool.query(

    "SELECT COUNT(*)::int AS total FROM services"

  );

  if (count.rows[0].total === 0) {

    const services = [

      ["CV e documentos", "Criação e formatação de CVs", 2000],

      ["Design gráfico", "Logótipos, panfletos e artes", 2500],

      ["Serviços digitais", "Ajuda com serviços online", 500],

      ["Impressão", "Preparação e impressão", 100],

      ["Profissionais", "Solicitação de técnicos", 5000],

      ["Publicidade", "Divulgação de negócios", 1000]

    ];

    for (const service of services) {

      await pool.query(

        "INSERT INTO services(name, description, price) VALUES($1,$2,$3)",

        service

      );

    }

  }

}

function auth(req, res, next) {

  try {

    const header = req.headers.authorization || "";

    const token = header.replace("Bearer ", "");

    req.user = jwt.verify(token, SECRET);

    next();

  } catch (error) {

    res.status(401).json({ error: "Não autenticado" });

  }

}

function admin(req, res, next) {

  if (req.user.role !== "admin") {

    return res.status(403).json({

      error: "Acesso reservado ao administrador"

    });

  }

  next();

}

app.get("/api/services", async (req, res) => {

  try {

    const result = await pool.query(

      "SELECT * FROM services ORDER BY id"

    );

    res.json(result.rows);

  } catch (error) {

    res.status(500).json({

      error: "Erro ao carregar serviços"

    });

  }

});

app.post("/api/register", async (req, res) => {

  try {

    const { name, phone, password } = req.body;

    if (!name || !phone || !password || password.length < 6) {

      return res.status(400).json({

        error: "Nome, telefone e senha (mín. 6 caracteres) são obrigatórios"

      });

    }

    const hash = bcrypt.hashSync(password, 10);

    const result = await pool.query(

      "INSERT INTO users(name, phone, password) VALUES($1,$2,$3) RETURNING id",

      [name, phone, hash]

    );

    const user = {

      id: result.rows[0].id,

      name,

      phone,

      role: "customer"

    };

    const token = jwt.sign(user, SECRET, {

      expiresIn: "7d"

    });

    res.json({ token, user });

  } catch (error) {

    res.status(400).json({

      error: "Telefone já registado ou dados inválidos"

    });

  }

});

app.post("/api/login", async (req, res) => {

  try {

    const result = await pool.query(

      "SELECT * FROM users WHERE phone = $1",

      [req.body.phone]

    );

    const userDB = result.rows[0];

    if (

      !userDB ||

      !bcrypt.compareSync(req.body.password, userDB.password)

    ) {

      return res.status(401).json({

        error: "Credenciais inválidas"

      });

    }

    const user = {

      id: userDB.id,

      name: userDB.name,

      phone: userDB.phone,

      role: userDB.role

    };

    const token = jwt.sign(user, SECRET, {

      expiresIn: "7d"

    });

    res.json({ token, user });

  } catch (error) {

    res.status(500).json({

      error: "Erro ao iniciar sessão"

    });

  }

});

app.post("/api/orders", auth, async (req, res) => {

  try {

    const { service_id, details } = req.body;

    const serviceResult = await pool.query(

      "SELECT * FROM services WHERE id = $1",

      [service_id]

    );

    const service = serviceResult.rows[0];

    if (!service || !details) {

      return res.status(400).json({

        error: "Serviço e detalhes são obrigatórios"

      });

    }

    const code =

      "KZ" + Date.now().toString().slice(-8);

    const commission = Math.round(

      service.price * service.commission_rate

    );

    const result = await pool.query(

      `INSERT INTO orders

       (code, user_id, service_id, details, price, commission)

       VALUES($1,$2,$3,$4,$5,$6)

       RETURNING id`,

      [

        code,

        req.user.id,

        service.id,

        details,

        service.price,

        commission

      ]

    );

    const order = await pool.query(

      `SELECT o.*, s.name AS service_name

       FROM orders o

       JOIN services s ON s.id = o.service_id

       WHERE o.id = $1`,

      [result.rows[0].id]

    );

    res.status(201).json(order.rows[0]);

  } catch (error) {

    res.status(500).json({

      error: "Erro ao criar pedido"

    });

  }

});

app.get("/api/orders/me", auth, async (req, res) => {

  try {

    const result = await pool.query(

      `SELECT o.*, s.name AS service_name

       FROM orders o

       JOIN services s ON s.id = o.service_id

       WHERE o.user_id = $1

       ORDER BY o.id DESC`,

      [req.user.id]

    );

    res.json(result.rows);

  } catch (error) {

    res.status(500).json({

      error: "Erro ao carregar pedidos"

    });

  }

});

app.get("/api/admin/orders", auth, admin, async (req, res) => {

  try {

    const result = await pool.query(

      `SELECT o.*, u.name AS customer,

       u.phone, s.name AS service_name

       FROM orders o

       JOIN users u ON u.id = o.user_id

       JOIN services s ON s.id = o.service_id

       ORDER BY o.id DESC`

    );

    res.json(result.rows);

  } catch (error) {

    res.status(500).json({

      error: "Erro ao carregar pedidos"

    });

  }

});

app.get("/api/admin/stats", auth, admin, async (req, res) => {

  try {

    const result = await pool.query(`

      SELECT

        COUNT(*)::int AS orders,

        COALESCE(SUM(commission), 0)::int AS commission,

        COALESCE(

          SUM(

            CASE

              WHEN status = 'Pendente' THEN 1

              ELSE 0

            END

          ), 0

        )::int AS pending

      FROM orders

    `);

    res.json(result.rows[0]);

  } catch (error) {

    res.status(500).json({

      error: "Erro ao carregar estatísticas"

    });

  }

});

app.patch("/api/admin/orders/:id", auth, admin, async (req, res) => {

  try {

    const allowed = [

      "Pendente",

      "Em andamento",

      "Concluído",

      "Cancelado"

    ];

    if (!allowed.includes(req.body.status)) {

      return res.status(400).json({

        error: "Estado inválido"

      });

    }

    await pool.query(

      "UPDATE orders SET status = $1 WHERE id = $2",

      [req.body.status, req.params.id]

    );

    res.json({ ok: true });

  } catch (error) {

    res.status(500).json({

      error: "Erro ao atualizar pedido"

    });

  }

});

app.get("*", (req, res) => {

  res.sendFile(

    path.join(__dirname, "public", "index.html")

  );

});

init()

  .then(() => {

    app.listen(PORT, () => {

      console.log("KzFácil online");

    });

  })

  .catch((error) => {

    console.error("Erro ao iniciar banco:", error);

    process.exit(1);

  })
