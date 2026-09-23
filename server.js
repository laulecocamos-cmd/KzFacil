
const express=require("express"),cors=require("cors"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),Database=require("better-sqlite3");
const path=require("path");
const app=express(),db=new Database("kzfacil.db"),PORT=process.env.PORT||3000,SECRET=process.env.JWT_SECRET||"TROQUE_ESTA_CHAVE";
app.disable('x-powered-by');
app.use(cors());app.use(express.json({limit:'100kb'}));
app.get('/health',(req,res)=>res.json({ok:true,service:'kzfacil'}));
app.use(express.static(path.join(__dirname,'public')));

db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT DEFAULT 'customer',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT,price INTEGER NOT NULL,commission_rate REAL DEFAULT .10);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE NOT NULL,user_id INTEGER,service_id INTEGER,details TEXT,price INTEGER,commission INTEGER,status TEXT DEFAULT 'Pendente',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(service_id) REFERENCES services(id));`);

if(!db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get()){
 const hash=bcrypt.hashSync("Admin@12345",10);
 db.prepare("INSERT INTO users(name,phone,password,role) VALUES(?,?,?,'admin')").run("Administrador","admin",hash);
}
if(db.prepare("SELECT COUNT(*) c FROM services").get().c===0){
 const s=[["CV e documentos","Criação e formatação de CVs",2000],["Design gráfico","Logótipos, panfletos e artes",2500],["Serviços digitais","Ajuda com serviços online",500],["Impressão","Preparação e impressão",100],["Profissionais","Solicitação de técnicos",5000],["Publicidade","Divulgação de negócios",1000]];
 const q=db.prepare("INSERT INTO services(name,description,price) VALUES(?,?,?)");db.transaction(()=>s.forEach(x=>q.run(...x)))();
}
function auth(req,res,next){try{const h=req.headers.authorization||"";req.user=jwt.verify(h.replace("Bearer ",""),SECRET);next()}catch(e){res.status(401).json({error:"Não autenticado"})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Acesso reservado ao administrador"});next()}
app.get("/api/services",(req,res)=>res.json(db.prepare("SELECT * FROM services").all()));
app.post("/api/register",(req,res)=>{try{const {name,phone,password}=req.body;if(!name||!phone||!password||password.length<6)return res.status(400).json({error:"Nome, telefone e senha (mín. 6 caracteres) são obrigatórios"});const hash=bcrypt.hashSync(password,10);const info=db.prepare("INSERT INTO users(name,phone,password) VALUES(?,?,?)").run(name,phone,hash);const user={id:info.lastInsertRowid,name,phone,role:"customer"};const token=jwt.sign(user,SECRET,{expiresIn:"7d"});res.json({token,user})}catch(e){res.status(400).json({error:"Telefone já registado ou dados inválidos"})}});
app.post("/api/login",(req,res)=>{const u=db.prepare("SELECT * FROM users WHERE phone=?").get(req.body.phone);if(!u||!bcrypt.compareSync(req.body.password,u.password))return res.status(401).json({error:"Credenciais inválidas"});const user={id:u.id,name:u.name,phone:u.phone,role:u.role};res.json({token:jwt.sign(user,SECRET,{expiresIn:"7d"}),user})});
app.post("/api/orders",auth,(req,res)=>{const {service_id,details}=req.body,s=db.prepare("SELECT * FROM services WHERE id=?").get(service_id);if(!s||!details)return res.status(400).json({error:"Serviço e detalhes são obrigatórios"});const code="KZ"+Date.now().toString().slice(-8),commission=Math.round(s.price*s.commission_rate);const info=db.prepare("INSERT INTO orders(code,user_id,service_id,details,price,commission) VALUES(?,?,?,?,?,?)").run(code,req.user.id,s.id,details,s.price,commission);res.status(201).json(db.prepare("SELECT o.*,s.name service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE o.id=?").get(info.lastInsertRowid))});
app.get("/api/orders/me",auth,(req,res)=>res.json(db.prepare("SELECT o.*,s.name service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE o.user_id=? ORDER BY o.id DESC").all(req.user.id)));
app.get("/api/admin/orders",auth,admin,(req,res)=>res.json(db.prepare("SELECT o.*,u.name customer,u.phone,s.name service_name FROM orders o JOIN users u ON u.id=o.user_id JOIN services s ON s.id=o.service_id ORDER BY o.id DESC").all()));
app.get("/api/admin/stats",auth,admin,(req,res)=>res.json(db.prepare("SELECT COUNT(*) orders,COALESCE(SUM(commission),0) commission,COALESCE(SUM(CASE WHEN status='Pendente' THEN 1 ELSE 0 END),0) pending FROM orders").get()));
app.patch("/api/admin/orders/:id",auth,admin,(req,res)=>{const allowed=["Pendente","Em andamento","Concluído","Cancelado"];if(!allowed.includes(req.body.status))return res.status(400).json({error:"Estado inválido"});db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);res.json({ok:true})});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("KzFácil online em http://localhost:"+PORT));
