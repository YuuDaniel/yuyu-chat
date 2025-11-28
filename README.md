# ✉︎ Yuzu Chat - Comunicação Interna

Sistema de chat em tempo real desenvolvido para facilitar a comunicação entre Supervisores e Operadores de Call Center, eliminando a necessidade de deslocamento físico.

![Status](https://img.shields.io/badge/Status-Concluído-green)

## Funcionalidades

- **Chat em Tempo Real:** Comunicação instantânea via WebSocket.
- **Hierarquia de Acesso:**
  - **Operadores:** Veem apenas os supervisores online.
  - **Supervisores:** Veem toda a equipe e operadores.
- **Login Seguro:** Senha exigida apenas para nível Supervisor.
- **Interface:** Dark Mode, Notificações Sonoras e Visuais.
- **Histórico Local:** Mensagens salvas no navegador por 24 horas.

## Tecnologias Utilizadas

- **Backend:** Python (FastAPI, Uvicorn).
- **Frontend:** HTML5, CSS3, JavaScript (Vanilla).
- **Protocolo:** WebSocket.

## Como Rodar o Projeto

1. **Clone o repositório:**
   ```bash
   git clone [https://github.com/SEU-USUARIO/yuyu-chat.git](https://github.com/SEU-USUARIO/yuyu-chat.git)