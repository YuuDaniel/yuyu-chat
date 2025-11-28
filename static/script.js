let ws;
let meuId = "";
let meuPerfil = "";
let minhaEquipe = "";
let chatsAbertos = {};

const notificacaoAudio = new Audio('/static/sounds/notification-sound-effect-372475.mp3');

// --- AO CARREGAR A PÁGINA: Verifica Login e Limpa Msg Antiga ---
window.onload = function() {
    verificarLoginAutomatico();
    limparHistoricoAntigo();
};

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
}

function toggleSenha() {
    const perfil = document.getElementById('perfil').value;
    const divSenha = document.getElementById('div-senha');
    
    if (perfil === 'supervisor') {
        divSenha.style.display = 'block';
    } else {
        divSenha.style.display = 'none';
        document.getElementById('senha-input').value = ""; 
    }
}

// --- SISTEMA DE LOGIN PERSISTENTE ---
function verificarLoginAutomatico() {
    const salvo = localStorage.getItem("yuyu_user_data");
    if (salvo) {
        const dados = JSON.parse(salvo);
        // Preenche os campos (escondido) para a lógica funcionar
        document.getElementById('nome').value = dados.nome;
        document.getElementById('perfil').value = dados.perfil;
        document.getElementById('equipe').value = dados.equipe;
        if(dados.senha) document.getElementById('senha-input').value = dados.senha;
        
        // Conecta direto
        conectar(true);
    }
}

