require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// 1. CONEXÃO COM BANCO (Padrão Serverless)
// ==========================================
let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return;
  }

  console.log('=> Criando nova conexão com o MongoDB...');
  
  if (!process.env.DB_CONNECTION_STRING) {
     throw new Error('DB_CONNECTION_STRING não definida no .env!');
  }

  try {
    const db = await mongoose.connect(process.env.DB_CONNECTION_STRING, {
      serverSelectionTimeoutMS: 5000,
    });
    
    isConnected = db.connections[0].readyState;
    console.log('=> Conectado ao MongoDB!');
  } catch (error) {
    console.error('=> Erro fatal na conexão:', error);
    throw error;
  }
}

// Middleware Global: Garante DB conectado em TODAS as rotas
app.use(async (req, res, next) => {
    // Ignora favicon
    if (req.path === '/favicon.ico') return res.status(204).end();

    try {
        await connectToDatabase();
        next();
    } catch (error) {
        res.status(503).json({ 
            mensagem: 'Serviço temporariamente indisponível: banco de dados não conectado.',
            erro: error.message
        });
    }
});

// ==========================================
// 2. SCHEMAS E MODELS
// ==========================================
const LeadSchema = new mongoose.Schema({
    nome : { type: String, required: true },
    perfil : { type: String, required: true },
    empresa: { type: String, required: false },
    cargo: { type: String, required: false },
    email : { type: String, required: true },
    telefone : { type: String, required: true },
    perguntaChecagem : { type: String, required: true },
    perguntaGeral : { type: String, required: false },
    adesao : { type: Boolean, required: true },
    LGPD : { type: Boolean, required: true },
    dataCadastro : { type: Date, default: Date.now }
});

// Evita erro de sobrescrever modelo na Vercel
const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

// ==========================================
// 3. FUNÇÕES DE VALIDAÇÃO (Helpers)
// ==========================================

function validarEtapa1(lead) {
    const erros = [];
    
    // Validação do perfil
    const perfisValidos = ['Estudante', 'Executivo', 'Empresário', 'Investidor'];
    if (!lead.perfil || typeof lead.perfil !== 'string' ||
         lead.perfil.trim() === '' || !perfisValidos.includes(lead.perfil)) {
        erros.push("Perfil inválido ou não informado.");
    }
    
    // Validação empresa
    if (['Executivo', 'Empresário', 'Investidor'].includes(lead.perfil)) {
        if (!lead.empresa || typeof lead.empresa !== 'string' ||
             lead.empresa.trim() === '') {
            erros.push("Empresa é obrigatória para o perfil selecionado.");
        } else if (lead.empresa.trim().length < 3) {
            erros.push("Empresa deve ter pelo menos 3 caracteres.");
        }
        // Valida Cargo
        if (!lead.cargo || typeof lead.cargo !== 'string' || 
            lead.cargo.trim() === '') {
            erros.push("Cargo é obrigatório para o perfil selecionado.");
        } else if (lead.cargo.trim().length < 3) {
            erros.push("Cargo deve ter pelo menos 3 caracteres.");
        }
    }
    
    // Regex Email
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    const emailTest = lead.email ? lead.email.trim().toLowerCase() : '';
    if (!lead.email || typeof lead.email !== 'string' ||
         lead.email.trim() === '' || !emailRegex.test(emailTest)) {
        erros.push("Email é obrigatório e deve ser válido.");
    }
    
    // Regex Telefone
    const telefoneRegex = /^\(?([0-9]{2})\)?\s?9?([0-9]{4})-?([0-9]{4})$/;
    const telefoneTest = lead.telefone ? lead.telefone.trim().replace(/\s/g, '') : '';
    if (!lead.telefone || typeof lead.telefone !== 'string' ||
         lead.telefone.trim() === '' || !telefoneRegex.test(telefoneTest)) {
        erros.push("Telefone é obrigatório e deve ser válido (formato brasileiro).");
    }
    
    // Validação Nome
    if (!lead.nome || typeof lead.nome !== 'string' ||
         lead.nome.trim() === '' || lead.nome.trim().length < 3) {
        erros.push("Nome é obrigatório e deve ter pelo menos 3 caracteres.");
    }

    return erros;
}

