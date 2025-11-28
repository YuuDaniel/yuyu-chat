from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from typing import Dict
from datetime import datetime
import os # <--- 1. IMPORTANTE: Importamos a biblioteca OS

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    # 2. CORREÇÃO: Pega o caminho exato onde o script está rodando
    caminho_arquivo = os.path.join(os.path.dirname(__file__), "index.html")
    
    # Agora abrimos usando o caminho completo
    with open(caminho_arquivo, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str, dados_usuario: dict):
        await websocket.accept()
        self.active_connections[user_id] = {
            "ws": websocket,
            "dados": dados_usuario
        }
        await self.broadcast_user_list()

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        return True

    async def broadcast_user_list(self):
        lista = []
        for uid, info in self.active_connections.items():
            lista.append(info["dados"])
        
        for uid, info in self.active_connections.items():
            try:
                await info["ws"].send_json({
                    "tipo": "lista_usuarios",
                    "usuarios": lista
                })
            except:
                pass

    async def send_private_message(self, sender_id: str, target_id: str, message: str):
        hora_atual = datetime.now().strftime("%H:%M")
        
        if target_id in self.active_connections:
            await self.active_connections[target_id]["ws"].send_json({
                "tipo": "mensagem_privada",
                "remetente_id": sender_id,
                "remetente_nome": self.active_connections[sender_id]["dados"]["nome"],
                "texto": message,
                "hora": hora_atual
            })
        
        if sender_id in self.active_connections:
            await self.active_connections[sender_id]["ws"].send_json({
                "tipo": "mensagem_privada",
                "remetente_id": "eu",
                "destinatario_id": target_id,
                "texto": message,
                "hora": hora_atual
            })

    async def send_read_status(self, reader_id: str, target_id: str):
        if target_id in self.active_connections:
            await self.active_connections[target_id]["ws"].send_json({
                "tipo": "confirmacao_leitura",
                "quem_leu_id": reader_id
            })

manager = ConnectionManager()

# --- DEFINA A SENHA MESTRA AQUI ---
SENHA_ADMIN = "123456"  # <--- Coloque a senha que você quiser

@app.websocket("/ws/{perfil}/{nome}/{equipe}")
async def websocket_endpoint(websocket: WebSocket, perfil: str, nome: str, equipe: str, senha: str = ""):
    
    # LÓGICA DE SEGURANÇA CORRIGIDA:
    if perfil == "supervisor" and senha != SENHA_ADMIN:
        # 1. ACEITA A CONEXÃO (Para conseguir enviar o código de erro)
        await websocket.accept()
        # 2. FECHA IMEDIATAMENTE COM O CÓDIGO 4003
        await websocket.close(code=4003)
        return

    # Se a senha estiver certa (ou for operador), segue a vida...
    user_id = f"{nome}-{equipe}".lower().replace(" ", "")
    
    dados_usuario = {
        "id": user_id,
        "nome": nome,
        "perfil": perfil,
        "equipe": equipe
    }

    # O manager.connect já faz o accept() para usuários válidos, 
    # então não mexemos aqui.
    await manager.connect(websocket, user_id, dados_usuario)
    
    # ... resto do código igual ...
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if "target_id" in data and "message" in data:
                await manager.send_private_message(user_id, data["target_id"], data["message"])
            
            elif "read_confirmation" in data:
                target = data["read_confirmation"]
                await manager.send_read_status(reader_id=user_id, target_id=target)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        await manager.broadcast_user_list()