function conectar(auto = false) {
    const nome = document.getElementById('nome').value.trim();
    meuPerfil = document.getElementById('perfil').value;
    minhaEquipe = document.getElementById('equipe').value;
    let senha = "";

    if(!nome || !minhaEquipe) {
        if(!auto) alert("Preencha todos os campos!");
        return;
    }

    if (meuPerfil === 'supervisor') {
        senha = document.getElementById('senha-input').value;
        if (!senha && !auto) return alert("Digite a senha de supervisor.");
    }

    // SALVA NO NAVEGADOR (Para o F5 funcionar)
    const dadosSalvar = { nome, perfil: meuPerfil, equipe: minhaEquipe, senha };
    localStorage.setItem("yuyu_user_data", JSON.stringify(dadosSalvar));

    const equipeSegura = encodeURIComponent(minhaEquipe);
    const nomeSeguro = encodeURIComponent(nome);
    
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws/${meuPerfil}/${nomeSeguro}/${equipeSegura}?senha=${senha}`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        
        document.getElementById('welcome-msg').innerText = `Olá, ${nome}`;
        document.getElementById('welcome-team').innerText = `${meuPerfil.toUpperCase()} - ${minhaEquipe}`;
        
        const titulo = document.getElementById('list-title');
        titulo.innerText = meuPerfil === 'supervisor' ? "Painel de Operadores Online" : "Supervisores Disponíveis";
    };

    ws.onclose = (event) => {
        // Se o servidor fechou com o código 4003, é senha errada
        if (event.code === 4003) {
            alert("SENHA INCORRETA! Acesso negado.");
            logout(); // Isso limpa os dados salvos e recarrega a página para tentar de novo
        } 
        else {
            console.log("Conexão perdida. Reconectando...");
            // Só tenta reconectar se NÃO foi erro de senha
            setTimeout(() => conectar(true), 5000);
        }
    };

    ws.onmessage = (event) => {
        const dados = JSON.parse(event.data);
        if (dados.tipo === "lista_usuarios") {
            atualizarListaUsuarios(dados.usuarios);
        } 
        else if (dados.tipo === "mensagem_privada") {
            receberMensagem(dados);
        }
        else if (dados.tipo === "confirmacao_leitura") {
            marcarMensagensComoLidas(dados.quem_leu_id);
        }
    };
}

function logout() {
    // 1. Remove os dados de login (Nome, Senha, Equipe)
    localStorage.removeItem("yuyu_user_data");
    
    // 2. Opcional: Se quiser limpar as mensagens ao sair, descomente a linha abaixo.
    // Mas para manter o histórico de 24h, deixe comentado ou apagado.
    // localStorage.removeItem("yuyu_chat_history");

    // 3. Recarrega a página (agora sem dados, vai cair na tela de login)
    window.location.reload();
}

function atualizarListaUsuarios(usuarios) {
    const grid = document.getElementById('user-grid');
    grid.innerHTML = "";
    
    usuarios.sort((a, b) => {
        if (a.equipe === minhaEquipe && b.equipe !== minhaEquipe) return -1;
        if (a.equipe !== minhaEquipe && b.equipe === minhaEquipe) return 1;
        return 0;
    });

    usuarios.forEach(user => {
        if (user.id === meuId) return; 

        let mostrar = false;
        if (meuPerfil === 'supervisor') mostrar = true; 
        else if (user.perfil === 'supervisor') mostrar = true;

        if (mostrar) {
            const card = document.createElement('div');
            card.className = 'user-card online';
            const isMinhaEquipe = (user.equipe === minhaEquipe);
            const destaqueIcon = isMinhaEquipe ? "⭐" : "";
            if(isMinhaEquipe) card.style.borderColor = "var(--primary)";

            card.innerHTML = `
                <div class="card-header"><span class="card-name">${destaqueIcon} ${user.nome}</span></div>
                <div class="badges">
                    <span class="badge" style="font-weight:bold;">${user.equipe}</span>
                    <span class="badge" style="font-style:italic;">${user.perfil}</span>
                </div>
            `;
            card.onclick = () => abrirPopup(user.id, user.nome);
            grid.appendChild(card);
        }
        if (user.nome === document.getElementById('nome').value.trim() && user.equipe === minhaEquipe) {
            meuId = user.id;
        }
    });
}

// --- SISTEMA DE POPUP (Minimizar + Histórico) ---

function abrirPopup(targetId, targetName) {
    // Se já está aberto, restaura (desminimiza)
    if (chatsAbertos[targetId]) {
        const popup = chatsAbertos[targetId];
        popup.classList.remove('minimized'); // Garante que abre
        const input = popup.querySelector('input');
        if(input) {
            input.focus();
            enviarConfirmacaoLeitura(targetId);
        }
        return;
    }

    const container = document.getElementById('popups-container');
    const popup = document.createElement('div');
    popup.className = 'chat-popup';
    popup.id = `popup-${targetId}`;

    popup.innerHTML = `
        <div class="popup-header">
            <span>${targetName}</span>
            <button class="close-btn">×</button>
        </div>
        <div class="popup-body" id="msgs-${targetId}"></div>
        <div class="popup-footer">
            <input type="text" placeholder="Digite uma mensagem..." 
                onkeypress="handleEnter('${targetId}', event)"
                onfocus="enviarConfirmacaoLeitura('${targetId}')"
                onclick="enviarConfirmacaoLeitura('${targetId}')"
            >
        </div>
    `;

    // LÓGICA DE CLIQUE NO HEADER (Minimizar vs Fechar)
    const header = popup.querySelector('.popup-header');
    const closeBtn = popup.querySelector('.close-btn');

    // 1. Botão Fechar
    closeBtn.onclick = (e) => {
        e.stopPropagation(); // Impede que o clique passe para o header (evita minimizar ao fechar)
        fecharPopup(targetId);
    };

    // 2. Clicar no Header (Minimizar/Restaurar)
    header.onclick = () => {
        popup.classList.toggle('minimized');
    };

    container.appendChild(popup);
    chatsAbertos[targetId] = popup;

    // CARREGA HISTÓRICO LOCAL
    carregarHistoricoLocal(targetId);
    
    enviarConfirmacaoLeitura(targetId);
}

function fecharPopup(targetId) {
    const popup = chatsAbertos[targetId];
    if (popup) {
        popup.remove();
        delete chatsAbertos[targetId];
    }
}

function handleEnter(targetId, event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const texto = input.value.trim();
        
        if (texto) {
            const dadosMsg = {
                target_id: targetId,
                message: texto
            };
            ws.send(JSON.stringify(dadosMsg));
            
            input.value = "";
            input.focus();
        }
    }
}

function enviarConfirmacaoLeitura(targetId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ read_confirmation: targetId }));
    }
}

function marcarMensagensComoLidas(leitorId) {
    const bodyChat = document.getElementById(`msgs-${leitorId}`);
    if (bodyChat) {
        const checks = bodyChat.querySelectorAll('.msg-check');
        checks.forEach(check => check.classList.add('lido'));
    }
}

// --- HISTÓRICO E MENSAGENS ---

function receberMensagem(dados) {
    let idConversa = (dados.remetente_id === "eu") ? dados.destinatario_id : dados.remetente_id;
    let classeCss = (dados.remetente_id === "eu") ? "enviada" : "recebida";
    
    // Salva no LocalStorage
    salvarMensagemLocal(idConversa, {
        texto: dados.texto,
        classe: classeCss,
        hora: dados.hora,
        timestamp: new Date().getTime() // Para controlar as 24h
    });

    // Se for recebida, toca som e abre popup
    if (classeCss === "recebida") {
        notificacaoAudio.play().catch(() => {});
        if (!chatsAbertos[idConversa]) {
            abrirPopup(idConversa, dados.remetente_nome);
        } else {
            // Se estiver minimizado e receber msg, pode querer dar um destaque (opcional)
            // chatsAbertos[idConversa].classList.remove('minimized'); // Descomente se quiser que abra sozinho
            setTimeout(() => enviarConfirmacaoLeitura(idConversa), 500);
        }
    }

    renderizarMensagem(idConversa, dados.texto, classeCss, dados.hora);
}

function renderizarMensagem(idConversa, texto, classe, hora) {
    const bodyChat = document.getElementById(`msgs-${idConversa}`);
    if (bodyChat) {
        const balao = document.createElement('div');
        balao.className = `msg ${classe}`;
        balao.innerHTML = `
            <span>${texto}</span>
            <div class="msg-meta">
                <span>${hora}</span>
                <span class="msg-check">✓✓</span>
            </div>
        `;
        bodyChat.appendChild(balao);
        bodyChat.scrollTop = bodyChat.scrollHeight;
    }
}

// -- FUNÇÕES DE ARMAZENAMENTO LOCAL (HISTÓRICO) --
function salvarMensagemLocal(idConversa, msgObj) {
    // Pega o histórico atual ou cria vazio
    let historico = JSON.parse(localStorage.getItem("yuyu_chat_history")) || {};
    
    if (!historico[idConversa]) {
        historico[idConversa] = [];
    }
    
    historico[idConversa].push(msgObj);
    localStorage.setItem("yuyu_chat_history", JSON.stringify(historico));
}

function carregarHistoricoLocal(idConversa) {
    let historico = JSON.parse(localStorage.getItem("yuyu_chat_history")) || {};
    if (historico[idConversa]) {
        historico[idConversa].forEach(msg => {
            renderizarMensagem(idConversa, msg.texto, msg.classe, msg.hora);
        });
    }
}

function limparHistoricoAntigo() {
    let historico = JSON.parse(localStorage.getItem("yuyu_chat_history"));
    if (!historico) return;

    const agora = new Date().getTime();
    const umDia = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

    for (let idConv in historico) {
        // Filtra mantendo apenas as mensagens com menos de 24h
        historico[idConv] = historico[idConv].filter(msg => {
            return (agora - msg.timestamp) < umDia;
        });
        
        // Se a conversa ficar vazia, deleta a chave
        if (historico[idConv].length === 0) {
            delete historico[idConv];
        }
    }
    
    localStorage.setItem("yuyu_chat_history", JSON.stringify(historico));
}