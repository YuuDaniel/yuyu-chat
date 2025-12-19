from ldap3 import Server, Connection, ALL, SIMPLE

# --- CONFIGURAÇÕES ---
AD_SERVER_IP = '172.16.0.7' 
AD_DOMAIN = 'cobrart.lan'

def autenticar_ad(usuario, senha):
    print(f"--- LOGIN DE: {usuario} ---")
    
    # 1. Limpeza do nome de usuário
    if '\\' in usuario:
        user_short = usuario.split('\\')[1]
    elif '@' in usuario:
        user_short = usuario.split('@')[0]
    else:
        user_short = usuario.strip()

    # 2. Login usando User Principal Name (UPN)
    user_login_simple = f"{user_short}@{AD_DOMAIN}"

    try:
        # Conecta no servidor
        server = Server(AD_SERVER_IP, get_info=ALL)
        conn = Connection(server, user=user_login_simple, password=senha, authentication=SIMPLE, auto_bind=True)
        
        # 3. Busca os dados do usuário
        base_dn = 'dc=' + AD_DOMAIN.replace('.', ',dc=')
        filtro = f'(sAMAccountName={user_short})'
        
        # Buscamos o 'entry_dn' (Distinguished Name) que é o caminho da pasta
        conn.search(base_dn, filtro, attributes=['displayName', 'department'])
        
        # --- DEFINIÇÃO DE PERFIL ---
        nome_real = user_short
        equipe = "Geral"
        
        # LÓGICA PADRÃO: Todo mundo é Supervisor (T.I., RH, etc.)
        perfil = "supervisor" 

        if conn.entries:
            entry = conn.entries[0]
            
            if entry.displayName: nome_real = str(entry.displayName)
            if entry.department: equipe = str(entry.department)
            
            # --- Verificar o Caminho (DN) ---
            # O DN retorna algo como: CN=Joao,OU=Acionadores,OU=Operacao,DC=cobrart...
            caminho_completo = str(entry.entry_dn).lower()
            
            print(f"DEBUG -> Caminho encontrado: {caminho_completo}")

            # Verificamos se "ou=acionadores" existe dentro desse caminho
            if "ou=acionadores" in caminho_completo:
                perfil = "operador"
                print("--> DIAGNÓSTICO: Usuário está na pasta ACIONADORES. Perfil: OPERADOR")
            else:
                perfil = "supervisor"
                print("--> DIAGNÓSTICO: Usuário NÃO está na pasta Acionadores. Perfil: SUPERVISOR")

        return {
            "sucesso": True,
            "nome": nome_real,
            "equipe": equipe,
            "perfil": perfil
        }

    except Exception as e:
        print(f"ERRO DE LOGIN: {e}")
        return {"sucesso": False}