function validarLead(lead) {
    const erros = validarEtapa1(lead);
    
    if (!lead.perguntaChecagem || lead.perguntaChecagem.trim().length < 3) {
        erros.push("Responda a pergunta de checagem corretamente.");
    }
    if (lead.adesao !== true) {
        erros.push("É necessário concordar com o Termo de Adesão.");
    }
    if (lead.LGPD !== true) {
        erros.push("É necessário autorizar o uso dos dados (LGPD).");
    }
    return erros;
}

// Handler Assíncrono para Etapa 1
async function handleValidarEtapa1(req, res) {
    const { nome, email, telefone, perfil, empresa, cargo } = req.body;
    const leadEtapa1 = { nome, email, telefone, perfil, empresa, cargo };
    
    const erros = validarEtapa1(leadEtapa1);

    if (erros.length > 0) {
        return res.status(400).json({ erros });
    }

    try {
        if (email) {
            const emailExiste = await Lead.findOne({ email: email });
            if (emailExiste) erros.push("Este e-mail já está participando da promoção.");
        }
        if (telefone) {
            const telExiste = await Lead.findOne({ telefone: telefone });
            if (telExiste) erros.push("Este telefone já está cadastrado.");
        }
    } catch (err) {
        return res.status(500).json({ mensagem: 'Erro ao validar duplicidade.' });
    }

    if (erros.length > 0) {
        return res.status(400).json({ erros });
    }

    return res.status(200).json({ mensagem: "Etapa 1 válida. Pode prosseguir." });
}

// ==========================================
// 4. ROTAS API)
// ==========================================

// Rota Home
app.get('/', (req, res) => {
    res.json({ status: "API Online 🚀", banco: isConnected ? "Conectado" : "Desconectado" });
});

// Criar Lead
app.post('/leads', async (req, res) => {
    const erros = validarLead(req.body);
    if (erros.length > 0) {
        return res.status(400).json({ mensagem : 'Erro de validação', erros: erros });
    }

    try{
        const lead = new Lead({
            nome: req.body.nome,
            perfil: req.body.perfil,
            empresa: req.body.empresa,
            cargo: req.body.cargo,
            email: req.body.email,
            telefone: req.body.telefone,
            perguntaChecagem: req.body.perguntaChecagem,
            perguntaGeral: req.body.perguntaGeral,
            adesao: !!req.body.adesao,
            LGPD: !!req.body.LGPD
        });

        const novoLead = await lead.save();
        res.status(201).json(novoLead);
    } catch(error){
        res.status(500).json({ mensagem: error.message });
    }
});

// Listar Leads
app.get('/leads', async (req, res) => {
    try{
        const leads = await Lead.find().sort({ dataCadastro: -1 });
        res.status(200).json(leads);
    } catch(error){
        res.status(500).json({ mensagem: error.message });
    }
});

// Deletar Lead
app.delete('/leads/:id', async (req, res) => {
    try{
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ mensagem: 'ID inválido' });
        }
        const leadRemovido = await Lead.findByIdAndDelete(id);
        if (!leadRemovido) {
            return res.status(404).json({ mensagem: 'Lead não encontrado' });
        }
        res.json({ mensagem: 'Lead removido com sucesso', lead: leadRemovido });
    } catch(error){
        res.status(500).json({ mensagem: error.message });
    }   
});

// Validação Etapa 1
app.post('/leads/validar-etapa1', (req, res) => handleValidarEtapa1(req, res));
app.post('/validar-etapa-1', (req, res) => handleValidarEtapa1(req, res));

// Inicialização Local
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server Started at ${PORT}`);
    });
}

module.exports = app;