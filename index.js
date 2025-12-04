require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors());

let isConnected = false; // Variável global para cache da conexão

async function connectToDatabase() {
  // Se já estiver conectado, reutiliza a conexão
  if (isConnected) {
    return;
  }

  // Se não, conecta agora
  console.log('=> Criando nova conexão com o MongoDB...');
  
  if (!process.env.DB_CONNECTION_STRING) {
     throw new Error('DB_CONNECTION_STRING não definida no .env!');
  }

  try {
    const db = await mongoose.connect(process.env.DB_CONNECTION_STRING, {
      serverSelectionTimeoutMS: 5000, // Timeout curto para não travar a Vercel
    });
    
    isConnected = db.connections[0].readyState;
    console.log('=> Conectado ao MongoDB!');
  } catch (error) {
    console.error('=> Erro fatal na conexão:', error);
    throw error; // Lança o erro para a rota tratar
  }
}

// Middleware que garante a conexão ANTES de qualquer rota
app.use(async (req, res, next) => {
    // Pula conexão para rotas de "ping" ou arquivos estáticos se houver
    if (req.path === '/') return next(); 

    try {
        await connectToDatabase();
        next(); // Se conectou, segue para a rota (validar-etapa1, leads, etc)
    } catch (error) {
        res.status(503).json({ 
            error: "Erro de conexão com o banco de dados",
            details: error.message 
        });
    }
});

// Definindo o esquema do Lead
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

const Lead = mongoose.model('Lead', LeadSchema);

// -- Função para validações da Etapa 1 --
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
    
    // Expressão para validar email (más robusta - RFC 5322 simplificado)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const emailTest = lead.email ? lead.email.trim().toLowerCase() : '';
    if (!lead.email || typeof lead.email !== 'string' ||
         lead.email.trim() === '' || !emailRegex.test(emailTest)) {
        erros.push("Email é obrigatório e deve ser válido.");
    }
    
    // Expressão para validar telefone (formato brasileiro - flexível)
    // Aceita: (11) 99999-9999, 11999999999, 11 99999-9999, (11) 9 9999-9999, etc
    const telefoneRegex = /^\(?([0-9]{2})\)?\s?9?([0-9]{4})-?([0-9]{4})$/;
    const telefoneTest = lead.telefone ? lead.telefone.trim().replace(/\s/g, '') : '';
    if (!lead.telefone || typeof lead.telefone !== 'string' ||
         lead.telefone.trim() === '' || !telefoneRegex.test(telefoneTest)) {
        erros.push("Telefone é obrigatório e deve ser válido (formato brasileiro).");
    }
    
    // Validação do nome
    if (!lead.nome || typeof lead.nome !== 'string' ||
         lead.nome.trim() === '' || lead.nome.trim().length < 3) {
        erros.push("Nome é obrigatório e deve ter pelo menos 3 caracteres.");
    }

    return erros;
}

// -- Função para validações completas --
function validarLead(lead) {
    const erros = validarEtapa1(lead);
    
    // Validação da Pergunta de Checagem (Anti-bot simples)
    if (!lead.perguntaChecagem || lead.perguntaChecagem.trim().length < 3) {
        erros.push("Responda a pergunta de checagem corretamente.");
    }

    // Validação dos checkboxes obrigatórios
    if (lead.adesao !== true) {
        erros.push("É necessário concordar com o Termo de Adesão.");
    }
    if (lead.LGPD !== true) {
        erros.push("É necessário autorizar o uso dos dados (LGPD).");
    }

    return erros;
}

//                                          --- Rotas ---
// Post para criar um novo lead
app.post('/leads', ensureDbConnected, async (req, res) => {
    // Validação antes de tentar salvar
    const erros = validarLead(req.body);

    if (erros.length > 0) {
        return res.status(400).json({ mensagem : 'Erro de validação', erros: erros });
    }

    try{
        // Cria o documento com todos os campos esperados pelo schema
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
        // Envia mensagem de erro com mais detalhes para depuração
        res.status(500).json({ mensagem: error.message });
    }
});

// Get para listar todos os leads
app.get('/leads', ensureDbConnected, async (req, res) => {
    try{
        const leads = await Lead.find().sort({ dataCadastro: -1 }); // Ordena por data de cadastro decrescente
        res.status(200).json(leads);
    } catch(error){
        res.status(500).json({ mensagem: error.message });
    }
})

// Delete para remover um lead pelo ID
app.delete('/leads/:id', ensureDbConnected, async (req, res) => {
    try{
        const id = req.params.id;
        
        // Validar se é um ObjectId válido
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

// Validar dados da Etapa 1 (antes de avançar)
// Handler reutilizável para validação da etapa 1
async function handleValidarEtapa1(req, res) {
    const { nome, email, telefone, perfil, empresa, cargo } = req.body;
    
    // Cria objeto apenas com os campos da etapa 1
    const leadEtapa1 = { nome, email, telefone, perfil, empresa, cargo };
    
    // Valida os campos da etapa 1
    const erros = validarEtapa1(leadEtapa1);

    if (erros.length > 0) {
        return res.status(400).json({ erros });
    }

    // Validação de Duplicidade
    try {
        if (email) {
            const emailExiste = await Lead.findOne({ email: email });
            if (emailExiste) {
                erros.push("Este e-mail já está participando da promoção.");
            }
        }

        if (telefone) {
            const telExiste = await Lead.findOne({ telefone: telefone });
            if (telExiste) {
                erros.push("Este telefone já está cadastrado.");
            }
        }
    } catch (err) {
        // Se ocorrer erro ao consultar o DB, retorna 500 com mensagem clara
        return res.status(500).json({ mensagem: 'Erro ao validar duplicidade. Tente novamente mais tarde.' });
    }

    // Se houver erros de duplicidade, retorna
    if (erros.length > 0) {
        return res.status(400).json({ erros });
    }

    // Se passou por tudo, retorna sucesso
    return res.status(200).json({ mensagem: "Etapa 1 válida. Pode prosseguir." });
}

app.post('/leads/validar-etapa1', ensureDbConnected, (req, res) => handleValidarEtapa1(req, res));

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

module.exports = app;
