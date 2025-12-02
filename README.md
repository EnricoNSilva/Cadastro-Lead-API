# 🔌 API REST - Gestão de Leads (CASE 2025)

![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)

Backend robusto desenvolvido para orquestrar a lógica de negócios e persistência de dados da Landing Page CASE 2025. Responsável pela validação, verificação de duplicidade e armazenamento seguro dos leads.

## 🧠 Arquitetura & Lógica

A API implementa um sistema de **Validação em Duas Etapas** para garantir a qualidade dos dados (Data Quality):

1.  **Pré-Validação (Etapa 1):** Recebe os dados básicos e verifica no MongoDB se o E-mail ou Telefone já foram cadastrados. Se houver duplicidade, bloqueia o avanço no Frontend.
2.  **Persistência (Final):** Recebe o payload completo, sanitiza os dados (trim), aplica regras de negócio condicionais e salva no banco.

## 🛠️ Tecnologias

* **Runtime:** Node.js
* **Framework:** Express.js
* **Banco de Dados:** MongoDB (Atlas)
* **ODM:** Mongoose
* **Segurança:** CORS configurado

## 📚 Documentação da API

### 1. Validar Etapa 1 (Pré-check)
Verifica se o usuário pode prosseguir para a próxima etapa.

* **Rota:** `POST /leads/validar-etapa1`
* **Body:**
```json
{
  "nome": "Enrico",
  "email": "email@teste.com",
  "telefone": "11999999999",
  "perfil": "Estudante"
}
```
* **Respostas:**
    * `200 OK`: Dados válidos e únicos.
    * `400 Bad Request`: E-mail ou telefone já cadastrados.

### 2. Criar Lead (Cadastro)
Salva o lead completo no banco de dados.

* **Rota:** `POST /leads`
* **Body:** Objeto completo do lead (incluindo compliance LGPD).
* **Respostas:**
    * `201 Created`: Sucesso.
    * `400 Bad Request`: Erro de validação.

### 3. Listar Leads (Admin)
* **Rota:** `GET /leads`
* **Retorno:** Array com todos os leads cadastrados, ordenados por data.

## 🚀 Como Rodar

### Pré-requisitos
* Node.js instalado
* Uma string de conexão do MongoDB (Atlas ou Local)

### Instalação

1. Entre na pasta:
   ```bash
   cd crud-clientes-api
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env` na raiz e adicione:
   ```env
   DB_CONNECTION_STRING=sua_string_de_conexao_mongodb_aqui
   PORT=3000
   ```

4. Inicie o servidor:
   ```bash
   node index.js
   ```

---
Desenvolvido por **Enrico** 💻
