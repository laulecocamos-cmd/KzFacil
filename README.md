# KzFácil — publicação online

## Opção recomendada para esta versão
O projeto usa Express + SQLite. Para publicação imediata, use um serviço com armazenamento persistente (por exemplo, Render com Persistent Disk). Render suporta Web Services Node.js e configuração de build/start; o armazenamento persistente evita perder o SQLite entre reinícios. Para produção com maior escala, migre a base para PostgreSQL.

### Render
1. Coloque esta pasta num repositório GitHub.
2. No Render, crie um Web Service e conecte o repositório.
3. Build: `npm install`
4. Start: `npm start`
5. Variável obrigatória: `JWT_SECRET` com uma chave longa e aleatória.
6. Adicione um Persistent Disk montado na pasta do projeto se mantiver SQLite.

### Railway
Também pode ser publicado como serviço Node/Express. Conecte o GitHub, adicione `JWT_SECRET` e gere um domínio público. Para produção, use PostgreSQL em vez de SQLite.

### Segurança antes de abrir ao público
- Trocar a senha inicial do administrador.
- Definir JWT_SECRET forte e secreto.
- Não colocar chaves de pagamento no código.
- Integrar um gateway de pagamento com webhook antes de marcar pedidos como pagos.
- Configurar backups da base de dados.

Conta admin inicial desta demonstração: telefone `admin`, senha `Admin@12345`. TROQUE-A antes de publicar.
