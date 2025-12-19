from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel # Para receber o JSON do login
from typing import Dict
from datetime import datetime
import os

# IMPORTA O ARQUIVO NOVO
from ad_auth import autenticar_ad
from logger import salvar_log_conversa 

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- MODELO DE DADOS PARA O LOGIN ---
class LoginData(BaseModel):
    usuario: str
    senha: str

@app.get("/")
async def get():
    caminho_arquivo = os.path.join(os.path.dirname(__file__), "index.html")
    with open(caminho_arquivo, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# --- NOVA ROTA DE LOGIN (HTTP) ---

@app.post("/login")
async def login_endpoint(dados: LoginData):
    """
    Recebe usuario e senha, valida no AD e retorna o perfil correto.
    """
    # 1. Tenta autenticar no Active Directory
    resultado = autenticar_ad(dados.usuario, dados.senha)
    
    if resultado and resultado['sucesso']:
        return {
            "sucesso": True,
            "nome": resultado['nome'],
            "equipe": resultado['equipe'],
            "perfil": resultado['perfil'] # Supervisor ou Operador (Vindo do AD)
        }
    else:
        # Se falhar no AD, nega o acesso
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

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

@app.websocket("/ws/{perfil}/{nome}/{equipe}")
async def websocket_endpoint(websocket: WebSocket, perfil: str, nome: str, equipe: str):
    
    user_id = f"{nome}-{equipe}".lower().replace(" ", "")
    
    dados_usuario = {
        "id": user_id,
        "nome": nome, # Esse é o nome real que veio do AD
        "perfil": perfil,
        "equipe": equipe
    }

    await manager.connect(websocket, user_id, dados_usuario)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if "target_id" in data and "message" in data:
                # 1. Envia a mensagem (Sua lógica atual)
                await manager.send_private_message(user_id, data["target_id"], data["message"])
                
                # 2. SALVA O LOG (NOVO)
                # Passamos: Quem enviou (Nome Real), Para quem (ID), e o Texto
                salvar_log_conversa(nome, data["target_id"], data["message"])
            
            elif "read_confirmation" in data:
                target = data["read_confirmation"]
                await manager.send_read_status(reader_id=user_id, target_id=target)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
        await manager.broadcast_user_list()