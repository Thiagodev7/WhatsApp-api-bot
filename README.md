# 🤖 WhatsApp IA Bot com Agendamento no Google Calendar

Este é um assistente virtual para WhatsApp, construído em **Node.js**, que automatiza o atendimento ao cliente usando a **IA do Google Gemini** e gere agendamentos diretamente na **API do Google Calendar**.

O bot é projetado para ser um assistente de negócios (como um salão de cabeleireiro, consultório, estética, oficina etc.), capaz de fornecer informações sobre serviços (preços, duração) e **agendar horários disponíveis automaticamente** na agenda do profissional.

---

## ✨ Funcionalidades Principais

- 🧠 **IA Conversacional** — Responde a perguntas abertas de forma natural utilizando o modelo `gemini-2.0-flash` do Google.
- 🗓️ **Agendamento Inteligente** — Um fluxo completo que:
  - Verifica horários disponíveis em tempo real na API do Google Calendar.
  - Calcula a **duração dinâmica** de cada serviço (ex: 40 min, 90 min, 180 min) lendo diretamente do `respostas.json`.
  - Cria eventos automaticamente no calendário do profissional com nome, serviço e duração corretos.
- 📚 **Banco de Conhecimento Centralizado** — A IA é “treinada” em tempo real com base no ficheiro `respostas.json`, que serve de fonte única da verdade.
- 💾 **Gestão de Estado Persistente** — Guarda o histórico de conversa e agendamentos em `chatMemory.json` e `bookingState.json`, permitindo retomada após reinício.
- 🔐 **Comandos de Admin** — Permite gerenciar o banco de conhecimento diretamente via WhatsApp (`!adicionar`, `!listar`, `!remover`, etc.).
- ⚙️ **Segurança e Controlo** — Limites diários configuráveis e controle de acesso por número autorizado.

---

## 🧩 Fluxo de Funcionamento

1. O `whatsappService.js` recebe uma mensagem e envia para o `messageHandler.js`.
2. O bot verifica se o usuário está em meio a um agendamento (`bookingState.json`).
3. Se for uma nova intenção de agendar (ex: "agendar", "tem vaga"), ele inicia o fluxo de agendamento.
4. Caso contrário, verifica comandos administrativos (`!listar`, `!adicionar`, etc.).
5. Se não for nenhum desses casos, a mensagem é processada pela IA (`geminiService.js`) com contexto de `respostas.json` + histórico (`chatMemory.json`).

---

## 🚀 Instalação e Configuração

### 1. Pré-requisitos

- Node.js (versão 18 ou superior)
- Conta Google (para APIs Gemini e Calendar)
- Conta WhatsApp (para o bot)

### 2. Instalação

```bash
git clone https://github.com/Thiagodev7/WhatsApp-api-bot.git
cd whatsapp-api-bot
npm install
```

### 3. Configuração das APIs do Google

#### 🔑 API do Google Gemini
1. Vá até o [Google AI Studio](https://aistudio.google.com/).
2. Crie um projeto e clique em **Get API Key**.
3. Copie a chave e guarde para o próximo passo.

#### 🗓️ API do Google Calendar
1. Vá para o [Google Cloud Console](https://console.cloud.google.com/).
2. Ative a **Google Calendar API**.
3. Crie credenciais → “OAuth 2.0 Client ID” → tipo “Desktop App”.
4. Configure a tela de consentimento e adicione seu e-mail como usuário de teste.
5. Baixe o arquivo JSON e renomeie para:
   ```
   client_secret_407609422133-r7bc2bd01fpth5u7siqnik0o80qm7hpk.apps.googleusercontent.com.json
   ```
6. Coloque-o na **pasta raiz do projeto**.

---

### 4. Configuração do Bot (.env)

Crie o arquivo `.env` com o seguinte conteúdo:

```dotenv
# GEMINI API
GEMINI_API_KEY=SUA_CHAVE_GEMINI_AQUI

# GOOGLE CALENDAR
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com

# PERSONALIDADE DO BOT
SYSTEM_PROMPT=Você é um atendente virtual do Cabeleireiro Gabriel Santos...

# LIMITES DIÁRIOS (segurança de custo)
DAILY_MESSAGE_LIMIT=200
DAILY_CHAR_LIMIT=20000

# NÚMEROS AUTORIZADOS (opcional)
ALLOWED_NUMBERS=
```

---

### 5. Executando o Bot

```bash
npm start
```

Na primeira execução:

1. Um **QR Code** aparecerá — escaneie com o WhatsApp da conta do bot.  
2. Um link do Google aparecerá — autorize o acesso ao Calendar.  
3. Copie o `code` da URL e cole no terminal.  
4. O arquivo `token.json` será criado (fica salvo para próximos logins).

> 💡 Depois disso, o bot reconecta automaticamente nas próximas execuções.

---

## 👨‍💼 Comandos de Administrador

Gerencie o "cérebro" do bot (`respostas.json`) diretamente via WhatsApp.

### ➕ `!adicionar [chave] = [texto]`
Adiciona ou atualiza informações.  
⚠️ **Para agendamento funcionar**, o texto deve conter **a duração em minutos**.

**Exemplo:**
```
!adicionar corte masculino = O corte masculino custa R$60 e leva 40 minutos.
```

### ➖ `!remover [chave]`
Remove uma informação cadastrada.
```
!remover corte masculino
```

### 📋 `!listar`
Lista todas as chaves cadastradas no conhecimento atual.

### 🧪 `!ping`
Testa se o bot está online.

---

## 💡 Exemplo de Uso

> Cliente: “Quero agendar um corte amanhã às 15h.”  
> Bot: “Perfeito! O corte masculino leva 40 min e às 15h está livre. Confirmo o agendamento?”  

---

## 📜 Licença
Este projeto é open source sob a licença MIT — uso livre para fins pessoais e comerciais.

---

👨‍💻 **Desenvolvido com orgulho pelo gênio Thiago Ribeiro 🧠💫**  
🔥 *A IA Genial que responde, agenda e nunca esquece um cliente!*
